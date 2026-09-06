export type PublishedPlatform = "instagram" | "youtube" | "facebook" | "email";

export interface PublishedSource {
  platform: PublishedPlatform;
  external_id: string;
  url: string;
  published_at: string;
  source: string;
}

const MAX_SOURCES = 20;
const MAX_EXTERNAL_ID = 256;
const MAX_SOURCE = 128;
const MAX_URL = 4096;
const STRICT_UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/;
const CONTROL_CHARACTER = /[\p{Cc}\p{Cf}]/u;
const ALLOWED_HOSTS: Record<PublishedPlatform, ReadonlySet<string>> = {
  instagram: new Set(["instagram.com", "www.instagram.com"]),
  youtube: new Set(["youtube.com", "www.youtube.com", "youtu.be"]),
  facebook: new Set(["facebook.com", "www.facebook.com"]),
  email: new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]),
};

function publishedPlatform(value: unknown): PublishedPlatform | null {
  if (value === "instagram" || value === "youtube" || value === "facebook" || value === "email") return value;
  return null;
}

function safePublishedUrl(value: unknown, platform: PublishedPlatform): string | null {
  if (typeof value !== "string") return null;
  if (CONTROL_CHARACTER.test(value) || value !== value.trim()) return null;
  const trimmed = value;
  if (!trimmed || trimmed.length > MAX_URL || !/^[\x21-\x7e]+$/.test(trimmed) || trimmed.includes("\\")) return null;
  const authority = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(trimmed)?.[1]?.toLowerCase();
  const allowedAuthorities = new Set([...ALLOWED_HOSTS[platform]].flatMap((host) => [host, `${host}:443`]));
  if (!authority || !allowedAuthorities.has(authority)) return null;
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol !== "https:" ||
      !ALLOWED_HOSTS[platform].has(parsed.hostname.toLowerCase()) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      (parsed.port !== "" && parsed.port !== "443")
    ) return null;
    return trimmed;
  } catch {
    return null;
  }
}

function canonicalIdentityUrl(value: string, platform: PublishedPlatform): string {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  const tracking = new Set(["fbclid", "igshid", "ref", "refsrc", "mibextid", "si", "feature"]);
  if (platform === "youtube" && parsed.pathname === "/watch") {
    const videoId = parsed.searchParams.get("v");
    parsed.search = videoId ? new URLSearchParams({ v: videoId }).toString() : "";
  } else {
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || tracking.has(key.toLowerCase())) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
  }
  return parsed.toString();
}

function youtubeIdFromUrl(value: string): string | null {
  const patterns = [
    /^https:\/\/youtu\.be(?::443)?\/([A-Za-z0-9_-]{11})$/i,
    /^https:\/\/(?:www\.)?youtube\.com(?::443)?\/watch\?v=([A-Za-z0-9_-]{11})$/i,
    /^https:\/\/(?:www\.)?youtube\.com(?::443)?\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match) return match[1];
  }
  return null;
}

function strictUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = STRICT_UTC_TIMESTAMP.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour &&
    parsed.getUTCMinutes() === minute &&
    parsed.getUTCSeconds() === second;
}

export function publishedSourcesOf(meta: unknown): PublishedSource[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const raw = (meta as Record<string, unknown>).published_sources;
  if (!Array.isArray(raw) || raw.length > MAX_SOURCES) return [];
  const seen = new Set<string>();
  const identityUrls = new Map<string, string>();
  const identityMetadata = new Map<string, string>();
  const canonicalOwners = new Map<string, string>();
  const sources: PublishedSource[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if (Object.keys(item).sort().join("|") !== "external_id|platform|published_at|source|url") return [];
    const platform = publishedPlatform(item.platform);
    const externalId = typeof item.external_id === "string" && !CONTROL_CHARACTER.test(item.external_id) ? item.external_id.trim() : "";
    const source = typeof item.source === "string" && !CONTROL_CHARACTER.test(item.source) ? item.source.trim() : "";
    const url = platform ? safePublishedUrl(item.url, platform) : null;
    if (
      !platform ||
      !externalId || externalId.length > MAX_EXTERNAL_ID ||
      !url ||
      (platform === "youtube" && youtubeIdFromUrl(url) !== externalId) ||
      !strictUtcTimestamp(item.published_at) ||
      !source || source.length > MAX_SOURCE
    ) return [];
    const key = JSON.stringify([platform, externalId]);
    const canonical = canonicalIdentityUrl(url, platform);
    const canonicalKey = JSON.stringify([platform, canonical]);
    const identityUrl = identityUrls.get(key);
    if (identityUrl && identityUrl !== canonical) return [];
    identityUrls.set(key, canonical);
    const metadata = JSON.stringify([canonical, item.published_at, source]);
    const priorMetadata = identityMetadata.get(key);
    if (priorMetadata && priorMetadata !== metadata) return [];
    identityMetadata.set(key, metadata);
    const canonicalOwner = canonicalOwners.get(canonicalKey);
    if (canonicalOwner && canonicalOwner !== externalId) return [];
    canonicalOwners.set(canonicalKey, externalId);
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      platform,
      external_id: externalId,
      url,
      published_at: item.published_at,
      source,
    });
  }
  return sources;
}
