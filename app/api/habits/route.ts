import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// GET — active habits, each with the periods checked off. The window covers all
// three cadences: 6 monthly slots needs ~half a year of logs, so pull 220 days.
export async function GET() {
  const since = new Date();
  since.setDate(since.getDate() - 220);
  const sinceStr = since.toISOString().slice(0, 10);

  const [{ data: habits, error }, { data: logs }] = await Promise.all([
    db.from("habits").select("*").eq("archived", false).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    db.from("habit_logs").select("habit_id, day").gte("day", sinceStr),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const doneByHabit = new Map<string, string[]>();
  for (const l of logs ?? []) {
    const arr = doneByHabit.get(l.habit_id) ?? [];
    arr.push(l.day);
    doneByHabit.set(l.habit_id, arr);
  }
  const out = (habits ?? []).map((h) => ({ ...h, done: doneByHabit.get(h.id) ?? [] }));
  return NextResponse.json(out);
}

// POST — add a habit (cadence: Daily | Weekly | Monthly)
export async function POST(req: NextRequest) {
  const { name, emoji, owner, cadence } = await req.json() as { name?: string; emoji?: string; owner?: string; cadence?: string };
  const n = (name ?? "").trim();
  if (!n) return NextResponse.json({ error: "name required" }, { status: 400 });
  const cad = ["Daily", "Weekly", "Monthly"].includes(cadence ?? "") ? cadence : "Daily";
  const { count } = await db.from("habits").select("id", { count: "exact", head: true }).eq("archived", false);
  const { data, error } = await db.from("habits").insert({ name: n.slice(0, 120), emoji: emoji || "🔥", owner: owner || "Andrew", cadence: cad, sort_order: count ?? 0 }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, done: [] });
}

// PATCH — rename / re-emoji
export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (typeof updates.name === "string") updates.name = updates.name.trim().slice(0, 120);
  const { data, error } = await db.from("habits").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove a habit (its logs cascade)
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await db.from("habits").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
