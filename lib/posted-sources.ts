import { contentDb } from "@/lib/supabase-content";

// ── Shared config + mappers for the Posted tab's social sources ──────────────
export const FB_PROFILE = "https://www.facebook.com/andrew.kroeze.50";
export const IG_PROFILE = "https://www.instagram.com/kaptainkroeze/";
export const YT_PROFILE = "https://www.youtube.com/andrewkroeze999";
const YT_HANDLE = "@andrewkroeze999";
const FB_ACTOR = "apify~facebook-posts-scraper";
const IG_ACTOR = "apify~instagram-scraper";
const YT_ACTOR = "lurkapi~youtube-channel-videos-stats-scraper";
const num = (v: unknown) => Number(v ?? 0) || 0;

export type Row = {
  platform: string; profile_name: string; profile_url: string; post_url: string | null;
  external_id: string; text: string | null; posted_at: string | null;
  likes: number; comments: number; shares: number; reactions: number; views: number; media_type: string | null;
};

export type Platform = "facebook" | "instagram" | "youtube";
export const ALL_PLATFORMS: Platform[] = ["instagram", "facebook", "youtube"];

// Rolling 90-day window for FB/IG; YouTube is scoped to the start of the year.
const since90 = () => new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
const yearStart = () => `${new Date().getUTCFullYear()}-01-01`;

// One Apify actor "job" — an actor + input. YouTube expands to two (videos + shorts).
function jobsFor(platform: Platform): { actor: string; input: unknown }[] {
  if (platform === "facebook") return [{ actor: FB_ACTOR, input: { startUrls: [{ url: FB_PROFILE }], resultsLimit: 200, captionText: true, onlyPostsNewerThan: since90() } }];
  if (platform === "instagram") return [{ actor: IG_ACTOR, input: { directUrls: [IG_PROFILE], resultsType: "posts", resultsLimit: 200, onlyPostsNewerThan: since90() } }];
  return (["videos", "shorts"] as const).map((ct) => ({ actor: YT_ACTOR, input: { channels: [YT_HANDLE], maxVideosPerChannel: 0, contentType: ct, sortBy: "newest", publishedAfter: yearStart(), includeVideoStats: true } }));
}

function mapper(platform: Platform): (items: Record<string, unknown>[]) => Row[] {
  return platform === "facebook" ? mapFacebook : platform === "instagram" ? mapInstagram : mapYouTube;
}

// Drop pinned/stale items the scrapers return despite the date filter.
export function withinWindow(rows: Row[]): Row[] {
  const cutoffOther = Date.parse(since90());
  const cutoffYt = Date.parse(yearStart());
  return rows.filter((r) => r.posted_at && Date.parse(r.posted_at) >= (r.platform === "youtube" ? cutoffYt : cutoffOther));
}

// ── Apify REST helpers ───────────────────────────────────────────────────────
// Start an actor run (returns fast) — used by the async per-platform sync.
export async function startRun(actor: string, input: unknown, token: string): Promise<{ runId: string; datasetId: string }> {
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?token=${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify start ${actor} failed (${res.status})`);
  const j = await res.json();
  return { runId: j.data.id, datasetId: j.data.defaultDatasetId };
}

export async function startPlatform(platform: Platform, token: string) {
  return Promise.all(jobsFor(platform).map((j) => startRun(j.actor, j.input, token)));
}

// Poll a run's status.
export async function runStatus(runId: string, token: string): Promise<string> {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
  if (!res.ok) throw new Error(`Apify status ${runId} failed (${res.status})`);
  return (await res.json()).data.status as string;
}

// Read a finished run's dataset, map to rows, date-guard, and upsert.
export async function ingestDataset(platform: Platform, datasetId: string, token: string): Promise<number> {
  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${token}`);
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
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
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

export function mapInstagram(items: Record<string, unknown>[]): Row[] {
  return items.map((p) => {
    const shortcode = (p.shortCode as string) || (p.shortcode as string) || "";
    const type = ((p.type as string) || (p.productType as string) || "").toLowerCase();
    return {
      platform: "instagram",
      profile_name: (p.ownerUsername as string) ? `@${p.ownerUsername as string}` : "@kaptainkroeze",
      profile_url: IG_PROFILE,
      post_url: (p.url as string) || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : null),
      external_id: (p.id as string) || shortcode,
      text: (p.caption as string) ?? null,
      posted_at: (p.timestamp as string) ?? null,
      likes: num(p.likesCount), comments: num(p.commentsCount), shares: 0, reactions: num(p.likesCount),
      views: num(p.videoPlayCount) || num(p.videoViewCount),
      media_type: type.includes("video") || type.includes("reel") || type === "clips" ? "video" : type.includes("sidecar") ? "carousel" : "image",
    };
  }).filter((r) => r.external_id);
}

export function mapYouTube(items: Record<string, unknown>[]): Row[] {
  return items.map((p) => {
    const urlStr = (p.videoUrl as string) || "";
    const ct = ((p.contentType as string) || "").toLowerCase();
    const isShort = ct === "short" || ct === "shorts" || urlStr.includes("/shorts/") || (num(p.durationSeconds) > 0 && num(p.durationSeconds) <= 60);
    return {
      platform: "youtube",
      profile_name: (p.channelName as string) || "Andrew Kroeze",
      profile_url: YT_PROFILE,
      post_url: urlStr || null,
      external_id: (p.videoId as string) || urlStr,
      text: (p.title as string) ?? null,
      posted_at: (p.publishedDate as string) ? `${p.publishedDate}T12:00:00Z` : null,
      likes: num(p.likeCount), comments: num(p.commentCount), shares: 0, reactions: num(p.likeCount),
      views: num(p.viewCount),
      media_type: isShort ? "short" : "long",
    };
  }).filter((r) => r.external_id && r.posted_at);
}
