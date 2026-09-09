import { NextResponse } from "next/server";
import { listWhatsappChats, isConfigured } from "@/lib/unipile";

// Lists the WhatsApp groups Unipile can see, so the right group can be
// identified once and pinned to an env var instead of guessed at each send.
export const runtime = "nodejs";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Set UNIPILE_DSN and UNIPILE_API_KEY." }, { status: 503 });
  }
  try {
    const chats = await listWhatsappChats();
    const groups = chats
      .filter((c) => (c.provider_id ?? "").endsWith("@g.us"))
      .map((c) => ({ id: c.id, name: c.name, jid: c.provider_id }))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return NextResponse.json({ groups, count: groups.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 502 });
  }
}
