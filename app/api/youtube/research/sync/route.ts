import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { looksLikeShort, parseDuration } from "@/lib/youtube-research";

export const runtime = "nodejs";
export const maxDuration = 300;

const ACTOR = "streamers~youtube-scraper";
const MAX_VIDEOS = 30;

type ScrapedVideo = Record<string, unknown>;

const num = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value.replace(/[^\d.]/g, "")) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (value: unknown, max = 500): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/**
 * Pull a channel's recent uploads.
 *
 * One actor run per channel rather than one for all three: a single failing
 * channel then costs us that channel, not the whole sync.
 */
async function scrapeChannel(token: string, channelUrl: string): Promise<ScrapedVideo[]> {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: `${channelUrl.replace(/\/+$/, "")}/videos` }],
        maxResults: MAX_VIDEOS,
        maxResultsShorts: 0,
        maxResultStreams: 0,
      }),
      signal: AbortSignal.timeout(240_000),
    },
  );
  if (!response.ok) throw new Error(`Apify returned ${response.status}`);
  const items = await response.json();
  return Array.isArray(items) ? (items as ScrapedVideo[]) : [];
}

export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "APIFY_TOKEN is not configured, so channels cannot be refreshed" }, { status: 503 });
  }

  const db = contentDb();
  const url = new URL(req.url);
  const only = url.searchParams.get("handle");

  let query = db.from("yt_competitors").select("*").eq("active", true);
  if (only) query = query.eq("handle", only);
  const { data: channels, error } = await query.order("sort_order", { ascending: true });
  if (error || !channels?.length) {
    return NextResponse.json({ error: "No competitor channels to refresh" }, { status: error ? 502 : 404 });
  }

  const results: { handle: string; videos: number; error?: string }[] = [];

  for (const channel of channels as { id: string; handle: string; channel_url: string }[]) {
    try {
      const scraped = await scrapeChannel(token, channel.channel_url);

      // Channel-level fields ride along on every row; take them from the first.
      const head = scraped[0] ?? {};
      await db.from("yt_competitors").update({
        channel_id: str(head.channelId, 100),
        subscribers: num(head.numberOfSubscribers),
        total_views: num(head.channelTotalViews),
        video_count: num(head.channelTotalVideos),
        description: str(head.channelDescription, 4_000),
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
      }).eq("id", channel.id);

      const rows = scraped
        .map((item) => {
          const videoId = str(item.id, 60);
          const title = str(item.title, 500);
          if (!videoId || !title) return null;
          const durationSeconds = typeof item.duration === "string" ? parseDuration(item.duration) : null;
          const published = str(item.date, 60);
          return {
            competitor_id: channel.id,
            video_id: videoId,
            title,
            url: str(item.url, 500),
            thumbnail_url: str(item.thumbnailUrl, 1_000),
            view_count: num(item.viewCount),
            likes: num(item.likes),
            comments: num(item.commentsCount),
            duration_seconds: durationSeconds,
            is_short: looksLikeShort(item),
            published_at: published && Number.isFinite(Date.parse(published)) ? published : null,
            captured_at: new Date().toISOString(),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (rows.length) {
        // Upsert on (competitor, video): a re-run refreshes view counts on the
        // videos we already have rather than stacking duplicates.
        await db.from("yt_competitor_videos").upsert(rows, { onConflict: "competitor_id,video_id" });
      }
      results.push({ handle: channel.handle, videos: rows.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Channel refresh failed";
      await db.from("yt_competitors")
        .update({ last_sync_error: message.slice(0, 500) })
        .eq("id", channel.id);
      results.push({ handle: channel.handle, videos: 0, error: message });
    }
  }

  const total = results.reduce((sum, r) => sum + r.videos, 0);
  return NextResponse.json({ ok: true, synced: total, results });
}
