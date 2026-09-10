// How the Members roster is filtered, ordered and grouped.
//
// Modelled on Helm's ClientsHome, which is the version of this screen that has
// actually been used every day: health tiles that double as filters, a filter
// separate from an ordering, and grouping only where it earns its place.
// Kept pure so the rules can be checked without a browser.

import type { MergedClient } from "@/lib/client-accounts";
import { MEMBER_STAGES, type MemberStage } from "@/lib/member-numbers";

export type Health = "good" | "watch" | "risk" | "idle";

export const HEALTH_META: Record<Health, { label: string; dot: string; chip: string }> = {
  good: { label: "On Track", dot: "#10b981", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  watch: { label: "Off-Track", dot: "#f59e0b", chip: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  risk: { label: "At Risk", dot: "#f43f5e", chip: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
  idle: { label: "Inactive", dot: "#94a3b8", chip: "border-zinc-700 bg-zinc-800 text-zinc-400" },
};

/** Any status string, from Helm or from us, lands in one of four buckets. */
export function statusToHealth(status?: string | null): Health {
  const s = (status ?? "").toLowerCase();
  if (/risk|churn|cancel|lost/.test(s)) return "risk";
  if (/off.?board|former|graduat|complete|pause|hold|inactive/.test(s)) return "idle";
  if (/off.?track|watch|slow|behind|stuck|not started/.test(s)) return "watch";
  return "good";
}

export const isOnboarding = (client: MergedClient) =>
  /onboard/i.test(client.status ?? "") && !/off.?board/i.test(client.status ?? "");

/** Whole days since a date, or null when there is nothing to measure from. */
export function daysSince(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const then = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86400000));
}

/**
 * Who needs you: at risk or off-track, or nobody has spoken to them in a
 * fortnight. Off-boarded members are excluded — there is nothing to rescue.
 */
export function needsAttention(client: MergedClient, now = new Date()): boolean {
  const health = statusToHealth(client.status);
  if (health === "idle") return false;
  if (health === "risk" || health === "watch") return true;
  const gap = daysSince(client.helm?.lastContactAt ?? null, now);
  return gap !== null && gap >= 14;
}

export type RosterFilter = "attention" | "onboarding" | "risk" | "offtrack" | "ontrack" | "all" | "offboarded";

export const ROSTER_FILTERS: { key: RosterFilter; label: string }[] = [
  { key: "attention", label: "🔥 Needs attention" },
  { key: "onboarding", label: "📆 Onboarding" },
  { key: "risk", label: "🚨 At Risk" },
  { key: "offtrack", label: "⚠️ Off-Track" },
  { key: "ontrack", label: "✅ On Track" },
  { key: "all", label: "👥 All" },
  { key: "offboarded", label: "👋 Off-boarded" },
];

/** Ordering, and whether the list is grouped. Separate from who shows. */
export type RosterView = "status" | "az" | "newest" | "contact" | "calls" | "value" | "program";

export const ROSTER_VIEWS: { key: RosterView; label: string; hint: string }[] = [
  // First, and the default: the status you set is what this screen is read by.
  { key: "status", label: "🚦 Status", hint: "Grouped by the status you set" },
  { key: "az", label: "🔤 A–Z", hint: "Alphabetical" },
  { key: "newest", label: "🆕 Newest", hint: "Most recently started first" },
  { key: "contact", label: "⏳ Last contact", hint: "Longest since you spoke, first" },
  { key: "calls", label: "🎥 Calls", hint: "Fewest calls attended first" },
  { key: "value", label: "💰 Value", hint: "Biggest deal first" },
  { key: "program", label: "🎓 Program", hint: "Grouped by program" },
];

export function rosterCounts(clients: MergedClient[], now = new Date()) {
  const live = clients.filter((c) => statusToHealth(c.status) !== "idle");
  return {
    total: live.length,
    onboarding: clients.filter(isOnboarding).length,
    risk: clients.filter((c) => statusToHealth(c.status) === "risk").length,
    offtrack: clients.filter((c) => statusToHealth(c.status) === "watch").length,
    ontrack: clients.filter((c) => statusToHealth(c.status) === "good" && !isOnboarding(c)).length,
    offboarded: clients.filter((c) => statusToHealth(c.status) === "idle").length,
    attention: clients.filter((c) => needsAttention(c, now)).length,
  };
}

export function applyFilter(clients: MergedClient[], filter: RosterFilter, query: string, now = new Date()): MergedClient[] {
  const q = query.trim().toLowerCase();
  return clients.filter((client) => {
    const health = statusToHealth(client.status);
    const passes =
      filter === "all" ? health !== "idle"
        : filter === "attention" ? needsAttention(client, now)
          : filter === "onboarding" ? isOnboarding(client)
            : filter === "risk" ? health === "risk"
              : filter === "offtrack" ? health === "watch"
                : filter === "ontrack" ? health === "good" && !isOnboarding(client)
                  : health === "idle";
    if (!passes) return false;
    if (!q) return true;
    return `${client.name} ${client.email ?? ""} ${client.program ?? ""} ${client.status ?? ""}`.toLowerCase().includes(q);
  });
}

export interface RosterGroup { key: string; label: string; clients: MergedClient[] }

const byName = (a: MergedClient, b: MergedClient) => a.name.localeCompare(b.name);
const time = (value: string | null | undefined) => (value ? Date.parse(value) || 0 : 0);

/**
 * Order the roster, grouping only for Status and Program where a heading tells
 * you something a sort order cannot.
 */
export function groupRoster(
  clients: MergedClient[],
  view: RosterView,
  now: Date = new Date(),
  /**
   * Where each member is in onboarding. Passed in rather than computed here
   * because it needs the Portal signals, which live on the payload and not on
   * the client row. Without it the stage view falls back to alphabetical.
   */
  stageOf?: (client: MergedClient) => MemberStage,
): RosterGroup[] {
  if (view === "status" && stageOf) {
    return MEMBER_STAGES
      .map((stage) => ({
        key: stage.key,
        label: `${stage.emoji} ${stage.label}`,
        clients: clients.filter((client) => stageOf(client) === stage.key).sort(byName),
      }))
      .filter((group) => group.clients.length > 0);
  }

  // Fallback when no resolver was supplied: the four coarse health buckets.
  // The Members sheet always passes one, so this is what other callers get.
  if (view === "status") {
    const order: Health[] = ["risk", "watch", "good", "idle"];
    return order
      .map((health) => ({
        key: health,
        label: HEALTH_META[health].label,
        clients: clients.filter((c) => statusToHealth(c.status) === health).sort(byName),
      }))
      .filter((group) => group.clients.length > 0);
  }

  if (view === "program") {
    const names = [...new Set(clients.map((c) => c.program?.trim() || "No program"))].sort();
    return names
      .map((name) => ({
        key: name,
        label: name,
        clients: clients.filter((c) => (c.program?.trim() || "No program") === name).sort(byName),
      }))
      .filter((group) => group.clients.length > 0);
  }

  const sorted = [...clients].sort((a, b) => {
    if (view === "newest") return time(b.startDate ?? b.addedAt) - time(a.startDate ?? a.addedAt) || byName(a, b);
    if (view === "contact") {
      // Longest silence first; someone never contacted is the longest of all.
      const ga = daysSince(a.helm?.lastContactAt ?? null, now) ?? 9999;
      const gb = daysSince(b.helm?.lastContactAt ?? null, now) ?? 9999;
      return gb - ga || byName(a, b);
    }
    if (view === "calls") return (a.helm?.callsAttended ?? 0) - (b.helm?.callsAttended ?? 0) || byName(a, b);
    if (view === "value") return (b.dealValue ?? 0) - (a.dealValue ?? 0) || byName(a, b);
    return byName(a, b);
  });

  return [{ key: "all", label: "", clients: sorted }];
}

/** Compact relative time for the glance stats: "3d", "2h", "now", "—". */
export function ago(value: string | null | undefined, now = new Date()): string {
  if (!value) return "—";
  const then = Date.parse(value);
  if (!Number.isFinite(then)) return "—";
  const minutes = Math.floor((now.getTime() - then) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo` : `${Math.floor(months / 12)}y`;
}
