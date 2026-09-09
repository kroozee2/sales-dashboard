import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// GET — every live funnel, in board order.
export async function GET() {
  const { data, error } = await db().from("funnels")
    .select("*").eq("archived", false)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const client = db();
  const { count } = await client.from("funnels").select("id", { count: "exact", head: true }).eq("archived", false);
  const { data, error } = await client.from("funnels")
    .insert({ name: "New funnel", emoji: "🌀", type: "sales_page", status: "draft", sort_order: count ?? 0, ...body })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Only the columns the board actually edits. Without this an arbitrary key in
// the request body would be written straight through to the row.
const EDITABLE = new Set([
  "name", "emoji", "url", "type", "purpose", "status", "thumbnail_url", "notes", "sort_order",
  "archived", "cta", "followup_text", "followup_email",
]);

export async function PATCH(req: NextRequest) {
  const { id, ...body } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) if (EDITABLE.has(key)) updates[key] = value;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db().from("funnels").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await db().from("funnels").update({ archived: true }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
