// A Reel script: Hook, Show, Call to action. Nothing else.
//
// Andrew films from this directly, so the Show section is a list of {say, show}
// pairs rather than prose — one line to deliver, one thing on screen. That
// shape is what makes the sidebar an editor instead of a text box, and it is
// what `formatScript` turns back into the sheet he reads off camera.
//
// Kept pure so the rules can be checked without a browser or a database.

export type ScriptCategory = "connection" | "value" | "proof" | "action";
export type ScriptStatus = "draft" | "ready" | "shot" | "posted";
export type CtaKind = "follow" | "skool";
export type SourceKind = "blank" | "idea" | "model";

export interface ScriptStep {
  /** What Andrew says on this beat. One short sentence. */
  say: string;
  /** What is on screen while he says it. */
  show: string;
}

export interface ReelScript {
  id: string;
  title: string;
  category: ScriptCategory;
  status: ScriptStatus;
  hook: string;
  steps: ScriptStep[];
  cta: string;
  cta_kind: CtaKind;
  source_kind: SourceKind;
  source_ref: string | null;
  source_note: string | null;
  idea_id: string | null;
  shoot_date: string | null;
  created_at: string;
  updated_at: string;
}

export const SCRIPT_CATEGORIES: { key: ScriptCategory; label: string; emoji: string }[] = [
  { key: "connection", label: "Connection", emoji: "🤝" },
  { key: "value", label: "Value", emoji: "💡" },
  { key: "proof", label: "Proof", emoji: "🏆" },
  { key: "action", label: "Call to action", emoji: "📣" },
];

export const SCRIPT_STATUSES: { key: ScriptStatus; label: string; chip: string }[] = [
  { key: "draft", label: "Draft", chip: "border-zinc-700 bg-zinc-800 text-zinc-300" },
  { key: "ready", label: "Ready to shoot", chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  { key: "shot", label: "Shot", chip: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  { key: "posted", label: "Posted", chip: "border-purple-500/40 bg-purple-500/10 text-purple-300" },
];

/**
 * The two CTAs Andrew alternates between. Skool when the reel taught a whole
 * system and there is more waiting in the community; follow when it was a quick
 * tip that should make them want the next one.
 */
export const CTA_LINES: Record<CtaKind, string> = {
  follow: "Follow me for more daily AI tips for coaches and consultants.",
  skool: "Join my AI for Coaches and Consultants community on Skool. Link is in my bio.",
};

const CATEGORY_KEYS = new Set<string>(SCRIPT_CATEGORIES.map((c) => c.key));
const STATUS_KEYS = new Set<string>(SCRIPT_STATUSES.map((s) => s.key));
const CTA_KEYS = new Set<string>(Object.keys(CTA_LINES));
const SOURCE_KEYS = new Set<string>(["blank", "idea", "model"]);

const MAX_TITLE = 300;
const MAX_LINE = 2_000;
const MAX_STEPS = 40;

export function isScriptCategory(value: unknown): value is ScriptCategory {
  return typeof value === "string" && CATEGORY_KEYS.has(value);
}
export function isScriptStatus(value: unknown): value is ScriptStatus {
  return typeof value === "string" && STATUS_KEYS.has(value);
}
export function isCtaKind(value: unknown): value is CtaKind {
  return typeof value === "string" && CTA_KEYS.has(value);
}

function cleanLine(value: unknown, max = MAX_LINE): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\0/g, "").trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Steps arrive from a text box, from the AI, or straight out of jsonb, so this
 * accepts anything and returns something safe. A step with neither half is
 * dropped rather than kept as an empty row Andrew has to delete by hand.
 */
export function normalizeSteps(value: unknown): ScriptStep[] {
  if (!Array.isArray(value)) return [];
  const steps: ScriptStep[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const say = cleanLine(record.say);
    const show = cleanLine(record.show);
    if (!say && !show) continue;
    steps.push({ say, show });
    if (steps.length >= MAX_STEPS) break;
  }
  return steps;
}

/** Fields a client may send. Anything else is refused rather than ignored. */
export const EDITABLE_SCRIPT_FIELDS = [
  "title", "category", "status", "hook", "steps", "cta", "cta_kind",
  "source_kind", "source_ref", "source_note", "idea_id", "shoot_date",
] as const;

export function normalizeShootDate(value: unknown): string | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Shoot date is invalid");
  }
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Shoot date is invalid");
  }
  return value;
}

/**
 * Keep only what a client may send.
 *
 * The Calls editor shipped a bug where the whole row, system columns included,
 * was PATCHed back and Postgres rejected the unknown fields — the save failed
 * while the UI said "Saved". Filtering here is what stops that repeating.
 */
export function pickEditableScriptFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_SCRIPT_FIELDS) {
    if (!Object.hasOwn(body, key)) continue;
    const value = body[key];
    switch (key) {
      case "title": {
        const title = cleanLine(value, MAX_TITLE);
        if (!title) throw new Error("A script needs a title");
        out.title = title;
        break;
      }
      case "category":
        if (!isScriptCategory(value)) throw new Error("Category is unsupported");
        out.category = value;
        break;
      case "status":
        if (!isScriptStatus(value)) throw new Error("Status is unsupported");
        out.status = value;
        break;
      case "cta_kind":
        if (!isCtaKind(value)) throw new Error("CTA is unsupported");
        out.cta_kind = value;
        break;
      case "source_kind":
        if (typeof value !== "string" || !SOURCE_KEYS.has(value)) throw new Error("Source is unsupported");
        out.source_kind = value;
        break;
      case "steps":
        out.steps = normalizeSteps(value);
        break;
      case "shoot_date":
        out.shoot_date = normalizeShootDate(value);
        break;
      case "idea_id":
      case "source_ref":
      case "source_note":
        out[key] = value === null || value === "" ? null : cleanLine(value);
        break;
      default:
        out[key] = cleanLine(value);
    }
  }
  return out;
}

/** A new script, with the CTA already filled in so the last section is never blank. */
export function blankScript(title: string, category: ScriptCategory = "value"): Record<string, unknown> {
  const cleanTitle = cleanLine(title, MAX_TITLE);
  if (!cleanTitle) throw new Error("A script needs a title");
  return {
    title: cleanTitle,
    category,
    status: "draft",
    hook: "",
    steps: [],
    cta: CTA_LINES.follow,
    cta_kind: "follow",
    source_kind: "blank",
    source_ref: null,
    source_note: null,
    idea_id: null,
    shoot_date: null,
  };
}

/** Start a script from a Reel idea already on the Ideas board. */
export function seedFromIdea(idea: { id: string; title: string; category?: string | null; scheduled_date?: string | null }): Record<string, unknown> {
  const category = isScriptCategory(idea.category) ? idea.category : "value";
  return {
    ...blankScript(idea.title, category),
    source_kind: "idea",
    source_ref: idea.id,
    idea_id: idea.id,
    shoot_date: idea.scheduled_date ?? null,
  };
}

/**
 * Start a script from a post we model.
 *
 * The competitor's hook is carried across as a note, never as the hook itself —
 * the point is to model the structure that worked, not to copy their words.
 */
export function seedFromModelPost(post: {
  id: string; handle: string; hook?: string | null; theme?: string | null;
  views?: number | null; post_url?: string | null;
}): Record<string, unknown> {
  const hook = cleanLine(post.hook);
  const title = hook ? hook.slice(0, 120) : `Model @${post.handle}`;
  const bits = [`Modelled on @${post.handle}`];
  if (post.theme) bits.push(post.theme);
  if (typeof post.views === "number" && post.views > 0) bits.push(`${post.views.toLocaleString()} views`);
  if (hook) bits.push(`Their hook: "${hook}"`);
  if (post.post_url) bits.push(post.post_url);
  return {
    ...blankScript(title),
    source_kind: "model",
    source_ref: post.id,
    source_note: bits.join(" · ").slice(0, MAX_LINE),
  };
}

/**
 * How finished a script is. A script is shootable once it has a hook, at least
 * one step, and a CTA — the three things the format requires.
 */
export function scriptProgress(script: Pick<ReelScript, "hook" | "steps" | "cta">) {
  const parts = [
    Boolean(script.hook.trim()),
    normalizeSteps(script.steps).length > 0,
    Boolean(script.cta.trim()),
  ];
  const done = parts.filter(Boolean).length;
  return { done, total: parts.length, pct: Math.round((done / parts.length) * 100), shootable: done === parts.length };
}

/**
 * The script as Andrew reads it while filming.
 *
 * Face is on camera for the hook and the CTA every time, because that is the
 * rule the format is built on, so those two Show lines are written here rather
 * than left to whoever drafted the script.
 */
export function formatScript(script: Pick<ReelScript, "title" | "hook" | "steps" | "cta">): string {
  const lines: string[] = [];
  const title = script.title.trim();
  if (title) lines.push(title, "");

  lines.push("HOOK");
  lines.push("Show: Face on camera the whole time");
  lines.push(`Say: "${script.hook.trim()}"`);
  lines.push("");

  lines.push("SHOW");
  const steps = normalizeSteps(script.steps);
  if (steps.length === 0) {
    lines.push("(no steps yet)");
  } else {
    for (const step of steps) {
      lines.push("");
      if (step.show) lines.push(`Show: ${step.show}`);
      if (step.say) lines.push(`Say: "${step.say}"`);
    }
  }
  lines.push("");

  lines.push("CALL TO ACTION");
  lines.push("Show: Face back on camera, point to bio");
  lines.push(`Say: "${script.cta.trim()}"`);

  return lines.join("\n");
}

/** Roughly how long the reel runs, from the words in it. ~2.6 words a second. */
export function estimateSeconds(script: Pick<ReelScript, "hook" | "steps" | "cta">): number {
  const words = [script.hook, ...normalizeSteps(script.steps).map((s) => s.say), script.cta]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 2.6));
}
