import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { safeHttpUrl, sanitizeYouTubeIdea } from "@/lib/youtube";
import { readBoundedRequestBody } from "@/lib/messaging";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 16_000;
const ALLOWED_FIELDS = new Set(["id", "expectedUpdatedAt", "title", "format", "targetDate", "stage", "viewer", "promise", "primaryKeyword", "openingHook", "mediaUrl", "shootAt"]);

async function readBoundedJson(req: NextRequest): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new RangeError("Request body is too large");
  let text: string;
  try { text = await readBoundedRequestBody(req, MAX_BODY_BYTES); }
  catch (error) { if (error instanceof Error && error.message === "Request body is too large") throw new RangeError(error.message); throw error; }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new SyntaxError("Request body must be valid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError("Request body must be an object");
  const body = value as Record<string, unknown>;
  const rejected = Object.keys(body).filter((key) => !ALLOWED_FIELDS.has(key));
  if (rejected.length) throw new SyntaxError(`Unsupported fields: ${rejected.sort().join(", ")}`);
  return body;
}

function bodyError(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: error instanceof RangeError ? 413 : 400 });
}

function youtubeMeta(item: Record<string, unknown>) {
  const meta = item.meta && typeof item.meta === "object" && !Array.isArray(item.meta) ? item.meta as Record<string, unknown> : {};
  const platforms = Array.isArray(item.platforms) ? item.platforms : [];
  if (!platforms.includes("youtube") || item.creative_type !== "video" || meta.video_hub !== true || meta.video_destination !== "youtube") return null;
  return meta;
}

export async function GET() {
  const { data, error } = await contentDb()
    .from("content_items")
    .select("*")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "YouTube production records are temporarily unavailable" }, { status: 502 });
  const items = ((data ?? []) as Record<string, unknown>[]).filter((item) => youtubeMeta(item));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  try {
    const body = await readBoundedJson(req);
    const record = sanitizeYouTubeIdea(body);
    const { data, error } = await contentDb().from("content_items").insert(record).select().single();
    if (error) return NextResponse.json({ error: "Could not create the YouTube item" }, { status: 500 });
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    return bodyError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await readBoundedJson(req);
    if (typeof body.id !== "string" || !body.id.trim()) throw new SyntaxError("id is required");
    if (typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
      throw new SyntaxError("expectedUpdatedAt is required");
    }
    const db = contentDb();
    const { data: current, error: readError } = await db.from("content_items").select("*").eq("id", body.id).single();
    if (readError || !current) return NextResponse.json({ error: "YouTube content item not found" }, { status: 404 });
    const meta = youtubeMeta(current as Record<string, unknown>);
    if (!meta) return NextResponse.json({ error: "Item is not a YouTube Video Hub record" }, { status: 409 });
    if (current.updated_at !== body.expectedUpdatedAt) {
      return NextResponse.json({ error: "This YouTube item changed elsewhere. Refresh before saving." }, { status: 409 });
    }

    const clean = sanitizeYouTubeIdea({
      title: Object.hasOwn(body, "title") ? body.title : current.title,
      format: Object.hasOwn(body, "format") ? body.format : meta.youtube_format === "short" ? "short" : "long_form",
      targetDate: Object.hasOwn(body, "targetDate") ? body.targetDate : current.scheduled_date,
      stage: Object.hasOwn(body, "stage") ? body.stage : meta.video_stage,
      viewer: Object.hasOwn(body, "viewer") ? body.viewer : meta.target_viewer,
      promise: Object.hasOwn(body, "promise") ? body.promise : meta.promise,
      primaryKeyword: Object.hasOwn(body, "primaryKeyword") ? body.primaryKeyword : meta.primary_keyword,
      openingHook: Object.hasOwn(body, "openingHook") ? body.openingHook : meta.opening_hook,
    });
    const mediaUrls = body.mediaUrl === undefined
      ? current.media_urls
      : body.mediaUrl === ""
        ? []
        : (() => { const url = safeHttpUrl(body.mediaUrl); if (!url) throw new SyntaxError("mediaUrl must be an HTTP or HTTPS URL"); return [url]; })();
    // When you'll stand in front of the camera, which is not the same as the
    // day it goes out — scheduled_date is the publish target.
    let shootAt = typeof meta.shoot_at === "string" ? meta.shoot_at : null;
    if (Object.hasOwn(body, "shootAt")) {
      if (body.shootAt === null || body.shootAt === "") shootAt = null;
      else if (typeof body.shootAt === "string" && Number.isFinite(Date.parse(body.shootAt))) shootAt = body.shootAt;
      else throw new SyntaxError("shootAt must be a date-time or null");
    }

    const update = {
      title: clean.title,
      status: clean.status,
      scheduled_date: clean.scheduled_date,
      platforms: clean.platforms,
      creative_type: clean.creative_type,
      media_urls: mediaUrls,
      meta: { ...meta, ...clean.meta, shoot_at: shootAt },
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db
      .from("content_items")
      .update(update)
      .eq("id", body.id)
      .eq("updated_at", body.expectedUpdatedAt)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Could not save the YouTube item" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "This YouTube item changed elsewhere. Refresh before saving." }, { status: 409 });
    return NextResponse.json({ item: data });
  } catch (error) {
    return bodyError(error);
  }
}
