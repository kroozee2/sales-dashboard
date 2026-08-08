import { NextRequest, NextResponse } from "next/server";
import { ghlMarkRead } from "@/lib/ghl-inbox";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export const runtime = "nodejs";

// Mark a conversation as read/handled: zero its unread in GHL and record its
// current last-message date so it drops out of the Inbound queue. If the person
// messages again (a newer inbound), it comes back automatically.
export async function POST(req: NextRequest) {
  const { conversationId, lastDate } = (await req.json()) as { conversationId: string; lastDate?: number };
  if (!conversationId) return NextResponse.json({ error: "missing conversationId" }, { status: 400 });

  ghlMarkRead(conversationId); // fire-and-forget

  const db = createLeadsAdminClient();
  const { error } = await db.from("handled_conversations").upsert({
    conversation_id: conversationId,
    last_message_date: lastDate ?? 0,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
