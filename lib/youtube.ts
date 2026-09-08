export const YOUTUBE_CHANNEL = {
  id: "UCbMr7zg8Eqv7_M_B-RuIgCA",
  name: "Andrew Kroeze",
  handle: "@andrewkroeze999",
  url: "https://www.youtube.com/@andrewkroeze999",
} as const;

export const DAY_MS = 86_400_000;
export const YOUTUBE_WINDOW_DAYS = 365;
export const YOUTUBE_STAGES = ["idea", "planning", "recording", "editing", "ready", "published"] as const;
export const YOUTUBE_FORMATS = ["long_form", "short"] as const;

export type YouTubeFormat = (typeof YOUTUBE_FORMATS)[number];
export type YouTubeStage = (typeof YOUTUBE_STAGES)[number];
export type YouTubeSort = "recent" | "best";

export type YouTubeVideo = {
  id: string;
  title: string;
  format: YouTubeFormat;
  publishedAt: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  periodViews: number | null;
  watchMinutes: number | null;
  averageViewDurationSeconds: number | null;
  averageViewPercentage: number | null;
  impressions: number | null;
  impressionsCtr: number | null;
  subscribersGained: number | null;
};

export type YouTubeIdeaInput = {
  title?: unknown;
  format?: unknown;
  targetDate?: unknown;
  viewer?: unknown;
  promise?: unknown;
  primaryKeyword?: unknown;
  openingHook?: unknown;
  stage?: unknown;
};

const nullableMetric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const boundedString = (value: unknown, field: string, max: number, required = false) => {
  if (value === null || value === undefined) {
    if (required) throw new Error(`${field} is required`);
    return "";
  }
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${field} is required`);
  if (trimmed.length > max) throw new Error(`${field} must be under ${max} characters`);
  return trimmed;
};

const validDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("targetDate must use YYYY-MM-DD");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("targetDate is invalid");
  return value;
};

export function safeHttpUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function parseYouTubeDurationSeconds(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text));
  const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const iso = text.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (iso) return Math.round(Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0));
  return null;
}

export function normalizeYouTubePublishedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T12:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === trimmed ? parsed.toISOString() : null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function isExpectedYouTubeProfile(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.port || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "youtube.com" && hostname !== "www.youtube.com") return false;
    const pathname = url.pathname.replace(/\/$/, "").toLowerCase();
    return pathname === `/@${YOUTUBE_CHANNEL.handle.slice(1).toLowerCase()}` || pathname === `/channel/${YOUTUBE_CHANNEL.id.toLowerCase()}`;
  } catch {
    return false;
  }
}

export type YouTubeContentType = "videos" | "shorts";

export function normalizeYouTubeRecoveryInput(input: unknown, runCreatedAt: number): { contentType: YouTubeContentType; publishedAfter: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input) || !Number.isFinite(runCreatedAt)) return null;
  const value = input as Record<string, unknown>;
  const exactKeys = ["channels", "contentType", "includeVideoStats", "maxVideosPerChannel", "publishedAfter", "sortBy"].sort();
  if (Object.keys(value).sort().join(",") !== exactKeys.join(",")) return null;
  if (!Array.isArray(value.channels) || value.channels.length !== 1 || value.channels[0] !== YOUTUBE_CHANNEL.handle) return null;
  if (value.contentType !== "videos" && value.contentType !== "shorts") return null;
  const createdAt = new Date(runCreatedAt);
  const acceptedCutoffs = [new Date(runCreatedAt - 365 * 86_400_000).toISOString().slice(0, 10)];
  // The input is built immediately before Apify creates the run. Only allow the
  // previous UTC date during the narrow rollover window while that request crosses midnight.
  if (createdAt.getUTCHours() === 0 && createdAt.getUTCMinutes() < 5) {
    acceptedCutoffs.push(new Date(runCreatedAt - 366 * 86_400_000).toISOString().slice(0, 10));
  }
  if (typeof value.publishedAfter !== "string" || !acceptedCutoffs.includes(value.publishedAfter)) return null;
  if (value.maxVideosPerChannel !== 500 || value.sortBy !== "newest" || value.includeVideoStats !== true) return null;
  return { contentType: value.contentType, publishedAfter: value.publishedAfter };
}

export type YouTubeActorPublicRow = {
  videoId: string;
  title: string | null;
  format: YouTubeFormat;
  publishedAt: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

export function normalizeYouTubeActorItem(item: Record<string, unknown>): YouTubeActorPublicRow | null {
  const status = String(item.status ?? "").trim().toLowerCase();
  if (!["success", "succeeded", "ok"].includes(status)) throw new Error("YouTube dataset row was not successful");
  const contentType = String(item.contentType ?? "").toLowerCase();
  const videoUrl = typeof item.videoUrl === "string" ? item.videoUrl : "";
  const format: YouTubeFormat | null = contentType === "short" || contentType === "shorts" || videoUrl.includes("/shorts/")
    ? "short"
    : contentType === "video" || contentType === "videos" || (videoUrl.includes("/watch") && !videoUrl.includes("/shorts/"))
      ? "long_form"
      : null;
  const channelIdMatches = typeof item.channelId === "string" && item.channelId === YOUTUBE_CHANNEL.id;
  const handleMatches = [item.channelHandle, item.channelUsername].some((value) =>
    typeof value === "string" && value.trim().toLowerCase() === YOUTUBE_CHANNEL.handle.toLowerCase(),
  );
  const urlMatches = [item.channelUrl, item.channelURL].some((value) => isExpectedYouTubeProfile(value));
  if (!channelIdMatches || (!handleMatches && !urlMatches)) throw new Error("YouTube dataset account mismatch");
  const videoId = typeof item.videoId === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(item.videoId) ? item.videoId : null;
  if (!videoId) return null;
  if (!format) return null;
  const publishedAt = normalizeYouTubePublishedAt(item.publishedDate ?? item.publishedAt ?? item.publishDate);
  if (!publishedAt) return null;
  return {
    videoId,
    title: typeof item.title === "string" ? item.title.trim().slice(0, 1_000) || null : null,
    format,
    publishedAt,
    durationSeconds: parseYouTubeDurationSeconds(item.durationSeconds ?? item.duration),
    thumbnailUrl: safeHttpUrl(item.thumbnailUrl ?? item.thumbnail),
    views: nullableMetric(item.viewCount),
    likes: nullableMetric(item.likeCount),
    comments: nullableMetric(item.commentCount),
  };
}

export function sortYouTubeVideos(rows: YouTubeVideo[], sort: YouTubeSort): YouTubeVideo[] {
  const hasPeriodAnalytics = rows.length > 0 && rows.every((row) => row.periodViews !== null);
  return [...rows].sort((a, b) => {
    if (sort === "recent") return Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id);
    const aMetric = hasPeriodAnalytics ? (a.periodViews ?? -1) : (a.views ?? -1);
    const bMetric = hasPeriodAnalytics ? (b.periodViews ?? -1) : (b.views ?? -1);
    return bMetric - aMetric || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id);
  });
}

export function aggregateYouTubeDashboard(rows: YouTubeVideo[]) {
  const sumAvailable = (key: keyof YouTubeVideo) => {
    const values = rows.map((row) => nullableMetric(row[key])).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const weightedCtr = rows.filter((row) => row.impressions !== null && row.impressionsCtr !== null && row.impressions! > 0);
  const impressions = sumAvailable("impressions");
  const impressionsCtr = weightedCtr.length && impressions
    ? weightedCtr.reduce((sum, row) => sum + row.impressions! * row.impressionsCtr!, 0) / impressions
    : null;
  const hasCompletePeriodViews = rows.length > 0 && rows.every((row) => row.periodViews !== null);
  return {
    uploads: rows.length,
    views: hasCompletePeriodViews ? sumAvailable("periodViews") : sumAvailable("views"),
    likes: sumAvailable("likes"),
    comments: sumAvailable("comments"),
    watchMinutes: sumAvailable("watchMinutes"),
    subscribersGained: sumAvailable("subscribersGained"),
    impressions,
    impressionsCtr,
    hasPrivateAnalytics: rows.some((row) =>
      row.periodViews !== null || row.watchMinutes !== null || row.averageViewDurationSeconds !== null ||
      row.averageViewPercentage !== null || row.impressions !== null || row.impressionsCtr !== null || row.subscribersGained !== null),
  };
}

export function normalizePostedYouTubeRow(row: Record<string, unknown>): YouTubeVideo | null {
  if (row.platform !== "youtube" || typeof row.external_id !== "string" || !row.external_id || typeof row.posted_at !== "string") return null;
  const posted = Date.parse(row.posted_at);
  if (!Number.isFinite(posted)) return null;
  const format = row.media_type === "short" ? "short" : row.media_type === "long" ? "long_form" : null;
  if (!format) return null;
  const id = row.external_id;
  const url = safeHttpUrl(row.post_url);
  const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : {};
  return {
    id,
    title: typeof row.text === "string" && row.text.trim() ? row.text.trim() : "Title unavailable",
    format,
    publishedAt: new Date(posted).toISOString(),
    durationSeconds: parseYouTubeDurationSeconds(row.duration_seconds ?? raw.durationSeconds ?? raw.duration),
    thumbnailUrl: safeHttpUrl(row.media_url) ?? (/^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null),
    url,
    views: nullableMetric(row.views),
    likes: nullableMetric(row.likes),
    comments: nullableMetric(row.comments),
    periodViews: null,
    watchMinutes: null,
    averageViewDurationSeconds: null,
    averageViewPercentage: null,
    impressions: null,
    impressionsCtr: null,
    subscribersGained: null,
  };
}

export function withinYouTubeWindow(rows: YouTubeVideo[], now = new Date()): YouTubeVideo[] {
  const cutoff = now.getTime() - YOUTUBE_WINDOW_DAYS * DAY_MS;
  return rows.filter((row) => {
    const published = Date.parse(row.publishedAt);
    return Number.isFinite(published) && published >= cutoff && published <= now.getTime();
  });
}

export function sanitizeYouTubeIdea(input: YouTubeIdeaInput) {
  const title = boundedString(input.title, "title", 500, true);
  if (!YOUTUBE_FORMATS.includes(input.format as YouTubeFormat)) throw new Error("format must be long_form or short");
  const stage = input.stage === undefined ? "idea" : input.stage;
  if (!YOUTUBE_STAGES.includes(stage as YouTubeStage)) throw new Error("stage is unsupported");
  return {
    title,
    category: "value",
    status: stage === "published" ? "posted" : stage === "idea" ? "idea" : "drafted",
    scheduled_date: validDate(input.targetDate),
    platforms: ["youtube"],
    creative_type: "video",
    video_script: null,
    media_urls: [],
    drafts: {},
    meta: {
      video_hub: true,
      video_destination: "youtube",
      video_stage: stage,
      youtube_format: input.format,
      target_viewer: boundedString(input.viewer, "viewer", 1_000),
      promise: boundedString(input.promise, "promise", 2_000),
      primary_keyword: boundedString(input.primaryKeyword, "primaryKeyword", 500),
      opening_hook: boundedString(input.openingHook, "openingHook", 2_000),
    },
  };
}

// ─── Create pipeline ─────────────────────────────────────────────────────────
// What has to be true before a video can be shot, and where each idea sits on
// the way there. Kept beside the stage list so the two can't drift apart.

export type PipelineStep = "angle" | "script" | "thumbnail" | "shoot";

export interface PipelineItem {
  id: string;
  title: string;
  scheduled_date: string | null;
  media_urls: string[];
  video_script: string | null;
  meta: Record<string, unknown>;
}

/**
 * The four things that turn an idea into something you can film. Deliberately
 * derived from the record rather than ticked by hand: a checklist you maintain
 * separately from the work is a checklist that lies.
 */
export function readiness(item: PipelineItem) {
  const meta = item.meta ?? {};
  const str = (key: string) => (typeof meta[key] === "string" ? (meta[key] as string).trim() : "");
  return {
    angle: Boolean(str("target_viewer") && str("promise")),
    script: Boolean(item.video_script?.trim() || meta.youtube_package),
    thumbnail: (item.media_urls ?? []).length > 0,
    shoot: Boolean(typeof meta.shoot_at === "string" && meta.shoot_at),
  } satisfies Record<PipelineStep, boolean>;
}

export const PIPELINE_STEPS: { key: PipelineStep; label: string; emoji: string; hint: string }[] = [
  { key: "angle", label: "Angle", emoji: "💡", hint: "Who it's for and what they get" },
  { key: "script", label: "Script", emoji: "📝", hint: "Hook, run of show and spoken script" },
  { key: "thumbnail", label: "Thumbnail", emoji: "🎨", hint: "The image that earns the click" },
  { key: "shoot", label: "Shoot booked", emoji: "🎬", hint: "A time in the calendar to film it" },
];

/** How far along, 0..1 — the number behind each card's bar. */
export function readinessScore(item: PipelineItem): number {
  const state = readiness(item);
  const done = PIPELINE_STEPS.filter((step) => state[step.key]).length;
  return done / PIPELINE_STEPS.length;
}

/** The next thing to do, or null when it's ready to film. */
export function nextStep(item: PipelineItem): PipelineStep | null {
  const state = readiness(item);
  return PIPELINE_STEPS.find((step) => !state[step.key])?.key ?? null;
}

/** The six stored stages, grouped into the five a person actually thinks in. */
export const PIPELINE_LANES: { key: string; label: string; emoji: string; stages: YouTubeStage[]; tone: string }[] = [
  { key: "ideas", label: "Ideas", emoji: "💡", stages: ["idea"], tone: "amber" },
  { key: "scripting", label: "Scripting", emoji: "📝", stages: ["planning"], tone: "blue" },
  { key: "shoot", label: "Ready to shoot", emoji: "🎬", stages: ["recording"], tone: "red" },
  { key: "editing", label: "Editing", emoji: "✂️", stages: ["editing"], tone: "violet" },
  { key: "publish", label: "Ready to publish", emoji: "✅", stages: ["ready"], tone: "emerald" },
];

export function stageOf(item: PipelineItem): YouTubeStage {
  const stage = item.meta?.video_stage;
  return YOUTUBE_STAGES.includes(stage as YouTubeStage) ? (stage as YouTubeStage) : "idea";
}

export interface PipelineLane<T> { key: string; label: string; emoji: string; tone: string; items: T[] }

/**
 * Split the pipeline into lanes, most-ready first inside each one.
 *
 * Published work leaves the board the way finished projects do — it is a
 * record, not a queue.
 */
export function buildPipeline<T extends PipelineItem>(items: T[]) {
  const published = items.filter((item) => stageOf(item) === "published");
  const live = items.filter((item) => stageOf(item) !== "published");

  const lanes: PipelineLane<T>[] = PIPELINE_LANES.map((lane) => ({
    key: lane.key,
    label: lane.label,
    emoji: lane.emoji,
    tone: lane.tone,
    items: live
      .filter((item) => lane.stages.includes(stageOf(item)))
      .sort((a, b) => {
        const ready = readinessScore(b) - readinessScore(a);
        if (ready !== 0) return ready;
        return String(a.scheduled_date ?? "9999").localeCompare(String(b.scheduled_date ?? "9999"));
      }),
  }));

  // Anything with a time in the calendar, soonest first — the shoot list.
  const booked = live
    .filter((item) => typeof item.meta?.shoot_at === "string" && item.meta.shoot_at)
    .sort((a, b) => String(a.meta.shoot_at).localeCompare(String(b.meta.shoot_at)));

  return { lanes, published, booked, liveCount: live.length };
}
