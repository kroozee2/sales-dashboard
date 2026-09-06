import { NextRequest, NextResponse } from "next/server";
import { normalizeComposioYouTubeItem, normalizeStrictUtcTimestamp, type ComposioYouTubeItem } from "@/lib/composio-youtube";
import { isHotLeadsAgent } from "@/lib/hot-leads-auth";
import { readBoundedRequestBody } from "@/lib/messaging";
import { contentDb } from "@/lib/supabase-content";
import { YOUTUBE_CHANNEL } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 1_000_000;
const MAX_ITEMS = 500;
const EXPECTED_SOURCE = "composio-youtube-data-api";
const PROFILE_URL = `https://www.youtube.com/${YOUTUBE_CHANNEL.handle}`;

type ImportBody = {
  source?: unknown;
  channelId?: unknown;
  channelHandle?: unknown;
  fetchedAt?: unknown;
  items?: unknown;
};

export async function POST(req: NextRequest) {
  if (!isHotLeadsAgent(req)) return NextResponse.json({ error: "Agent authorization required" }, { status: 401 });

  let body: ImportBody;
  try {
    const text = await readBoundedRequestBody(req, MAX_BODY_BYTES);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request body must be an object");
    const allowed = new Set(["source", "channelId", "channelHandle", "fetchedAt", "items"]);
    if (Object.keys(parsed).some((key) => !allowed.has(key))) throw new Error("Unsupported request field");
    body = parsed as ImportBody;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: message === "Request body is too large" ? 413 : 400 });
  }

  if (body.source !== EXPECTED_SOURCE || body.channelId !== YOUTUBE_CHANNEL.id || body.channelHandle !== YOUTUBE_CHANNEL.handle) {
    return NextResponse.json({ error: "Composio YouTube source identity mismatch" }, { status: 400 });
  }
  const now = new Date();
  const fetchedAt = normalizeStrictUtcTimestamp(body.fetchedAt);
  const fetchedAtMs = fetchedAt ? Date.parse(fetchedAt) : Number.NaN;
  if (!Number.isFinite(fetchedAtMs) || Math.abs(now.getTime() - fetchedAtMs) > 15 * 60_000) {
    return NextResponse.json({ error: "Valid fetchedAt required" }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `items must contain 1-${MAX_ITEMS} records` }, { status: 400 });
  }

  let normalized;
  try {
    normalized = (body.items as ComposioYouTubeItem[]).map((item, index) => {
      try {
        return normalizeComposioYouTubeItem(item, now);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid item";
        throw new Error(`Item ${index + 1}: ${message}`);
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Composio data" }, { status: 400 });
  }

  const externalIds = new Set(normalized.map((item) => item.id));
  if (externalIds.size !== normalized.length) {
    return NextResponse.json({ error: "Duplicate YouTube video IDs" }, { status: 400 });
  }

  const rows = normalized.map((item) => ({
    platform: "youtube",
    profile_name: YOUTUBE_CHANNEL.name,
    profile_url: PROFILE_URL,
    post_url: item.url,
    external_id: item.id,
    text: item.title,
    posted_at: item.publishedAt,
    likes: item.likes,
    comments: item.comments,
    shares: null,
    reactions: item.likes,
    views: item.views,
    media_type: item.format === "short" ? "short" : "long",
    media_url: item.thumbnailUrl,
    raw: {
      provider: "composio",
      source: EXPECTED_SOURCE,
      fetchedAt,
      channelId: YOUTUBE_CHANNEL.id,
      channelHandle: YOUTUBE_CHANNEL.handle,
      contentType: item.format,
      durationSeconds: item.durationSeconds,
      metricBasis: "public-lifetime",
      snapshotSize: normalized.length,
    },
  }));

  const { error } = await contentDb().from("posted_content").upsert(rows, { onConflict: "external_id" });
  if (error) return NextResponse.json({ error: "Could not save verified YouTube data" }, { status: 500 });

  return NextResponse.json({
    imported: rows.length,
    longForm: rows.filter((row) => row.media_type === "long").length,
    shorts: rows.filter((row) => row.media_type === "short").length,
    source: "Composio YouTube Data API",
    windowDays: 365,
  });
}
