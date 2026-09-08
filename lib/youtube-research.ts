// Reading a competitor channel, kept pure so the maths can be checked without
// a network call or a browser.
//
// The one question this file answers: of everything a channel published, which
// videos beat that channel's own normal? Raw view counts only tell you how big
// someone's audience is. A video at four times its channel's median is the
// idea doing the work, and that is the part worth modelling.

export interface CompetitorVideo {
  video_id: string;
  title: string;
  url: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  likes: number | null;
  published_at: string | null;
  is_short: boolean;
}

export interface Competitor {
  id: string;
  handle: string;
  name: string;
  channel_url: string;
  subscribers: number | null;
  total_views: number | null;
  video_count: number | null;
  description: string | null;
  why_watch: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Whole days since publication, at least 1 so same-day videos don't divide by zero. */
export function daysSince(published: string | null, now = new Date()): number | null {
  if (!published) return null;
  const then = Date.parse(published);
  if (!Number.isFinite(then)) return null;
  return Math.max(1, Math.round((now.getTime() - then) / 86400000));
}

/** Views per day — the only fair way to compare a video from last week with one from last year. */
export function velocity(video: CompetitorVideo, now = new Date()): number | null {
  const days = daysSince(video.published_at, now);
  if (days === null || video.view_count === null) return null;
  return video.view_count / days;
}

export interface ScoredVideo extends CompetitorVideo {
  competitorId: string;
  competitorName: string;
  ageDays: number | null;
  viewsPerDay: number | null;
  /** Views as a multiple of this channel's median. 1 means "their normal". */
  multiple: number | null;
}

/**
 * Score every video against its own channel.
 *
 * Shorts and long-form are compared separately: a channel's Shorts routinely
 * out-view its long-form by an order of magnitude, and mixing them would mark
 * every Short an outlier and every video a failure.
 */
export function scoreChannel(competitor: Competitor, videos: CompetitorVideo[], now = new Date()): ScoredVideo[] {
  const baseline = (isShort: boolean) => {
    const views = videos
      .filter((v) => v.is_short === isShort && typeof v.view_count === "number")
      .map((v) => v.view_count as number);
    return median(views);
  };
  const longMedian = baseline(false);
  const shortMedian = baseline(true);

  return videos.map((video) => {
    const base = video.is_short ? shortMedian : longMedian;
    return {
      ...video,
      competitorId: competitor.id,
      competitorName: competitor.name,
      ageDays: daysSince(video.published_at, now),
      viewsPerDay: velocity(video, now),
      multiple: base > 0 && video.view_count !== null ? video.view_count / base : null,
    };
  });
}

/** The channel's own normal, for the header line on its card. */
export function channelSummary(videos: CompetitorVideo[], now = new Date()) {
  const long = videos.filter((v) => !v.is_short);
  const shorts = videos.filter((v) => v.is_short);
  const viewsOf = (rows: CompetitorVideo[]) => rows.map((v) => v.view_count).filter((n): n is number => typeof n === "number");

  const dated = videos.map((v) => v.published_at).filter((d): d is string => !!d).sort();
  let uploadsPerMonth: number | null = null;
  if (dated.length >= 2) {
    const span = (Date.parse(dated[dated.length - 1]) - Date.parse(dated[0])) / 86400000;
    if (span > 0) uploadsPerMonth = (dated.length / span) * 30;
  }

  return {
    tracked: videos.length,
    longCount: long.length,
    shortCount: shorts.length,
    medianLongViews: Math.round(median(viewsOf(long))),
    medianShortViews: Math.round(median(viewsOf(shorts))),
    uploadsPerMonth: uploadsPerMonth === null ? null : Math.round(uploadsPerMonth * 10) / 10,
    lastPublishedDays: dated.length ? daysSince(dated[dated.length - 1], now) : null,
  };
}

/**
 * The videos worth modelling: at least `threshold`× their channel's median,
 * biggest multiple first. Falls back to plain best-performers when a channel
 * is too flat to have outliers, so the panel is never empty for no reason.
 */
export function pickOutliers(scored: ScoredVideo[], threshold = 1.5, limit = 12): ScoredVideo[] {
  const withMultiple = scored.filter((v) => v.multiple !== null);
  const outliers = withMultiple
    .filter((v) => (v.multiple as number) >= threshold)
    .sort((a, b) => (b.multiple as number) - (a.multiple as number));
  if (outliers.length) return outliers.slice(0, limit);
  return [...withMultiple]
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .slice(0, limit);
}

/** Shorts are the vertical ones; the scraper doesn't always say so directly. */
export function looksLikeShort(row: { url?: unknown; duration?: unknown; type?: unknown }): boolean {
  if (typeof row.type === "string" && row.type.toLowerCase().includes("short")) return true;
  if (typeof row.url === "string" && row.url.includes("/shorts/")) return true;
  const duration = typeof row.duration === "string" ? parseDuration(row.duration) : null;
  return duration !== null && duration <= 60;
}

/** "1:23" or "01:02:03" → seconds. */
export function parseDuration(value: string): number | null {
  const parts = value.trim().split(":").map((p) => Number(p));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}
