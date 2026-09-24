import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { generateVideoPromo } from "@/lib/content";
import {
  buildVideoLink, readVideoLink, suggestLinks, videoFormat,
  type PipelineItem, type PostedVideo,
} from "@/lib/youtube-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Tying a Create entry to the video that actually went live, and writing the
 * three things that go out once it has.
 *
 * GET    suggestions: every posted pipeline entry, its likeliest upload, why
 * POST   confirm one link, then optionally write the promo for it
 * DELETE unlink
 *
 * Nothing is linked without a person saying so. A wrong link puts a wrong URL
 * into a Skool post, an email and a DM at once.
 */

function isYouTubeHub(item: Record<string, unknown>) {
  const meta = item.meta && typeof item.meta === "object" && !Array.isArray(item.meta)
    ? (item.meta as Record<string, unknown>) : {};
  const platforms = Array.isArray(item.platforms) ? item.platforms : [];
  return platforms.includes("youtube") && item.creative_type === "video" && meta.video_hub === true;
}

function toPipelineItem(item: Record<string, unknown>): PipelineItem {
  const meta = (item.meta ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id),
    title: String(item.title ?? "Untitled"),
    format: typeof meta.youtube_format === "string" ? meta.youtube_format : null,
    shootAt: typeof meta.shoot_at === "string" ? meta.shoot_at : null,
    scheduledDate: typeof item.scheduled_date === "string" ? item.scheduled_date : null,
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : null,
  };
}

async function loadBoth() {
  const db = contentDb();
  const [itemsResult, postedResult] = await Promise.all([
    db.from("content_items").select("*").order("updated_at", { ascending: false, nullsFirst: false }),
    db.from("posted_content").select("external_id,text,post_url,posted_at,views")
      .eq("platform", "youtube").order("posted_at", { ascending: false }).limit(300),
  ]);
  if (itemsResult.error) throw new Error("Production records are temporarily unavailable");

  const rows = ((itemsResult.data ?? []) as Record<string, unknown>[]).filter(isYouTubeHub);
  const videos: PostedVideo[] = ((postedResult.data ?? []) as Record<string, unknown>[])
    .filter((row) => typeof row.external_id === "string" && typeof row.post_url === "string")
    .map((row) => ({
      videoId: String(row.external_id),
      title: String(row.text ?? "Untitled video"),
      url: String(row.post_url),
      postedAt: typeof row.posted_at === "string" ? row.posted_at.slice(0, 10) : null,
      views: typeof row.views === "number" ? row.views : null,
    }));
  return { rows, videos };
}

export async function GET() {
  let loaded;
  try { loaded = await loadBoth(); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 502 }); }
  const { rows, videos } = loaded;

  const linkedIds: string[] = [];
  const linked = [];
  const unlinked = [];
  for (const row of rows) {
    const link = readVideoLink(row.meta);
    if (link) {
      linkedIds.push(link.video_id);
      const promo = (row.meta as Record<string, unknown>)?.youtube_promo ?? null;
      linked.push({ item: toPipelineItem(row), link, promo, hasPromo: Boolean(promo) });
    } else if (row.status === "posted") {
      // Only entries marked posted are looking for an upload.
      unlinked.push(toPipelineItem(row));
    }
  }

  return NextResponse.json({
    linked,
    suggestions: suggestLinks(unlinked, videos, linkedIds),
    videos: videos.map((video) => ({ ...video, format: videoFormat(video.url) })),
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  const videoId = typeof body.videoId === "string" ? body.videoId : null;
  const how = body.how === "manual" ? "manual" : "suggested";
  const withPromo = body.withPromo !== false;
  if (!itemId || !videoId) return NextResponse.json({ error: "itemId and videoId are required" }, { status: 400 });

  const db = contentDb();
  const { data: row, error: readError } = await db
    .from("content_items").select("*").eq("id", itemId).maybeSingle();
  if (readError || !row) return NextResponse.json({ error: "That production record no longer exists" }, { status: 404 });

  const { data: postedRow } = await db.from("posted_content")
    .select("external_id,text,post_url,posted_at,views")
    .eq("platform", "youtube").eq("external_id", videoId).maybeSingle();
  if (!postedRow) return NextResponse.json({ error: "That video is not in the posted list" }, { status: 404 });

  const video: PostedVideo = {
    videoId: String(postedRow.external_id),
    title: String(postedRow.text ?? "Untitled video"),
    url: String(postedRow.post_url ?? ""),
    postedAt: typeof postedRow.posted_at === "string" ? postedRow.posted_at.slice(0, 10) : null,
    views: typeof postedRow.views === "number" ? postedRow.views : null,
  };

  let link;
  try { link = buildVideoLink(video, how, new Date()); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }

  const meta = (row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
    ? row.meta : {}) as Record<string, unknown>;

  let promo = null;
  let promoError: string | null = null;
  if (withPromo) {
    try {
      promo = await generateVideoPromo({
        title: link.posted_title,
        url: link.url,
        workingTitle: String(row.title ?? ""),
        promise: typeof meta.promise === "string" ? meta.promise : null,
        hook: typeof meta.opening_hook === "string" ? meta.opening_hook : null,
        keyword: typeof meta.primary_keyword === "string" ? meta.primary_keyword : null,
      });
    } catch (error) {
      // The link is the valuable half. Never lose it because the writing failed.
      promoError = error instanceof Error ? error.message : "Could not write the promo";
    }
  }

  const nextMeta: Record<string, unknown> = { ...meta, youtube_link: link };
  if (promo) nextMeta.youtube_promo = { ...promo, generated_at: new Date().toISOString() };

  const { data, error } = await db.from("content_items")
    .update({ meta: nextMeta, updated_at: new Date().toISOString() })
    .eq("id", itemId).select().maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not save the link" }, { status: 500 });

  return NextResponse.json({ item: data, link, promo, promoError });
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  const db = contentDb();
  const { data: row } = await db.from("content_items").select("meta").eq("id", itemId).maybeSingle();
  if (!row) return NextResponse.json({ error: "That production record no longer exists" }, { status: 404 });

  const meta = (row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
    ? { ...row.meta } : {}) as Record<string, unknown>;
  delete meta.youtube_link;
  delete meta.youtube_promo;

  const { error } = await db.from("content_items")
    .update({ meta, updated_at: new Date().toISOString() }).eq("id", itemId);
  if (error) return NextResponse.json({ error: "Could not unlink" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
