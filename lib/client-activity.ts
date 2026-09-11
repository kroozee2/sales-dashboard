// What clients actually did in the members app.
//
// Helm writes a row to activity_log every time something happens on a client:
// they log in, finish a training, update their numbers, sign the Promise, ask
// the AI a question. Sales OS has never shown any of it, so the Clients
// dashboard could tell you a status but never tell you whether anyone was
// using the thing they bought.
//
// The one distinction that matters here is *whose* action it was. A portal
// invite going out is something the team did; a login is something the client
// did. Mixing them makes an inactive client look busy, so they are split and
// only the client's own actions count towards engagement.

export type ActorSide = "client" | "team";

export interface ActivityKind {
  /** The `type` column in activity_log. */
  type: string;
  label: string;
  icon: string;
  side: ActorSide;
  /** Grouped in the dashboard rollup; null means "don't roll this one up". */
  bucket: "using" | "building" | "progress" | "outreach" | null;
  tone: string;
}

/**
 * Every type seen in the data, named in plain English.
 *
 * The raw `summary` Helm writes is already readable, so this is not a
 * translation layer — it is what lets the dashboard count and colour things
 * without matching on strings.
 */
export const ACTIVITY_KINDS: ActivityKind[] = [
  // The client, using the app
  { type: "portal_login", label: "logged in", icon: "📱", side: "client", bucket: "using", tone: "text-emerald-300" },
  { type: "ai_chat", label: "asked the AI", icon: "💬", side: "client", bucket: "using", tone: "text-violet-300" },
  { type: "roadmap_viewed", label: "reviewed their roadmap", icon: "🗺️", side: "client", bucket: "using", tone: "text-sky-300" },
  { type: "training_search", label: "searched trainings", icon: "🧭", side: "client", bucket: "using", tone: "text-sky-300" },
  { type: "resource_saved", label: "saved a resource", icon: "🔖", side: "client", bucket: "using", tone: "text-sky-300" },
  { type: "resource_tracked", label: "tracked a resource", icon: "🔖", side: "client", bucket: "using", tone: "text-sky-300" },

  // The client, building something
  { type: "content_created", label: "added content", icon: "📝", side: "client", bucket: "building", tone: "text-pink-300" },
  { type: "content_drafted", label: "remixed content", icon: "🔁", side: "client", bucket: "building", tone: "text-pink-300" },
  { type: "offers_updated", label: "updated an offer", icon: "🎁", side: "client", bucket: "building", tone: "text-amber-300" },
  { type: "offer_built", label: "built an offer", icon: "🎁", side: "client", bucket: "building", tone: "text-amber-300" },
  { type: "asset_created", label: "started an asset", icon: "📞", side: "client", bucket: "building", tone: "text-amber-300" },
  { type: "plan_item_added", label: "added a project", icon: "📁", side: "client", bucket: "building", tone: "text-indigo-300" },

  // The client, making progress
  { type: "task_done", label: "completed a task", icon: "✅", side: "client", bucket: "progress", tone: "text-emerald-300" },
  { type: "training_done", label: "finished a training", icon: "🎥", side: "client", bucket: "progress", tone: "text-emerald-300" },
  { type: "numbers_updated", label: "updated their numbers", icon: "💵", side: "client", bucket: "progress", tone: "text-emerald-300" },
  { type: "goals_updated", label: "updated their goals", icon: "🎯", side: "client", bucket: "progress", tone: "text-emerald-300" },
  { type: "promise_signed", label: "signed the Promise", icon: "🖋", side: "client", bucket: "progress", tone: "text-amber-300" },
  { type: "proof_added", label: "added proof", icon: "🏆", side: "client", bucket: "progress", tone: "text-amber-300" },
  { type: "proof_bank", label: "added to the Proof Bank", icon: "🏦", side: "client", bucket: "progress", tone: "text-amber-300" },

  // Us, reaching out. Never counted as the client doing something.
  { type: "portal_invite", label: "was sent a portal invite", icon: "✉️", side: "team", bucket: "outreach", tone: "text-zinc-400" },
  { type: "portal_reset", label: "had their password reset", icon: "🔑", side: "team", bucket: "outreach", tone: "text-zinc-400" },
  { type: "password_reset_sent", label: "was emailed a reset link", icon: "🔑", side: "team", bucket: "outreach", tone: "text-zinc-400" },
  { type: "imessage", label: "was iMessaged", icon: "💬", side: "team", bucket: "outreach", tone: "text-zinc-400" },
  { type: "email", label: "was emailed", icon: "✉️", side: "team", bucket: "outreach", tone: "text-zinc-400" },
  { type: "form_sent", label: "was sent a form", icon: "📋", side: "team", bucket: "outreach", tone: "text-zinc-400" },
];

const BY_TYPE = new Map(ACTIVITY_KINDS.map((k) => [k.type, k]));

/** A type we have not catalogued still shows, rather than disappearing. */
export const UNKNOWN_KIND: ActivityKind = {
  type: "unknown", label: "did something", icon: "•", side: "client", bucket: null, tone: "text-zinc-400",
};

export function activityKind(type: string | null | undefined): ActivityKind {
  return (type && BY_TYPE.get(type)) || UNKNOWN_KIND;
}

export interface ActivityRow {
  id: string;
  clientId: string | null;
  clientName: string | null;
  type: string;
  summary: string | null;
  at: string;
}

/** Days between two instants, floored. Negative clamps to 0. */
export function daysBetween(from: string | null | undefined, to: Date): number | null {
  if (!from) return null;
  const then = Date.parse(from);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((to.getTime() - then) / 86_400_000));
}

export interface EngagementSummary {
  /** Client-side actions only, in the window. */
  actions: number;
  /** Distinct clients who did something in the window. */
  activeClients: number;
  byBucket: Record<"using" | "building" | "progress", number>;
  /** Client-side actions per day, newest last, for the sparkline. */
  perDay: { day: string; count: number }[];
}

/**
 * Roll up what clients did over the last `days`.
 *
 * Team actions are excluded on purpose: sending forty portal invites is not
 * engagement, and counting it as engagement is how a dashboard starts lying.
 */
export function summariseEngagement(rows: ActivityRow[], now: Date, days = 30): EngagementSummary {
  const cutoff = now.getTime() - days * 86_400_000;
  const byBucket = { using: 0, building: 0, progress: 0 };
  const clients = new Set<string>();
  const perDayMap = new Map<string, number>();

  // Seed every day so a quiet day is a gap in the line, not a missing point.
  for (let i = days - 1; i >= 0; i -= 1) {
    perDayMap.set(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10), 0);
  }

  let actions = 0;
  for (const row of rows) {
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || at < cutoff) continue;
    const kind = activityKind(row.type);
    if (kind.side !== "client") continue;

    actions += 1;
    if (row.clientId) clients.add(row.clientId);
    if (kind.bucket && kind.bucket !== "outreach") byBucket[kind.bucket] += 1;

    const day = new Date(at).toISOString().slice(0, 10);
    if (perDayMap.has(day)) perDayMap.set(day, (perDayMap.get(day) ?? 0) + 1);
  }

  return {
    actions,
    activeClients: clients.size,
    byBucket,
    perDay: [...perDayMap.entries()].map(([day, count]) => ({ day, count })),
  };
}

/** The newest action per client, for "who has gone quiet". */
export function lastActionByClient(rows: ActivityRow[]): Map<string, ActivityRow> {
  const newest = new Map<string, ActivityRow>();
  for (const row of rows) {
    if (!row.clientId || activityKind(row.type).side !== "client") continue;
    const current = newest.get(row.clientId);
    if (!current || Date.parse(row.at) > Date.parse(current.at)) newest.set(row.clientId, row);
  }
  return newest;
}

export interface ActivityDay { day: string; label: string; rows: ActivityRow[] }

/**
 * The feed, newest first, cut into days.
 *
 * Grouped by day because that is how it gets read — "what happened today",
 * not "what happened at 14:57".
 */
export function groupByDay(rows: ActivityRow[], now: Date, limit = 60): ActivityDay[] {
  const sorted = [...rows]
    .filter((row) => Number.isFinite(Date.parse(row.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);

  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const days: ActivityDay[] = [];
  for (const row of sorted) {
    const day = new Date(Date.parse(row.at)).toISOString().slice(0, 10);
    let group = days.find((d) => d.day === day);
    if (!group) {
      const label = day === today ? "Today" : day === yesterday ? "Yesterday"
        : new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      group = { day, label, rows: [] };
      days.push(group);
    }
    group.rows.push(row);
  }
  return days;
}

/** Relative time for a feed row: "2m", "3h", "5d". */
export function since(at: string, now: Date): string {
  const ms = now.getTime() - Date.parse(at);
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`;
}

/* ── Onboarding steps that tick themselves ──────────────────────────────── */

/**
 * Two runbook steps are things the app already knows about, so ticking them by
 * hand is busywork that goes stale: the portal invite going out, and the client
 * signing the Promise. Both are written to activity_log the moment they happen.
 *
 * These are derived on read rather than written into the client's onboarding
 * JSON, so the checklist can never disagree with what actually happened — and
 * un-ticking one by hand cannot hide a signature that exists.
 */
export const AUTO_STEPS: { step: "portal" | "promise"; types: string[] }[] = [
  { step: "portal", types: ["portal_invite", "portal_login", "portal_reset", "password_reset_sent"] },
  { step: "promise", types: ["promise_signed"] },
];

export interface AutoStep { at: string; type: string }

/** Per client, which runbook steps the app has already satisfied, and when. */
export function autoRunbookSteps(rows: ActivityRow[]): Map<string, Record<string, AutoStep>> {
  const byClient = new Map<string, Record<string, AutoStep>>();
  for (const row of rows) {
    if (!row.clientId) continue;
    for (const { step, types } of AUTO_STEPS) {
      if (!types.includes(row.type)) continue;
      const current = byClient.get(row.clientId) ?? {};
      // Earliest wins: the step was satisfied the first time it happened.
      const existing = current[step];
      if (!existing || Date.parse(row.at) < Date.parse(existing.at)) {
        current[step] = { at: row.at, type: row.type };
      }
      byClient.set(row.clientId, current);
    }
  }
  return byClient;
}
