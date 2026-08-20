import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { sanitizeContentCreate, sanitizeContentPatch } from "@/lib/content-item-validation";
import { CATEGORIES, CONTENT_STATUSES, PLATFORMS } from "@/lib/content-constants";
import { BoundedBodyError, readBoundedJsonObject } from "@/lib/http-bounds";

export const runtime = "nodejs";

const contentPatchAllowedValues = {
  categories: CATEGORIES.map((entry) => entry.key),
  statuses: CONTENT_STATUSES.map((entry) => entry.key),
  platforms: PLATFORMS.map((entry) => entry.key),
};

const MAX_BODY_BYTES = 400_000;


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
  let body: Record<string, unknown>;
  try {
    body = sanitizeContentCreate(await readBoundedJsonObject(req, MAX_BODY_BYTES), contentPatchAllowedValues);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request";
    return NextResponse.json({ error: message }, { status: error instanceof BoundedBodyError ? error.status : 400 });
  }
  const generationId = typeof (body.meta as Record<string, unknown> | undefined)?.generationId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String((body.meta as Record<string, unknown>).generationId))
    ? String((body.meta as Record<string, unknown>).generationId)
    : null;
  const insertBody = generationId ? { ...body, id: generationId } : body;
  const db = contentDb();
  const { data, error } = await db.from("content_items").insert(insertBody).select().single();
  if (error?.code === "23505" && generationId) {
    const existing = await db.from("content_items").select("*").eq("id", generationId).maybeSingle();
    if (existing.data) return NextResponse.json({ item: existing.data, idempotent: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// PATCH — update item
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await readBoundedJsonObject(req, MAX_BODY_BYTES); }
  catch (error) {
    const bounded = error instanceof BoundedBodyError ? error : new BoundedBodyError(400, "Invalid JSON object");
    return NextResponse.json({ error: bounded.message }, { status: bounded.status });
  }
  if (typeof body.id !== "string" || !body.id.trim()) return NextResponse.json({ error: "id required" }, { status: 400 });
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
  let id: unknown;
  try { id = (await readBoundedJsonObject(req, 2_000)).id; }
  catch (error) {
    const bounded = error instanceof BoundedBodyError ? error : new BoundedBodyError(400, "Invalid JSON object");
    return NextResponse.json({ error: bounded.message }, { status: bounded.status });
  }
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "valid UUID id required" }, { status: 400 });
  const { error } = await contentDb().from("content_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
