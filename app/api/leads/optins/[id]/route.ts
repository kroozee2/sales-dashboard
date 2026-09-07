import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { ghlSend, ghlContactIdentity } from "@/lib/ghl-inbox";

// Actions on a New Leads opt-in. The rows come live from GoHighLevel and are
// not leads-table records, so:
//
//   PATCH  sets a pipeline stage. The first stage change is what turns an
//          opt-in into a real lead, so the row is created here if it doesn't
//          exist yet, matched on the GHL contact id then email.
//   POST   sends the person an SMS or email through GoHighLevel.
//
// The send mirrors the Hot list's safeguards, because the failure mode is
// messaging the wrong person: the caller confirms the destination it displayed,
// that is checked against GoHighLevel's own record, and an audit row is written
// BEFORE sending so an uncertain outcome can never look like "safe to resend".

export const runtime = "nodejs";

const STAGES = new Set([
  "🔗 Pay Link Sent", "🔥 Hot Prospect", "📞 Call Booked",
  "📣 Reached Out", "👨 Prospect", "🏦 Payment Received",
]);
const CHANNELS = new Set(["SMS", "Email"]);

const normalize = (channel: string, v: string | null) =>
  !v ? "" : channel === "Email" ? v.trim().toLowerCase() : v.replace(/\D/g, "");

async function findLead(db: ReturnType<typeof createLeadsAdminClient>, contactId: string, email: string | null) {
  const byContact = await db.from("leads").select("id, email, phone, prospect_stage").eq("ghl_contact_id", contactId).maybeSingle();
  if (byContact.data) return byContact.data;
  if (!email) return null;
  const byEmail = await db.from("leads").select("id, email, phone, prospect_stage").ilike("email", email).maybeSingle();
  return byEmail.data ?? null;
}

// PATCH — set the pipeline stage, creating the lead on first use.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: contactId } = await params;
  const body = (await req.json().catch(() => ({}))) as { stage?: string; name?: string; email?: string; phone?: string; source?: string; opted_in_at?: string };
  const stage = body.stage ?? "";
  if (!STAGES.has(stage)) return NextResponse.json({ error: "Unknown pipeline stage" }, { status: 400 });

  const db = createLeadsAdminClient();
  const existing = await findLead(db, contactId, body.email ?? null);

  if (existing) {
    const { data, error } = await db.from("leads")
      .update({ prospect_stage: stage, ghl_contact_id: contactId, last_update: new Date().toISOString() })
      .eq("id", existing.id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, lead_id: existing.id, created: false, stage, lead: data });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "This opt-in has no name to create a lead from." }, { status: 400 });
  const { data, error } = await db.from("leads").insert({
    id: crypto.randomUUID(),
    full_name: name,
    email: body.email ?? null,
    phone: body.phone ?? null,
    prospect_stage: stage,
    // Where they opted in, so the lead keeps the context the feed showed.
    source: body.source ?? null,
    ghl_contact_id: contactId,
    created_at: body.opted_in_at ?? new Date().toISOString(),
    last_update: new Date().toISOString(),
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lead_id: data.id, created: true, stage, lead: data });
}

// POST — send this person an SMS or email through GoHighLevel.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: contactId } = await params;
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (Object.keys(input).some((k) => !["channel", "message", "expected_destination"].includes(k))) {
    return NextResponse.json({ error: "Unexpected request field" }, { status: 400 });
  }
  const channel = typeof input.channel === "string" ? input.channel : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const expected = typeof input.expected_destination === "string" ? input.expected_destination : "";
  if (!CHANNELS.has(channel) || !message || message.length > 2_000 || !expected || expected.length > 320) {
    return NextResponse.json({ error: "A valid channel, destination, and message are required" }, { status: 400 });
  }

  // The address shown in the UI must still be the address GoHighLevel holds.
  const identity = await ghlContactIdentity(contactId).catch(() => null);
  if (!identity) return NextResponse.json({ error: "Could not read this contact from GoHighLevel." }, { status: 502 });
  const actual = channel === "Email" ? identity.email : identity.phone;
  if (normalize(channel, expected) !== normalize(channel, actual)) {
    return NextResponse.json({ error: "This contact's details changed in GoHighLevel. Refresh and confirm again." }, { status: 409 });
  }

  const db = createLeadsAdminClient();
  const pendingBody = `Pending GHL delivery: ${message}`;
  const { data: pending, error: pendingError } = await db.from("ghl_message_log")
    .select("id").eq("contact_id", contactId).eq("channel", channel).eq("body", pendingBody).limit(1).maybeSingle();
  if (pendingError) return NextResponse.json({ error: "Unable to verify delivery state. Nothing was sent." }, { status: 503 });
  if (pending) return NextResponse.json({ error: "This exact message has a pending or uncertain delivery. Do not resend it." }, { status: 409 });

  const { data: log, error: logError } = await db.from("ghl_message_log")
    .insert({ contact_id: contactId, conversation_id: null, channel, body: pendingBody }).select("id").single();
  if (logError || !log) return NextResponse.json({ error: "Unable to create the audit record. Nothing was sent." }, { status: 503 });

  let result;
  try { result = await ghlSend(contactId, channel as "SMS" | "Email", message); }
  catch { return NextResponse.json({ error: "GoHighLevel delivery outcome is uncertain. Do not resend this message." }, { status: 409 }); }
  if (!result.ok) {
    await db.from("ghl_message_log").update({ body: `GHL delivery rejected: ${message}` }).eq("id", log.id);
    return NextResponse.json({ error: result.detail ?? "GoHighLevel send failed" }, { status: 502 });
  }
  const { error: auditError } = await db.from("ghl_message_log").update({ body: message }).eq("id", log.id);
  return NextResponse.json({ ok: true, channel, warning: auditError ? "Message sent. Local history is still marked pending; do not resend." : null });
}
