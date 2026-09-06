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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATIVE_TYPES = new Set(["video", "picture", "gif", "carousel", "image", "written"]);
type ReelStage = "idea" | "shot" | "posted";
const REEL_STAGES = new Set<ReelStage>(["idea", "shot", "posted"]);
const REEL_STAGE_STATUS: Record<ReelStage, string> = { idea: "idea", shot: "drafted", posted: "posted" };

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
  if (typeof value !== "string" || value.length > max || value.includes("\0")) {
    throw new Error(`${field} must be a valid string under ${max} characters`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string, allowed?: Set<string>) {
  if (!Array.isArray(value) || value.length > 20 || value.some((entry) => typeof entry !== "string" || entry.length > 500 || entry.includes("\0"))) {
    throw new Error(`${field} must be an array of no more than 20 valid strings`);
  }
  if (allowed && value.some((entry) => !allowed.has(entry))) throw new Error(`${field} contains an unsupported value`);
  return value;
}

function requireDate(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("scheduled_date must use YYYY-MM-DD");
  const year = Number(value.slice(0, 4));
  const parsed = new Date(`${value}T12:00:00Z`);
  if (year < 1000 || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("scheduled_date is invalid");
  }
  return value;
}

function requireJsonObject(value: unknown, field: string) {
  if (!isPlainObject(value) || JSON.stringify(value).length > 200_000) throw new Error(`${field} must be a JSON object under 200 KB`);
  return value;
}

function assertReelWorkflowInvariant(fields: Record<string, unknown>) {
  const meta = fields.meta;
  if (!isPlainObject(meta) || meta.reel_workflow !== "idea_board") return;
  if (typeof meta.reel_stage !== "string" || !REEL_STAGES.has(meta.reel_stage as ReelStage)) {
    throw new Error("Reel workflow stage is invalid");
  }
  const expectedStatus = REEL_STAGE_STATUS[meta.reel_stage as ReelStage];
  if (fields.status !== expectedStatus) throw new Error("Reel workflow stage and status are inconsistent");
  if (fields.creative_type !== "video" || !Array.isArray(fields.platforms) || fields.platforms.length !== 1 || fields.platforms[0] !== "instagram") {
    throw new Error("Reel workflow platform and creative_type are inconsistent");
  }
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
      if (typeof value !== "string" || !value.trim() || value.length > 500 || value.includes("\0")) {
        throw new Error("title must be a valid non-empty string under 500 characters");
      }
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
    } else if (key === "creative_type") {
      if (value !== null && (typeof value !== "string" || !CREATIVE_TYPES.has(value))) throw new Error("creative_type is unsupported");
      fields.creative_type = value;
    } else if (key === "event_id") {
      if (value !== null && (typeof value !== "string" || !UUID_PATTERN.test(value))) throw new Error("event_id must be a valid UUID or null");
      fields.event_id = value;
    }
  }

  return { fields, rejected };
}

export function sanitizeContentCreate(body: Record<string, unknown>, allowed: ContentPatchAllowedValues) {
  const sanitized = sanitizeContentPatch(body, allowed);
  if (sanitized.rejected.length) throw new Error(`unsupported fields: ${sanitized.rejected.join(", ")}`);
  if (typeof sanitized.fields.title !== "string") throw new Error("title is required");
  if (typeof sanitized.fields.category !== "string") throw new Error("category is required");
  if (typeof sanitized.fields.status !== "string") throw new Error("status is required");
  if (!Array.isArray(sanitized.fields.platforms)) throw new Error("platforms is required");
  assertReelWorkflowInvariant(sanitized.fields);
  return sanitized;
}
