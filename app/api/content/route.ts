import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";

// GET — all content items (+ events for the calendar)
export async function GET() {
  const db = contentDb();
  const [items, events, ideas, proof, stories] = await Promise.all([
    db.from("content_items").select("*").order("scheduled_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
    db.from("content_events").select("*").order("start_date", { ascending: true }),
    db.from("content_ideas").select("*").eq("status", "new").order("created_at", { ascending: false }),
    db.from("content_proof").select("*").order("created_at", { ascending: false }),
    db.from("content_stories").select("*").order("posted_date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ items: items.data ?? [], events: events.data ?? [], ideas: ideas.data ?? [], proof: proof.data ?? [], stories: stories.data ?? [] });
}

// POST — create item
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await contentDb().from("content_items").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// PATCH — update item
export async function PATCH(req: NextRequest) {
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  fields.updated_at = new Date().toISOString();
  const { data, error } = await contentDb().from("content_items").update(fields).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// DELETE — remove item
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await contentDb().from("content_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
