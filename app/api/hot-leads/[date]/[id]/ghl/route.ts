import { NextRequest, NextResponse } from "next/server";
import { ghlSend } from "@/lib/ghl-inbox";
import { isHotLeadsOwner } from "@/lib/hot-leads-auth";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

const CHANNELS = new Set(["SMS", "Email", "WhatsApp"]);
const MAX_BODY_BYTES = 5_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ date: string; id: string }> }) {
  if (!(await isHotLeadsOwner(req))) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const { date, id } = await params;
  if (date !== "current") return NextResponse.json({ error: "Only the current Hot list can send messages" }, { status: 404 });
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "Message is too large" }, { status: 413 });

  let body: unknown;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Message is too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["channel", "message"].includes(key))) return NextResponse.json({ error: "Unexpected request field" }, { status: 400 });
  const channel = typeof input.channel === "string" ? input.channel : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!CHANNELS.has(channel) || !message || message.length > 2_000) return NextResponse.json({ error: "A valid channel and message are required" }, { status: 400 });

  const db = createLeadsAdminClient();
  const { data: lead, error } = await db.from("leads")
    .select("id, full_name, phone, email, ghl_contact_id")
    .eq("id", id)
    .or("hot.eq.true,prospect_stage.eq.🔥 Hot Prospect")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to validate Hot lead" }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead is no longer Hot" }, { status: 409 });
  if (!lead.ghl_contact_id) return NextResponse.json({ error: "Lead is not connected to GoHighLevel" }, { status: 409 });
  if (channel === "Email" ? !lead.email : !lead.phone) return NextResponse.json({ error: `Lead has no ${channel === "Email" ? "email" : "phone number"}` }, { status: 409 });

  const result = await ghlSend(lead.ghl_contact_id, channel as "SMS" | "Email" | "WhatsApp", message);
  if (!result.ok) return NextResponse.json({ error: result.detail ?? "GoHighLevel send failed" }, { status: 502 });
  await Promise.all([
    db.from("ghl_message_log").insert({ contact_id: lead.ghl_contact_id, conversation_id: null, channel, body: message }),
    db.from("leads").update({ last_update: new Date().toISOString() }).eq("id", id),
  ]);
  return NextResponse.json({ ok: true, channel });
}
