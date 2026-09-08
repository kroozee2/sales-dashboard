import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// The weekly group client calls: who showed up, what to follow up on, whether
// the recording went out, and the messages drafted for the WhatsApp groups.
//
// Read and write only. Ingest is a separate route because it reaches Zoom,
// Google Calendar and Fathom and takes far longer than a page load should.
//
// Nothing here sends a message. The drafts sit until Andrew presses send, and
// the send route records when he did.

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await createLeadsAdminClient()
    .from("client_calls").select("*").order("call_date", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calls: data ?? [] });
}

// PATCH — the things Andrew marks by hand: recording sent, a reworded draft,
// a follow-up ticked off.
export async function PATCH(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { id?: string } & Record<string, unknown>;
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = ["recording_sent", "fam_draft", "mastermind_draft", "follow_ups", "summary", "title"];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in b) clean[k] = b[k];
  if (b.recording_sent === true) clean.recording_sent_at = new Date().toISOString();
  if (b.recording_sent === false) clean.recording_sent_at = null;
  if (!Object.keys(clean).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const { data, error } = await createLeadsAdminClient()
    .from("client_calls").update(clean).eq("id", b.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, call: data });
}
