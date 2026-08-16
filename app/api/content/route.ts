import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { sanitizeContentPatch } from "@/lib/content-item-validation";
import { CATEGORIES, CONTENT_STATUSES, PLATFORMS } from "@/lib/content-constants";

export const runtime = "nodejs";

const contentPatchAllowedValues = {
  categories: CATEGORIES.map((entry) => entry.key),
  statuses: CONTENT_STATUSES.map((entry) => entry.key),
  platforms: PLATFORMS.map((entry) => entry.key),
};

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
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || !body.id.trim()) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id, ...requested } = body;
  let fields: Record<string, unknown>;
  try {
    const sanitized = sanitizeContentPatch(requested, contentPatchAllowedValues);
    if (sanitized.rejected.length) return NextResponse.json({ error: `unsupported fields: ${sanitized.rejected.join(", ")}` }, { status: 400 });
    if (!Object.keys(sanitized.fields).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    fields = { ...sanitized.fields, updated_at: new Date().toISOString() };
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid update" }, { status: 400 });
  }
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
