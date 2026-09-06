import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { sanitizeContentCreate, sanitizeContentPatch } from "@/lib/content-item-validation";
import { readBoundedRequestBody } from "@/lib/messaging";
import { CATEGORIES, CONTENT_STATUSES, PLATFORMS } from "@/lib/content-constants";

export const runtime = "nodejs";

const contentPatchAllowedValues = {
  categories: CATEGORIES.map((entry) => entry.key),
  statuses: CONTENT_STATUSES.map((entry) => entry.key),
  platforms: PLATFORMS.map((entry) => entry.key),
};

const CONTENT_BODY_BYTES = 250_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readContentJsonObject(req: NextRequest): Promise<Record<string, unknown>> {
  const raw = await readBoundedRequestBody(req, CONTENT_BODY_BYTES);
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body must be a JSON object");
  return parsed as Record<string, unknown>;
}

function contentBodyError(error: unknown) {
  const message = error instanceof Error ? error.message : "invalid request body";
  return NextResponse.json({ error: message }, { status: message.includes("too large") ? 413 : 400 });
}

function isReelIdeaBoard(meta: unknown) {
  return Boolean(meta && typeof meta === "object" && !Array.isArray(meta) && (meta as Record<string, unknown>).reel_workflow === "idea_board");
}

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
    body = await readContentJsonObject(req);
  } catch (error) {
    return contentBodyError(error);
  }

  let fields: Record<string, unknown>;
  try {
    fields = sanitizeContentCreate(body, contentPatchAllowedValues).fields;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid content item" }, { status: 400 });
  }

  if (isReelIdeaBoard(fields.meta)) {
    return NextResponse.json({ error: "Use the Instagram Reel Ideas endpoint for idea-board records" }, { status: 400 });
  }

  const { data, error } = await contentDb().from("content_items").insert(fields).select().single();
  if (error?.code === "23505") return NextResponse.json({ error: "content item already exists" }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// PATCH — update item
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await readContentJsonObject(req);
  } catch (error) {
    return contentBodyError(error);
  }
  if (typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) return NextResponse.json({ error: "valid id required" }, { status: 400 });
  const expectedUpdatedAt = body.expected_updated_at;
  if (expectedUpdatedAt !== undefined && (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt.trim() || Number.isNaN(Date.parse(expectedUpdatedAt)))) {
    return NextResponse.json({ error: "invalid expected_updated_at" }, { status: 400 });
  }
  const { id, expected_updated_at: _expectedUpdatedAt, ...requested } = body;
  void _expectedUpdatedAt;
  let requestedFields: Record<string, unknown>;
  try {
    const sanitized = sanitizeContentPatch(requested, contentPatchAllowedValues);
    if (sanitized.rejected.length) return NextResponse.json({ error: `unsupported fields: ${sanitized.rejected.join(", ")}` }, { status: 400 });
    if (!Object.keys(sanitized.fields).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    requestedFields = sanitized.fields;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid update" }, { status: 400 });
  }
  if (isReelIdeaBoard(requestedFields.meta)) {
    return NextResponse.json({ error: "New Reel idea-board records must use the Instagram Reel Ideas endpoint" }, { status: 409 });
  }

  const db = contentDb();
  const attempts = typeof expectedUpdatedAt === "string" ? 1 : 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await db.from("content_items").select("updated_at,meta").eq("id", id).maybeSingle();
    if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
    if (!current.data) return NextResponse.json({ error: "content item changed; refresh and retry" }, { status: 409 });
    if (isReelIdeaBoard(current.data.meta)) {
      return NextResponse.json({ error: "Existing Reel idea-board records must use the Instagram Reel Ideas endpoint" }, { status: 409 });
    }
    const storedRevision = typeof current.data.updated_at === "string" ? current.data.updated_at : null;
    if (!storedRevision || Number.isNaN(Date.parse(storedRevision))) return NextResponse.json({ error: "content item has no valid revision" }, { status: 409 });
    if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt !== storedRevision) break;
    const revisionMs = Date.parse(storedRevision);
    const nextUpdatedAtMs = Math.max(Date.now(), revisionMs + 1);
    if (!Number.isFinite(nextUpdatedAtMs) || nextUpdatedAtMs > 8_640_000_000_000_000) {
      return NextResponse.json({ error: "invalid expected_updated_at" }, { status: 400 });
    }
    const fields = { ...requestedFields, updated_at: new Date(nextUpdatedAtMs).toISOString() };
    const update = db.from("content_items").update(fields).eq("id", id).eq("updated_at", storedRevision);
    const { data, error } = await update.select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) return NextResponse.json({ item: data });
    if (typeof expectedUpdatedAt === "string") break;
  }
  return NextResponse.json({ error: "content item changed; refresh and retry" }, { status: 409 });
}

// DELETE — remove item
export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await readContentJsonObject(req);
  } catch (error) {
    return contentBodyError(error);
  }
  if (typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) return NextResponse.json({ error: "valid id required" }, { status: 400 });
  const { error } = await contentDb().from("content_items").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
