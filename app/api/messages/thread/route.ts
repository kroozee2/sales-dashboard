import { NextRequest, NextResponse } from "next/server";
import { ghlThreadMessages, ghlMarkRead } from "@/lib/ghl-inbox";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export const runtime = "nodejs";
export const maxDuration = 30;

// One conversation's messages. While GHL history is locked (HIPAA toggle), our
// local send-log fills in the messages we sent from here.
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const contactId = req.nextUrl.searchParams.get("contactId");
  if (!conversationId) return NextResponse.json({ error: "missing conversationId" }, { status: 400 });

  const ghl = await ghlThreadMessages(conversationId);
  ghlMarkRead(conversationId); // fire-and-forget

  if (!ghl.locked) return NextResponse.json({ locked: false, messages: ghl.messages });

  // Locked: show what we sent from the app (by conversation, falling back to contact).
  const db = createLeadsAdminClient();
  let q = db.from("ghl_message_log").select("id, body, channel, created_at").order("created_at", { ascending: true }).limit(100);
  q = contactId ? q.or(`conversation_id.eq.${conversationId},contact_id.eq.${contactId}`) : q.eq("conversation_id", conversationId);
  const { data: local } = await q;
  const messages = (local ?? []).map((m) => ({
    id: m.id,
    body: m.body,
    direction: "outbound" as const,
    type: m.channel,
    date: m.created_at,
    attachments: [] as string[],
  }));
  return NextResponse.json({ locked: true, messages });
}
