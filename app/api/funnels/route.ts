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

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
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
