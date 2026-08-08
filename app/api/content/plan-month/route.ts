import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { planMonth, type PlannedItem } from "@/lib/content";

export const runtime = "nodejs";
export const maxDuration = 300;

// Mode 1: {monthName} → plan for review. Mode 2: {monthName, year, month, add:[PlannedItem]} → insert as scheduled.
export async function POST(req: NextRequest) {
  const { monthName, year, month, add } = await req.json() as { monthName: string; year?: number; month?: number; add?: PlannedItem[] };

  if (Array.isArray(add) && add.length && year != null && month != null) {
    const rows = add.map((it) => {
      const day = Math.min(28, Math.max(1, Number(it.day) || 1));
      const d = new Date(year, month, day);
      return {
        title: it.title, category: it.category, status: "scheduled",
        scheduled_date: d.toISOString().split("T")[0],
        platforms: it.platforms, meta: { planned_month: monthName },
      };
    });
    const { data, error } = await contentDb().from("content_items").insert(rows).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ inserted: data?.length ?? 0 });
  }

  try {
    const items = await planMonth({ monthName });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "plan failed" }, { status: 500 });
  }
}
