import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// POST { habit_id, day } — toggle a habit's completion for a given day
export async function POST(req: NextRequest) {
  const { habit_id, day } = await req.json() as { habit_id?: string; day?: string };
  if (!habit_id || !day) return NextResponse.json({ error: "habit_id and day required" }, { status: 400 });

  const { data: existing } = await db.from("habit_logs").select("id").eq("habit_id", habit_id).eq("day", day).maybeSingle();
  if (existing) {
    await db.from("habit_logs").delete().eq("id", existing.id);
    return NextResponse.json({ done: false });
  }
  const { error } = await db.from("habit_logs").insert({ habit_id, day });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ done: true });
}
