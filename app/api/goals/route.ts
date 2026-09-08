import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

/**
 * GET — goals still in play.
 *
 * `?include=closed` also returns the ones closed out by hand, which only the
 * Goals board wants: everywhere else (the Projects goal picker, the home
 * dashboard) is offering a list to attach work to, and a goal you have stopped
 * chasing does not belong there.
 */
export async function GET(req: NextRequest) {
  const includeClosed = new URL(req.url).searchParams.get("include") === "closed";
  let query = db.from("goals").select("*");
  if (!includeClosed) query = query.eq("archived", false);
  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — create goal
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await db.from("goals").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH — update goal
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, keepOthersFeatured, ...updates } = body;
  updates.updated_at = new Date().toISOString();
  // Pinning is a set, not a radio button: the board draws every starred goal.
  // Callers that still want exactly one at the top omit keepOthersFeatured.
  if (updates.featured === true && !keepOthersFeatured) {
    await db.from("goals").update({ featured: false }).neq("id", id);
  }
  const { data, error } = await db.from("goals").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove goal
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await db.from("goals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
