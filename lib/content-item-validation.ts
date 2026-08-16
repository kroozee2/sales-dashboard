const PATCHABLE_FIELDS = new Set([
  "title",
  "category",
  "status",
  "scheduled_date",
  "platforms",
  "drafts",
  "posted_platforms",
  "notes",
  "meta",
  "media_urls",
  "creative_type",
  "video_script",
  "event_id",
]);

export interface ContentPatchAllowedValues {
  categories: string[];
  statuses: string[];
  platforms: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNullableString(value: unknown, field: string, max: number) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > max) throw new Error(`${field} must be a string under ${max} characters`);
  return value;
}

function requireStringArray(value: unknown, field: string, allowed?: Set<string>) {
  if (!Array.isArray(value) || value.length > 20 || value.some((entry) => typeof entry !== "string" || entry.length > 500)) {
    throw new Error(`${field} must be an array of no more than 20 strings`);
  }
  if (allowed && value.some((entry) => !allowed.has(entry))) throw new Error(`${field} contains an unsupported value`);
  return value;
}

function requireDate(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("scheduled_date must use YYYY-MM-DD");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("scheduled_date is invalid");
  return value;
}

function requireJsonObject(value: unknown, field: string) {
  if (!isPlainObject(value) || JSON.stringify(value).length > 200_000) throw new Error(`${field} must be a JSON object under 200 KB`);
  return value;
}

export function sanitizeContentPatch(body: Record<string, unknown>, allowed: ContentPatchAllowedValues) {
  const categories = new Set(allowed.categories);
  const statuses = new Set(allowed.statuses);
  const platforms = new Set(allowed.platforms);
  const fields: Record<string, unknown> = {};
  const rejected = Object.keys(body).filter((key) => !PATCHABLE_FIELDS.has(key)).sort();

  for (const [key, value] of Object.entries(body)) {
    if (!PATCHABLE_FIELDS.has(key)) continue;
    if (key === "title") {
      if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error("title must be a non-empty string under 500 characters");
      fields.title = value.trim();
    } else if (key === "category") {
      if (typeof value !== "string" || !categories.has(value)) throw new Error("category is unsupported");
      fields.category = value;
    } else if (key === "status") {
      if (typeof value !== "string" || !statuses.has(value)) throw new Error("status is unsupported");
      fields.status = value;
    } else if (key === "scheduled_date") {
      fields.scheduled_date = requireDate(value);
    } else if (key === "platforms" || key === "posted_platforms") {
      fields[key] = requireStringArray(value, key, platforms);
    } else if (key === "media_urls") {
      const urls = requireStringArray(value, key);
      if (urls.some((url) => {
        try { const parsed = new URL(url); return parsed.protocol !== "http:" && parsed.protocol !== "https:"; } catch { return true; }
      })) throw new Error("media_urls must contain only HTTP or HTTPS URLs");
      fields.media_urls = urls;
    } else if (key === "drafts" || key === "meta") {
      fields[key] = requireJsonObject(value, key);
    } else if (key === "notes" || key === "video_script") {
      fields[key] = requireNullableString(value, key, 200_000);
    } else if (key === "creative_type" || key === "event_id") {
      fields[key] = requireNullableString(value, key, 500);
    }
  }

  return { fields, rejected };
}
