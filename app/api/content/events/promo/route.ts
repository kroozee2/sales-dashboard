import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { planPromoCampaign, type PromoItem } from "@/lib/content";

export const runtime = "nodejs";
export const maxDuration = 300;

// Mode 1: {eventId, runwayDays} → generate a promo runway for review (no insert)
// Mode 2: {eventId, add:[PromoItem]} → insert the ticked items as scheduled, linked to the event
export async function POST(req: NextRequest) {
  const { eventId, runwayDays, add } = await req.json() as { eventId: string; runwayDays?: number; add?: PromoItem[] };
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });
  const db = contentDb();
  const { data: ev, error } = await db.from("content_events").select("*").eq("id", eventId).single();
  if (error || !ev) return NextResponse.json({ error: "event not found" }, { status: 404 });

  // Mode 2: insert
  if (Array.isArray(add) && add.length) {
    const base = ev.start_date ? new Date(ev.start_date + "T12:00:00") : new Date();
    const rows = add.map((it) => {
      const d = new Date(base); d.setDate(d.getDate() - (Number(it.days_before) || 0));
      return {
        title: it.title, category: it.category, status: "scheduled",
        scheduled_date: d.toISOString().split("T")[0],
        platforms: it.platforms, event_id: eventId,
        meta: { promo_for: ev.title },
      };
    });
    const { data, error: insErr } = await db.from("content_items").insert(rows).select("id");
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    return NextResponse.json({ inserted: data?.length ?? 0 });
  }

  // Mode 1: plan
  try {
    const items = await planPromoCampaign({ event: ev, runwayDays: runwayDays ?? 14 });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "plan failed" }, { status: 500 });
  }
}
