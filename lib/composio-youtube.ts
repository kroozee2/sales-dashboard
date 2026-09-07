const EXPECTED_CHANNEL_ID = "UCbMr7zg8Eqv7_M_B-RuIgCA";
export type ComposioYouTubeFormat = "long_form" | "short";

export function normalizeStrictUtcTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())
    || parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() + 1 !== Number(month)
    || parsed.getUTCDate() !== Number(day)
    || parsed.getUTCHours() !== Number(hour)
    || parsed.getUTCMinutes() !== Number(minute)
    || parsed.getUTCSeconds() !== Number(second)) return null;
  return parsed.toISOString();
}

export function normalizeFreshUtcTimestamp(
  value: unknown,
  now = new Date(),
  maxAgeMs = 48 * 60 * 60_000,
  maxFutureMs = 15 * 60_000,
): string | null {
  const normalized = normalizeStrictUtcTimestamp(value);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  return timestamp >= now.getTime() - maxAgeMs && timestamp <= now.getTime() + maxFutureMs ? normalized : null;
}

function parseDurationSeconds(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const iso = value.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (iso) return Math.round(Number(iso[1] ?? 0) * 86_400 + Number(iso[2] ?? 0) * 3_600 + Number(iso[3] ?? 0) * 60 + Number(iso[4] ?? 0));
  const clock = value.split(":").map(Number);
  if ((clock.length === 2 || clock.length === 3) && clock.every((part) => Number.isFinite(part) && part >= 0)) {
    return clock.length === 2 ? clock[0] * 60 + clock[1] : clock[0] * 3_600 + clock[1] * 60 + clock[2];
  }
  return /^\d+(?:\.\d+)?$/.test(value) ? Math.round(Number(value)) : null;
}

export type ComposioYouTubeItem = {
  id?: unknown;
  title?: unknown;
  publishedAt?: unknown;
  duration?: unknown;
  views?: unknown;
  likes?: unknown;
  comments?: unknown;
  thumbnailUrl?: unknown;
  format?: unknown;
  privacyStatus?: unknown;
  channelId?: unknown;
};

export type NormalizedComposioYouTubeItem = {
  id: string;
  title: string;
  publishedAt: string;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  thumbnailUrl: string | null;
  format: ComposioYouTubeFormat;
  url: string;
};

function nullableCounter(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) {
    throw new Error(`Invalid ${field}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function thumbnail(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2_048) throw new Error("Invalid thumbnail URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid thumbnail URL");
  }
  if (parsed.protocol !== "https:" || !/(^|\.)ytimg\.com$/i.test(parsed.hostname) || parsed.username || parsed.password || parsed.port) {
    throw new Error("Invalid thumbnail URL");
  }
  return parsed.toString();
}

export function normalizeComposioYouTubeItem(
  item: ComposioYouTubeItem,
  now = new Date(),
): NormalizedComposioYouTubeItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid Composio item");
  const allowed = new Set(["id", "title", "publishedAt", "duration", "views", "likes", "comments", "thumbnailUrl", "format", "privacyStatus", "channelId"]);
  if (Object.keys(item).some((key) => !allowed.has(key))) throw new Error("Unsupported Composio item field");
  if (item.channelId !== EXPECTED_CHANNEL_ID) throw new Error("Composio YouTube account mismatch");
  if (item.privacyStatus !== "public") throw new Error("Composio imports must be public");
  if (item.format !== "long_form" && item.format !== "short") throw new Error("Invalid YouTube format");
  if (typeof item.id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(item.id)) throw new Error("Invalid YouTube video ID");
  if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 500) throw new Error("Invalid YouTube title");

  const publishedAt = normalizeStrictUtcTimestamp(item.publishedAt);
  if (!publishedAt) throw new Error("Invalid YouTube publish date");
  const publishedMs = Date.parse(publishedAt);
  const cutoff = now.getTime() - 365 * 86_400_000;
  if (publishedMs < cutoff || publishedMs > now.getTime() + 5 * 60_000) {
    throw new Error("YouTube item is outside the rolling 365-day window");
  }

  const durationSeconds = item.duration === undefined || item.duration === null || item.duration === ""
    ? null
    : parseDurationSeconds(item.duration);
  if (item.duration !== undefined && item.duration !== null && item.duration !== "" && durationSeconds === null) {
    throw new Error("Invalid YouTube duration");
  }

  const format = item.format as ComposioYouTubeFormat;
  return {
    id: item.id,
    title: item.title.trim(),
    publishedAt,
    durationSeconds,
    views: nullableCounter(item.views, "views"),
    likes: nullableCounter(item.likes, "likes"),
    comments: nullableCounter(item.comments, "comments"),
    thumbnailUrl: thumbnail(item.thumbnailUrl),
    format,
    url: format === "short"
      ? `https://www.youtube.com/shorts/${item.id}`
      : `https://www.youtube.com/watch?v=${item.id}`,
  };
}
