import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// GET — all active offer briefs
export async function GET() {
  const { data, error } = await db
    .from("offer_briefs")
    .select("*")
    .eq("archived", false)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — create a brief
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { count } = await db.from("offer_briefs").select("id", { count: "exact", head: true }).eq("archived", false);
  const { data, error } = await db.from("offer_briefs").insert({ ...body, sort_order: count ?? 0 }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH — update a brief
export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db.from("offer_briefs").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove a brief
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await db.from("offer_briefs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
