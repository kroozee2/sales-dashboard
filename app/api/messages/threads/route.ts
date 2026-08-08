import { NextRequest, NextResponse } from "next/server";
import { ghlThreadsAll, ghlThreads } from "@/lib/ghl-inbox";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export const runtime = "nodejs";
export const maxDuration = 60;

// The GoHighLevel inbox.
//   mode=inbound (default) → EVERY conversation whose last message is inbound,
//     fully paginated so nothing waiting on us is missed.
//   mode=all → a wide window of the most recent conversations.
export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode = modeParam === "all" ? "all" : modeParam === "hot" ? "hot" : "inbound";
  const query = req.nextUrl.searchParams.get("q") ?? undefined;

  // Hot prospects: leads we've flagged 🔥 in the Leads grid. Each resolves to a
  // GHL conversation when they have a contact; social-only ones are flagged.
  if (mode === "hot") {
    try {
      const db = createLeadsAdminClient();
      const { data: leads } = await db
        .from("leads")
        .select("id, full_name, email, phone, ghl_contact_id, instagram_url, facebook_url, linkedin_url, social_url, hot_at, last_update")
        .eq("hot", true)
        .order("hot_at", { ascending: false });

      const rows = await Promise.all((leads ?? []).map(async (l) => {
        const socialUrl = l.instagram_url || l.facebook_url || l.linkedin_url || l.social_url || null;
        const u = (socialUrl ?? "").toLowerCase();
        const socialType = l.instagram_url || u.includes("instagram") ? "ig"
          : l.facebook_url || u.includes("facebook") || u.includes("fb.com") ? "fb"
          : l.linkedin_url || u.includes("linkedin") ? "li"
          : "web";
        const reachable = !!(l.email || l.phone || l.ghl_contact_id);
        let convo: { id: string; lastBody: string; lastDate: number; lastType: string; lastDirection: "inbound" | "outbound" } | null = null;
        if (l.ghl_contact_id) {
          const cs = await ghlThreads(1, { contactId: l.ghl_contact_id }).catch(() => []);
          if (cs[0]) convo = { id: cs[0].id, lastBody: cs[0].lastBody, lastDate: cs[0].lastDate, lastType: cs[0].lastType, lastDirection: cs[0].lastDirection };
        }
        return {
          id: convo?.id ?? `lead:${l.id}`,
          leadId: l.id,
          contactId: l.ghl_contact_id ?? null,
          name: l.full_name ?? "Lead",
          photo: null,
          phone: l.phone ?? null,
          email: l.email ?? null,
          lastBody: convo?.lastBody ?? "",
          lastDate: convo?.lastDate ?? (l.hot_at ? new Date(l.hot_at).getTime() : 0),
          lastType: convo?.lastType ?? (l.phone ? "TYPE_SMS" : l.email ? "TYPE_EMAIL" : "TYPE_INSTAGRAM"),
          lastDirection: convo?.lastDirection ?? "outbound",
          unread: 0,
          socialUrl,
          socialType,
          socialOnly: !reachable,
        };
      }));
      return NextResponse.json({ threads: rows, total: rows.length, mode, ghlLocationId: process.env.GHL_LOCATION_ID ?? null });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load hot list" }, { status: 502 });
    }
  }

  try {
    const { rows, total } = await ghlThreadsAll({
      query,
      direction: mode === "inbound" ? "inbound" : undefined,
      maxPages: mode === "inbound" ? 20 : 6, // inbound: up to ~2000, all: ~600 recent
    });

    // Inbound queue: hide conversations we've marked read — unless a newer
    // inbound message has arrived since (its last date passed what we handled).
    let out = rows;
    let shownTotal = total;
    if (mode === "inbound") {
      const db = createLeadsAdminClient();
      const { data: handled } = await db.from("handled_conversations").select("conversation_id, last_message_date");
      const handledMap = new Map((handled ?? []).map((h) => [h.conversation_id, Number(h.last_message_date) || 0]));
      out = rows.filter((r) => {
        const h = handledMap.get(r.id);
        return h === undefined || r.lastDate > h;
      });
      shownTotal = out.length;
    }

    return NextResponse.json({ threads: out, total: shownTotal, mode, ghlLocationId: process.env.GHL_LOCATION_ID ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load inbox" }, { status: 502 });
  }
}
