import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { findGroupChat, sendToChat, isConfigured, UnipileNotConfigured } from "@/lib/unipile";

// Sends one group-call recap to one WhatsApp group, through Unipile.
//
// This only ever fires from an explicit click. It sends the draft exactly as
// stored -- it does not compose, rewrite or improve anything on the way out --
// and it refuses to send the same recap to the same channel twice.

export const runtime = "nodejs";
export const maxDuration = 60;

const CHANNELS = {
  fam: {
    draft: "fam_draft", sentAt: "fam_sent_at",
    jidEnv: "WHATSAPP_FAM_JID", nameHint: "7-Figure CEO Fam",
  },
  mastermind: {
    draft: "mastermind_draft", sentAt: "mastermind_sent_at",
    jidEnv: "WHATSAPP_MASTERMIND_JID", nameHint: "Mastermind",
  },
} as const;

type Channel = keyof typeof CHANNELS;

export async function POST(req: NextRequest) {
  const { id, channel, resend } = (await req.json().catch(() => ({}))) as
    { id?: string; channel?: Channel; resend?: boolean };

  if (!id || !channel || !(channel in CHANNELS)) {
    return NextResponse.json({ error: "id and channel (fam | mastermind) are required" }, { status: 400 });
  }
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Unipile is not configured. Add UNIPILE_DSN and UNIPILE_API_KEY." },
      { status: 503 }
    );
  }

  const cfg = CHANNELS[channel];
  const db = createLeadsAdminClient();
  const { data: call, error } = await db.from("client_calls").select("*").eq("id", id).single();
  if (error || !call) return NextResponse.json({ error: error?.message ?? "call not found" }, { status: 404 });

  const text = (call as Record<string, unknown>)[cfg.draft] as string | null;
  if (!text?.trim()) return NextResponse.json({ error: "There is no draft to send." }, { status: 400 });

  const alreadySent = (call as Record<string, unknown>)[cfg.sentAt] as string | null;
  if (alreadySent && !resend) {
    return NextResponse.json(
      { error: `Already posted ${new Date(alreadySent).toLocaleString()}. Send again only on purpose.` },
      { status: 409 }
    );
  }

  try {
    const chat = await findGroupChat({ jid: process.env[cfg.jidEnv] ?? null, name: cfg.nameHint });
    if (!chat) {
      return NextResponse.json(
        { error: `Could not find the ${channel} WhatsApp group. Set ${cfg.jidEnv} to its JID.` },
        { status: 404 }
      );
    }

    const sent = await sendToChat(chat.id, text);
    const sent_at = new Date().toISOString();
    await db.from("client_calls").update({ [cfg.sentAt]: sent_at }).eq("id", id);

    return NextResponse.json({ ok: true, sent_at, group: chat.name, message_id: sent?.message_id });
  } catch (e) {
    if (e instanceof UnipileNotConfigured) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("client-call send failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed." }, { status: 502 });
  }
}
