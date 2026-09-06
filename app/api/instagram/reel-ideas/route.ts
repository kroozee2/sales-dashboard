import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { readBoundedRequestBody } from "@/lib/messaging";
import {
  REEL_IDEA_TYPES,
  buildReelIdeaPayload,
  buildReelStagePatch,
  normalizeReelTitle,
  normalizeShootDate,
  type ReelIdeaType,
  type ReelStage,
} from "@/lib/instagram-reel-ideas";
import { deterministicReelIdeaId } from "@/lib/instagram-reel-id";

export const runtime = "nodejs";

const BODY_BYTES = 8_192;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPE_KEYS = new Set<string>(REEL_IDEA_TYPES.map((type) => type.key));
const STAGES = new Set<string>(["idea", "shot", "posted"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(req: NextRequest) {
  const raw = await readBoundedRequestBody(req, BODY_BYTES);
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error("body must be a JSON object");
  return parsed;
}

function assertExactKeys(body: Record<string, unknown>, allowed: string[]) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(body).filter((key) => !allowedSet.has(key));
  if (unknown.length) throw new Error(`unsupported fields: ${unknown.sort().join(", ")}`);
}

function bodyError(error: unknown) {
  const message = error instanceof Error ? error.message : "invalid request body";
  return NextResponse.json({ error: message }, { status: message.includes("too large") ? 413 : 400 });
}

function isIdeaBoardRecord(item: Record<string, unknown>) {
  return isRecord(item.meta)
    && item.meta.reel_workflow === "idea_board"
    && item.creative_type === "video"
    && Array.isArray(item.platforms)
    && item.platforms.length === 1
    && item.platforms[0] === "instagram";
}

function matchesCreate(item: Record<string, unknown>, payload: ReturnType<typeof buildReelIdeaPayload> & { id: string }) {
  return isIdeaBoardRecord(item)
    && typeof item.title === "string"
    && normalizeReelTitle(item.title) === normalizeReelTitle(payload.title)
    && item.category === payload.category
    && item.status === payload.status
    && item.scheduled_date === payload.scheduled_date
    && isRecord(item.meta)
    && item.meta.reel_stage === payload.meta.reel_stage;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
    assertExactKeys(body, ["title", "category", "scheduled_date", "stage"]);
    if (typeof body.title !== "string") throw new Error("title is required");
    if (typeof body.category !== "string" || !TYPE_KEYS.has(body.category)) throw new Error("category is unsupported");
    if (body.stage !== undefined && (typeof body.stage !== "string" || !STAGES.has(body.stage))) throw new Error("stage is unsupported");
  } catch (error) {
    return bodyError(error);
  }

  let payload: ReturnType<typeof buildReelIdeaPayload> & { id: string };
  try {
    const base = buildReelIdeaPayload(
      body.title as string,
      body.category as ReelIdeaType,
      body.scheduled_date === undefined || body.scheduled_date === null ? null : String(body.scheduled_date),
    );
    const stage = (body.stage ?? "idea") as ReelStage;
    const stagePatch = buildReelStagePatch(stage, {
      ...base.meta,
      reel_title_key: normalizeReelTitle(base.title),
    });
    payload = {
      ...base,
      ...stagePatch,
      id: deterministicReelIdeaId(base.title),
    };
  } catch (error) {
    return bodyError(error);
  }

  const db = contentDb();
  const existing = await db.from("content_items").select("*").eq("id", payload.id).limit(1);
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (existing.data?.[0]) {
    if (!matchesCreate(existing.data[0] as Record<string, unknown>, payload)) {
      return NextResponse.json({ error: "Reel idea id conflicts with another content record" }, { status: 409 });
    }
    return NextResponse.json({ item: existing.data[0], idempotent: true });
  }

  const created = await db.from("content_items").insert(payload).select().single();
  if (!created.error && created.data) return NextResponse.json({ item: created.data, idempotent: false });

  // A concurrent tab may have won the deterministic-id insert race. Read back once.
  const raced = await db.from("content_items").select("*").eq("id", payload.id).limit(1);
  if (!raced.error && raced.data?.[0]) {
    if (matchesCreate(raced.data[0] as Record<string, unknown>, payload)) {
      return NextResponse.json({ item: raced.data[0], idempotent: true });
    }
    return NextResponse.json({ error: "A Reel idea with this title already exists with different details" }, { status: 409 });
  }
  return NextResponse.json({ error: created.error?.message ?? "Reel idea could not be created" }, { status: 500 });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
    assertExactKeys(body, ["id", "expected_updated_at", "stage", "scheduled_date"]);
    if (typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) throw new Error("valid id required");
    if (typeof body.expected_updated_at !== "string" || body.expected_updated_at.length > 50 || Number.isNaN(Date.parse(body.expected_updated_at))) {
      throw new Error("expected_updated_at is required");
    }
    if (body.stage === undefined && body.scheduled_date === undefined) throw new Error("stage or scheduled_date is required");
    if (body.stage !== undefined && (typeof body.stage !== "string" || !STAGES.has(body.stage))) throw new Error("stage is unsupported");
    if (body.scheduled_date !== undefined && body.scheduled_date !== null && typeof body.scheduled_date !== "string") throw new Error("scheduled_date is invalid");
  } catch (error) {
    return bodyError(error);
  }

  const id = body.id as string;
  const expectedUpdatedAt = body.expected_updated_at as string;
  const db = contentDb();
  const currentResult = await db.from("content_items").select("*").eq("id", id).limit(1);
  if (currentResult.error) return NextResponse.json({ error: currentResult.error.message }, { status: 500 });
  const current = currentResult.data?.[0] as Record<string, unknown> | undefined;
  if (!current || !isIdeaBoardRecord(current)) return NextResponse.json({ error: "Reel idea not found" }, { status: 404 });
  if (current.updated_at !== expectedUpdatedAt) return NextResponse.json({ error: "Reel idea changed. Reload and try again." }, { status: 409 });

  const fields: Record<string, unknown> = {};
  try {
    if (body.stage !== undefined) Object.assign(fields, buildReelStagePatch(body.stage as ReelStage, current.meta));
    if (body.scheduled_date !== undefined) fields.scheduled_date = normalizeShootDate(body.scheduled_date as string | null);
  } catch (error) {
    return bodyError(error);
  }
  fields.updated_at = new Date().toISOString();

  const updated = await db
    .from("content_items")
    .update(fields)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select()
    .single();
  if (updated.error || !updated.data) return NextResponse.json({ error: "Reel idea changed. Reload and try again." }, { status: 409 });
  return NextResponse.json({ item: updated.data });
}
