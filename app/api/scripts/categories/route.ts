import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY!
);

export async function GET() {
  const { data, error } = await db().from("script_categories").select("*").order("sort");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { label, emoji } = await req.json() as { label: string; emoji?: string };
  if (!label?.trim()) return NextResponse.json({ error: "label required" }, { status: 400 });
  // derive a slug key from the label
  const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `cat_${Date.now()}`;
  const { count } = await db().from("script_categories").select("*", { count: "exact", head: true });
  const { data, error } = await db()
    .from("script_categories")
    .insert({ key, label: label.trim(), emoji: emoji?.trim() || "🏷️", sort: (count ?? 0) + 1 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}

export async function DELETE(req: NextRequest) {
  const { key } = await req.json() as { key: string };
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const { error } = await db().from("script_categories").delete().eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
