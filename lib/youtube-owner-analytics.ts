const CHANNEL_ID = "UCbMr7zg8Eqv7_M_B-RuIgCA" as const;
const CHANNEL_HANDLE = "@andrewkroeze999" as const;

const SOURCE = "youtube-analytics-api";
const DAY_MS = 86_400_000;
const IMPORT_FRESHNESS_MS = 15 * 60_000;
const STORED_FRESHNESS_MS = 48 * 60 * 60_000;

const strictUtcTimestamp = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const milliseconds = Number((fraction + "000").slice(0, 3));
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), milliseconds));
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day) || parsed.getUTCHours() !== Number(hour) || parsed.getUTCMinutes() !== Number(minute) || parsed.getUTCSeconds() !== Number(second)) return null;
  return parsed.toISOString();
};

export type OwnerAnalytics = {
  source: typeof SOURCE;
  channelId: typeof CHANNEL_ID;
  channelHandle: typeof CHANNEL_HANDLE;
  startDate: string;
  endDate: string;
  fetchedAt: string;
  metrics: {
    views: number;
    estimatedMinutesWatched: number;
    averageViewDuration: number;
    averageViewPercentage: number;
    subscribersGained: number;
    subscribersLost: number;
    subscribersNet: number;
  };
  trafficSources: Array<{ type: string; views: number }>;
};

const strictDate = (value: unknown, field: string) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be a real UTC date`);
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${field} must be a real UTC date`);
  return value;
};

const metric = (value: unknown, field: string, max = 1_000_000_000_000_000) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) throw new Error(`${field} must be a bounded non-negative number`);
  return value;
};

const counter = (value: unknown, field: string) => {
  const normalized = metric(value, field, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(normalized)) throw new Error(`${field} must be a non-negative safe integer`);
  return normalized;
};

function normalize(value: unknown, now: Date, freshnessMs: number): OwnerAnalytics {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Owner analytics payload must be an object");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["source", "provider", "channelId", "channelHandle", "startDate", "endDate", "fetchedAt", "metrics", "trafficSources"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("Unsupported owner analytics field");
  if (input.source !== SOURCE || input.channelId !== CHANNEL_ID || input.channelHandle !== CHANNEL_HANDLE) {
    throw new Error("YouTube Analytics account mismatch");
  }
  const fetchedAt = strictUtcTimestamp(input.fetchedAt);
  if (!fetchedAt) throw new Error("Valid fetchedAt required");
  const age = now.getTime() - Date.parse(fetchedAt);
  if (age < -15 * 60_000 || age > freshnessMs) throw new Error("Valid fetchedAt required");
  const startDate = strictDate(input.startDate, "startDate");
  const endDate = strictDate(input.endDate, "endDate");
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (startMs > endMs || endMs - startMs > 364 * DAY_MS || endMs > todayUtc - DAY_MS) throw new Error("Analytics date range is invalid");
  if (!input.metrics || typeof input.metrics !== "object" || Array.isArray(input.metrics)) throw new Error("metrics must be an object");
  const metrics = input.metrics as Record<string, unknown>;
  const metricKeys = ["views", "estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage", "subscribersGained", "subscribersLost"];
  if (Object.keys(metrics).some((key) => !metricKeys.includes(key)) || metricKeys.some((key) => !Object.hasOwn(metrics, key))) {
    throw new Error("Owner analytics metrics are incomplete");
  }
  const subscribersGained = counter(metrics.subscribersGained, "subscribersGained");
  const subscribersLost = counter(metrics.subscribersLost, "subscribersLost");
  if (!Array.isArray(input.trafficSources) || input.trafficSources.length > 50) throw new Error("trafficSources must contain at most 50 rows");
  const trafficSourceTypes = new Set<string>();
  const trafficSources = input.trafficSources.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`trafficSources ${index + 1} is invalid`);
    const item = row as Record<string, unknown>;
    if (Object.keys(item).some((key) => key !== "type" && key !== "views") || typeof item.type !== "string" || !/^[A-Z0-9_]{1,64}$/.test(item.type)) {
      throw new Error(`trafficSources ${index + 1} is invalid`);
    }
    if (trafficSourceTypes.has(item.type)) throw new Error("trafficSources must use unique types");
    trafficSourceTypes.add(item.type);
    return { type: item.type, views: counter(item.views, `trafficSources ${index + 1} views`) };
  });
  return {
    source: SOURCE,
    channelId: CHANNEL_ID,
    channelHandle: CHANNEL_HANDLE,
    startDate,
    endDate,
    fetchedAt,
    metrics: {
      views: counter(metrics.views, "views"),
      estimatedMinutesWatched: metric(metrics.estimatedMinutesWatched, "estimatedMinutesWatched"),
      averageViewDuration: metric(metrics.averageViewDuration, "averageViewDuration", 86_400),
      averageViewPercentage: metric(metrics.averageViewPercentage, "averageViewPercentage", 100),
      subscribersGained,
      subscribersLost,
      subscribersNet: subscribersGained - subscribersLost,
    },
    trafficSources,
  };
}

export const normalizeOwnerAnalyticsImport = (value: unknown, now = new Date()) => normalize(value, now, IMPORT_FRESHNESS_MS);

export function normalizeStoredOwnerAnalytics(value: unknown, now = new Date()): OwnerAnalytics | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || (value as Record<string, unknown>).provider !== SOURCE) return null;
    const stored = value as Record<string, unknown>;
    if (stored.metricBasis !== "authenticated-period") return null;
    const { metricBasis: _metricBasis, ...storedFields } = stored;
    void _metricBasis;
    const metrics = stored.metrics && typeof stored.metrics === "object" && !Array.isArray(stored.metrics)
      ? { ...(stored.metrics as Record<string, unknown>) }
      : stored.metrics;
    if (metrics && typeof metrics === "object") delete (metrics as Record<string, unknown>).subscribersNet;
    return normalize({ ...storedFields, metrics }, now, STORED_FRESHNESS_MS);
  } catch {
    return null;
  }
}
