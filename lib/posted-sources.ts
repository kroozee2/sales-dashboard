import { contentDb } from "@/lib/supabase-content";
import { mapInstagram } from "@/lib/posted-instagram";
import { YOUTUBE_CHANNEL, normalizeYouTubeActorItem, normalizeYouTubeRecoveryInput, type YouTubeContentType } from "@/lib/youtube";
export { mapInstagram } from "@/lib/posted-instagram";

// ── Shared config + mappers for the Posted tab's social sources ──────────────
export const FB_PROFILE = "https://www.facebook.com/andrew.kroeze.50";
export const IG_PROFILE = "https://www.instagram.com/kaptainkroeze/";
export const YT_PROFILE = "https://www.youtube.com/@andrewkroeze999";
export const YT_HANDLE = "@andrewkroeze999";
const FB_ACTOR = "apify~facebook-posts-scraper";
const IG_ACTOR = "apify~instagram-scraper";
export const YT_ACTOR = "lurkapi~youtube-channel-videos-stats-scraper";
const num = (v: unknown) => Number(v ?? 0) || 0;
const apifyHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export type Row = {
  platform: string; profile_name: string; profile_url: string; post_url: string | null;
  external_id: string; text: string | null; posted_at: string | null;
  likes: number | null; comments: number | null; shares: number | null; reactions: number | null; views: number | null; media_type: string | null;
  media_url?: string | null; raw?: Record<string, unknown> | null;
};

export type Platform = "facebook" | "instagram" | "youtube";
export type YouTubeRunRef = { runId: string; datasetId: string; contentType: YouTubeContentType; publishedAfter: string };
export const ALL_PLATFORMS: Platform[] = ["instagram", "facebook", "youtube"];

// Rolling windows: 90 days for FB/IG and the requested 365 days for YouTube.
const since90 = () => new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
export const since365 = () => new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

const youtubeInput = (contentType: YouTubeContentType, publishedAfter = since365()) => ({
  channels: [YT_HANDLE], maxVideosPerChannel: 500, contentType, sortBy: "newest", publishedAfter, includeVideoStats: true,
});

// One Apify actor "job" — an actor + input. YouTube expands to two (videos + shorts).
function jobsFor(platform: Platform): { actor: string; input: unknown }[] {
  if (platform === "facebook") return [{ actor: FB_ACTOR, input: { startUrls: [{ url: FB_PROFILE }], resultsLimit: 200, captionText: true, onlyPostsNewerThan: since90() } }];
  // No onlyPostsNewerThan here. The Instagram actor returns far less when it is
  // set: the same profile gave 15 items with it and 60 without, and the 15
  // included posts from 2021 while missing that week's. withinWindow() trims to
  // 90 days on our side anyway, so the filter cost coverage and bought nothing.
  if (platform === "instagram") return [{ actor: IG_ACTOR, input: { directUrls: [IG_PROFILE], resultsType: "posts", resultsLimit: 200 } }];
  return (["videos", "shorts"] as const).map((contentType) => ({ actor: YT_ACTOR, input: youtubeInput(contentType) }));
}

function mapper(platform: Platform): (items: Record<string, unknown>[]) => Row[] {
  return platform === "facebook" ? mapFacebook : platform === "instagram" ? mapInstagram : mapYouTube;
}

// Drop pinned/stale items the scrapers return despite the date filter.
export function withinWindow(rows: Row[]): Row[] {
  const cutoffOther = Date.parse(since90());
  const cutoffYt = Date.parse(since365());
  return rows.filter((r) => r.posted_at && Date.parse(r.posted_at) >= (r.platform === "youtube" ? cutoffYt : cutoffOther));
}

// ── Apify REST helpers ───────────────────────────────────────────────────────
// Start an actor run (returns fast) — used by the async per-platform sync.
export async function startRun(actor: string, input: unknown, token: string): Promise<{ runId: string; datasetId: string }> {
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/runs`, {
    method: "POST", headers: { ...apifyHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify start ${actor} failed (${res.status})`);
  const j = await res.json();
  return { runId: j.data.id, datasetId: j.data.defaultDatasetId };
}

export async function startPlatform(platform: Platform, token: string) {
  return Promise.all(jobsFor(platform).map((j) => startRun(j.actor, j.input, token)));
}

export async function startYouTubeRun(contentType: YouTubeContentType, token: string): Promise<YouTubeRunRef> {
  const publishedAfter = since365();
  const run = await startRun(YT_ACTOR, youtubeInput(contentType, publishedAfter), token);
  return { ...run, contentType, publishedAfter };
}

// Poll a run's status.
export async function runStatus(runId: string, token: string): Promise<string> {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: apifyHeaders(token) });
  if (!res.ok) throw new Error(`Apify status ${runId} failed (${res.status})`);
  return (await res.json()).data.status as string;
}

export async function findRecentInstagramRuns(token: string): Promise<{ runId: string; datasetId: string }[]> {
  const res = await fetch(`https://api.apify.com/v2/acts/${IG_ACTOR}/runs?desc=1&limit=10`, { headers: apifyHeaders(token) });
  if (!res.ok) throw new Error(`Apify recent Instagram runs failed (${res.status})`);
  const json = await res.json() as { data?: { items?: Array<Record<string, unknown>> } };
  const cutoff = Date.now() - 30 * 60_000;
  const reusable = new Set(["READY", "RUNNING", "SUCCEEDED"]);
  const candidates = (json.data?.items ?? []).filter((run) => {
    const startedAt = Date.parse(String(run.startedAt ?? ""));
    return reusable.has(String(run.status ?? "")) && Number.isFinite(startedAt) && startedAt >= cutoff && run.id && run.defaultDatasetId && run.defaultKeyValueStoreId;
  });

  for (const run of candidates) {
    const inputResponse = await fetch(
      `https://api.apify.com/v2/key-value-stores/${String(run.defaultKeyValueStoreId)}/records/INPUT`,
      { headers: apifyHeaders(token) },
    );
    if (!inputResponse.ok) continue;
    const input = await inputResponse.json() as { directUrls?: Array<string | { url?: string }> };
    const directUrls = (input.directUrls ?? []).map((entry) => typeof entry === "string" ? entry : entry.url ?? "");
    if (directUrls.includes(IG_PROFILE)) {
      return [{ runId: String(run.id), datasetId: String(run.defaultDatasetId) }];
    }
  }
  return [];
}

export async function findRecentYouTubeRuns(token: string): Promise<YouTubeRunRef[]> {
  const res = await fetch(`https://api.apify.com/v2/acts/${YT_ACTOR}/runs?desc=1&limit=20`, { headers: apifyHeaders(token) });
  if (!res.ok) throw new Error(`Apify recent YouTube runs failed (${res.status})`);
  const json = await res.json() as { data?: { items?: Array<Record<string, unknown>> } };
  const cutoff = Date.now() - 30 * 60_000;
  const reusable = new Set(["READY", "RUNNING", "SUCCEEDED"]);
  const byType = new Map<YouTubeContentType, YouTubeRunRef>();
  const candidates = (json.data?.items ?? []).filter((run) => {
    const startedAt = Date.parse(String(run.startedAt ?? ""));
    return reusable.has(String(run.status ?? "")) && Number.isFinite(startedAt) && startedAt >= cutoff && run.id && run.defaultDatasetId && run.defaultKeyValueStoreId;
  });

  for (const run of candidates) {
    const inputResponse = await fetch(
      `https://api.apify.com/v2/key-value-stores/${String(run.defaultKeyValueStoreId)}/records/INPUT`,
      { headers: apifyHeaders(token) },
    );
    if (!inputResponse.ok) continue;
    const createdAt = Date.parse(String(run.createdAt ?? ""));
    const input = normalizeYouTubeRecoveryInput(await inputResponse.json(), createdAt);
    if (input && !byType.has(input.contentType)) {
      byType.set(input.contentType, { runId: String(run.id), datasetId: String(run.defaultDatasetId), ...input });
    }
  }
  return (["videos", "shorts"] as const).flatMap((contentType) => byType.get(contentType) ?? []);
}

// Read a finished run's dataset, map to rows, date-guard, and upsert.
export async function ingestDataset(platform: Platform, datasetId: string, token: string): Promise<number> {
  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json`, { headers: apifyHeaders(token) });
  if (!res.ok) throw new Error(`Apify dataset ${datasetId} failed (${res.status})`);
  const items = (await res.json()) as Record<string, unknown>[];
  const rows = withinWindow(mapper(platform)(Array.isArray(items) ? items : []));
  if (rows.length) {
    const { error } = await contentDb().from("posted_content").upsert(rows, { onConflict: "external_id" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

// Synchronous run-and-ingest (used by the /route.ts POST for curl/backfill).
export async function runActorSync(actor: string, input: unknown, token: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`, {
    method: "POST", headers: { ...apifyHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${actor} failed (${res.status})`);
  const j = await res.json();
  return Array.isArray(j) ? j : [];
}

export function mapFacebook(items: Record<string, unknown>[]): Row[] {
  return items.map((p) => ({
    platform: "facebook",
    profile_name: (p["user.name"] as string) || (p.user as { name?: string })?.name || "Andrew Kroeze",
    profile_url: FB_PROFILE,
    post_url: (p.url as string) || (p.topLevelUrl as string) || null,
    external_id: p.postId as string,
    text: (p.text as string) ?? null,
    posted_at: (p.time as string) ?? null,
    likes: num(p.likes), comments: num(p.comments), shares: num(p.shares), reactions: num(p.topReactionsCount),
    views: num(p.viewsCount),
    media_type: p.isVideo ? "video" : null,
  })).filter((r) => r.external_id);
}

export function mapYouTube(items: Record<string, unknown>[]): Row[] {
  return items.map((p): Row | null => {
    const normalized = normalizeYouTubeActorItem(p);
    if (!normalized) return null;
    return {
      platform: "youtube",
      profile_name: YOUTUBE_CHANNEL.name,
      profile_url: YT_PROFILE,
      post_url: normalized.format === "short" ? `https://www.youtube.com/shorts/${normalized.videoId}` : `https://www.youtube.com/watch?v=${normalized.videoId}`,
      external_id: normalized.videoId,
      text: normalized.title,
      posted_at: normalized.publishedAt,
      likes: normalized.likes, comments: normalized.comments, shares: null, reactions: normalized.likes,
      views: normalized.views,
      media_type: normalized.format === "short" ? "short" : "long",
      media_url: normalized.thumbnailUrl,
      raw: {
        channelId: YOUTUBE_CHANNEL.id,
        channelHandle: YOUTUBE_CHANNEL.handle,
        contentType: normalized.format,
        durationSeconds: normalized.durationSeconds,
      },
    };
  }).filter((row): row is Row => Boolean(row?.external_id && row.posted_at));
}
