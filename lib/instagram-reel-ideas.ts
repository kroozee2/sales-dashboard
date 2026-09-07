export const REEL_IDEA_TYPES = [
  { key: "connection", label: "Connection", emoji: "🤝" },
  { key: "value", label: "Value", emoji: "💡" },
  { key: "proof", label: "Proof", emoji: "🏆" },
  { key: "action", label: "Call to action", emoji: "📣" },
] as const;

export type ReelIdeaType = (typeof REEL_IDEA_TYPES)[number]["key"];
export type ReelStage = "idea" | "shot" | "posted";

const TYPE_KEYS = new Set<string>(REEL_IDEA_TYPES.map((type) => type.key));
const STAGE_STATUS: Record<ReelStage, "idea" | "drafted" | "posted"> = {
  idea: "idea",
  shot: "drafted",
  posted: "posted",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeReelTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function normalizeShootDate(value: string | null | undefined) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Shoot date is invalid");
  const year = Number(value.slice(0, 4));
  const date = new Date(`${value}T12:00:00Z`);
  if (year < 1000 || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Shoot date is invalid");
  }
  return value;
}


export function sharedStatusForReelStage(stage: ReelStage) {
  return STAGE_STATUS[stage];
}

export function buildReelIdeaPayload(title: string, type: ReelIdeaType, shootDate: string | null) {
  const cleanTitle = title.trim().replace(/\s+/g, " ");
  if (!cleanTitle || cleanTitle.length > 500 || cleanTitle.includes("\0")) throw new Error("Reel title is invalid");
  if (!TYPE_KEYS.has(type)) throw new Error("Reel type is unsupported");

  return {
    title: cleanTitle,
    platforms: ["instagram"],
    creative_type: "video",
    category: type,
    status: "idea",
    scheduled_date: normalizeShootDate(shootDate),
    meta: {
      reel_stage: "idea" as ReelStage,
      reel_workflow: "idea_board",
    },
  };
}

export function buildReelStagePatch(stage: ReelStage, meta: unknown) {
  if (!(["idea", "shot", "posted"] as string[]).includes(stage)) throw new Error("Reel stage is unsupported");
  return {
    status: STAGE_STATUS[stage],
    meta: {
      ...(isPlainObject(meta) ? meta : {}),
      reel_stage: stage,
      reel_workflow: "idea_board",
    },
  };
}

export function isReelIdeaBoardItem(item: unknown) {
  if (!isPlainObject(item)) return false;
  const meta = isPlainObject(item.meta) ? item.meta : {};
  return Array.isArray(item.platforms)
    && item.platforms.includes("instagram")
    && item.creative_type === "video"
    && TYPE_KEYS.has(String(item.category))
    && meta.reel_workflow === "idea_board";
}

export function getReelStage(item: unknown): ReelStage {
  if (!isPlainObject(item)) return "idea";
  const meta = isPlainObject(item.meta) ? item.meta : {};
  if (meta.reel_stage === "idea" || meta.reel_stage === "shot" || meta.reel_stage === "posted") return meta.reel_stage;
  return item.status === "posted" ? "posted" : "idea";
}
