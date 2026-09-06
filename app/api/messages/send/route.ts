import { NextRequest, NextResponse } from "next/server";
import { ghlSend } from "@/lib/ghl-inbox";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export const runtime = "nodejs";
export const maxDuration = 30;

// Send a message on any GHL channel and log it locally so the thread shows our
// side even while GHL hides history.
export async function POST(req: NextRequest) {
  const { contactId, conversationId, channel, message } = (await req.json()) as {
    contactId?: string | null; conversationId?: string | null;
    channel: "SMS" | "Email" | "WhatsApp" | "IG" | "FB"; message: string;
  };
  if (!contactId || !message?.trim()) {
    return NextResponse.json({ error: "missing contactId or message" }, { status: 400 });
  }

  const result = await ghlSend(contactId, channel, message.trim());
  if (!result.ok) return NextResponse.json({ error: result.detail ?? "send failed" }, { status: 502 });

  const db = createLeadsAdminClient();
  await db.from("ghl_message_log").insert({
    contact_id: contactId,
    conversation_id: conversationId ?? null,
    channel,
    body: message.trim(),
  });
  // Keep the matching lead's last-contact fresh if we have one
  await db.from("leads").update({ last_update: new Date().toISOString() }).eq("ghl_contact_id", contactId);

  return NextResponse.json({ ok: true });
}
