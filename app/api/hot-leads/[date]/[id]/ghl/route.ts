import { NextRequest, NextResponse } from "next/server";
import { ghlContactIdentity, ghlSend } from "@/lib/ghl-inbox";
import { isHotLeadsOwner } from "@/lib/hot-leads-auth";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

const CHANNELS = new Set(["SMS", "Email", "WhatsApp"]);
const MAX_BODY_BYTES = 5_000;
const GHL_HOSTS = new Set(["app.gohighlevel.com", "app.leadconnectorhq.com"]);

async function boundedJson(req: NextRequest): Promise<unknown> {
  const length = req.headers.get("content-length");
  if (length && Number(length) > MAX_BODY_BYTES) throw new RangeError("Message is too large");
  const reader = req.body?.getReader();
  if (!reader) throw new SyntaxError("Request body must be valid JSON");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError("Message is too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new SyntaxError("Request body must be valid JSON"); }
}

function normalizedDestination(channel: string, value: string | null): string {
  if (!value) return "";
  if (channel === "Email") return value.trim().toLowerCase();
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

async function currentHotLead(id: string) {
  return createLeadsAdminClient().from("leads")
    .select("id, full_name, phone, email, ghl_contact_id, ghl_url")
    .eq("id", id)
    .or("hot.eq.true,prospect_stage.eq.🔥 Hot Prospect")
    .maybeSingle();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ date: string; id: string }> }) {
  // Reading a lead's GHL details is open to the team, like the Hot list itself.
  // The POST below actually sends them a message, so that stays owner-only.
  const { date, id } = await params;
  if (date !== "current") return NextResponse.json({ error: "Only the current Hot list can open GoHighLevel" }, { status: 404 });
  const { data: lead, error } = await currentHotLead(id);
  if (error) return NextResponse.json({ error: "Unable to validate Hot lead" }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead is no longer Hot" }, { status: 409 });
  try {
    const url = new URL(lead.ghl_url || "");
    if (url.protocol !== "https:" || !GHL_HOSTS.has(url.hostname)) throw new Error("invalid URL");
    return NextResponse.redirect(url);
  } catch { return NextResponse.json({ error: "No safe GoHighLevel link is available" }, { status: 404 }); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ date: string; id: string }> }) {
  if (!(await isHotLeadsOwner(req))) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const { date, id } = await params;
  if (date !== "current") return NextResponse.json({ error: "Only the current Hot list can send messages" }, { status: 404 });

  let body: unknown;
  try { body = await boundedJson(req); }
  catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 413 });
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["channel", "message", "expected_destination"].includes(key))) return NextResponse.json({ error: "Unexpected request field" }, { status: 400 });
  const channel = typeof input.channel === "string" ? input.channel : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const expectedDestination = typeof input.expected_destination === "string" ? input.expected_destination : "";
  if (!CHANNELS.has(channel) || !message || message.length > 2_000 || !expectedDestination || expectedDestination.length > 320) return NextResponse.json({ error: "A valid channel, destination, and message are required" }, { status: 400 });

  const db = createLeadsAdminClient();
  const { data: lead, error } = await currentHotLead(id);
  if (error) return NextResponse.json({ error: "Unable to validate Hot lead" }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead is no longer Hot" }, { status: 409 });
  if (!lead.ghl_contact_id) return NextResponse.json({ error: "Lead is not connected to GoHighLevel" }, { status: 409 });
  const currentDestination = channel === "Email" ? lead.email : lead.phone;
  const expected = normalizedDestination(channel, expectedDestination);
  if (!expected || expected !== normalizedDestination(channel, currentDestination)) return NextResponse.json({ error: "Lead destination changed. Refresh and confirm again." }, { status: 409 });

  const providerIdentity = await ghlContactIdentity(lead.ghl_contact_id).catch(() => null);
  const providerDestination = channel === "Email" ? providerIdentity?.email ?? null : providerIdentity?.phone ?? null;
  if (!providerIdentity || expected !== normalizedDestination(channel, providerDestination)) return NextResponse.json({ error: "GoHighLevel recipient does not match the confirmed destination" }, { status: 409 });

  const pendingBody = `Pending GHL delivery: ${message}`;
  const { data: existingPending, error: pendingLookupError } = await db.from("ghl_message_log")
    .select("id")
    .eq("contact_id", lead.ghl_contact_id)
    .eq("channel", channel)
    .eq("body", pendingBody)
    .limit(1)
    .maybeSingle();
  if (pendingLookupError) return NextResponse.json({ error: "Unable to verify message delivery state. Nothing was sent." }, { status: 503 });
  if (existingPending) return NextResponse.json({ error: "This exact message has a pending or uncertain delivery. Do not resend it." }, { status: 409 });
  const { data: log, error: logError } = await db.from("ghl_message_log")
    .insert({ contact_id: lead.ghl_contact_id, conversation_id: null, channel, body: pendingBody })
    .select("id")
    .single();
  if (logError || !log) return NextResponse.json({ error: "Unable to create the required message audit record. Nothing was sent." }, { status: 503 });

  let result;
  try { result = await ghlSend(lead.ghl_contact_id, channel as "SMS" | "Email" | "WhatsApp", message); }
  catch { return NextResponse.json({ error: "GoHighLevel delivery outcome is uncertain. Do not resend this message." }, { status: 409 }); }
  if (!result.ok) {
    await db.from("ghl_message_log").update({ body: `GHL delivery rejected: ${message}` }).eq("id", log.id);
    return NextResponse.json({ error: result.detail ?? "GoHighLevel send failed" }, { status: 502 });
  }
  const [{ error: auditError }] = await Promise.all([
    db.from("ghl_message_log").update({ body: message }).eq("id", log.id),
    db.from("leads").update({ last_update: new Date().toISOString() }).eq("id", id),
  ]);
  return NextResponse.json({ ok: true, channel, warning: auditError ? "Message sent. Local history is still marked pending; do not resend." : null });
}
