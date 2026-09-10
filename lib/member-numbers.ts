// Where a member is in onboarding, and the numbers they set for themselves.
//
// Two things live here because the Members sheet shows them side by side:
//
//  1. The stage. Helm's `status` carries five real values, none of which is
//     "not started". Someone who signed, never opened the Portal and never set
//     a number is the group you actually chase, so that stage is derived on
//     read rather than written back to Helm.
//
//  2. The cash numbers a member enters in the Mastermind Portal. There is no
//     annual goal column — members set a goal per month — so the year is the
//     sum of those twelve rows, and it is only ever as complete as the months
//     they have filled in.
//
// Kept pure so both can be checked without a database.

export type MemberStage =
  | "not_started" | "onboarding" | "on_track" | "off_track" | "at_risk" | "off_boarded";

export const MEMBER_STAGES: { key: MemberStage; label: string; emoji: string; chip: string; dot: string }[] = [
  // Ordered the way Andrew works the list: the people who have not got going
  // sit at the very top, then whoever is in trouble, and the members who are
  // fine are last because they are the ones who need nothing today.
  { key: "not_started", label: "Not started onboarding", emoji: "🆕", chip: "border-amber-500/40 bg-amber-500/10 text-amber-200", dot: "#f59e0b" },
  { key: "onboarding", label: "Onboarding booked", emoji: "📆", chip: "border-sky-500/40 bg-sky-500/10 text-sky-200", dot: "#38bdf8" },
  { key: "at_risk", label: "At Risk", emoji: "❌", chip: "border-rose-500/40 bg-rose-500/10 text-rose-200", dot: "#f43f5e" },
  { key: "off_track", label: "Off-Track", emoji: "🚊", chip: "border-orange-500/40 bg-orange-500/10 text-orange-200", dot: "#fb923c" },
  { key: "on_track", label: "On-Track", emoji: "🚀", chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200", dot: "#10b981" },
  { key: "off_boarded", label: "Off-Boarded", emoji: "👋", chip: "border-zinc-700 bg-zinc-800 text-zinc-400", dot: "#71717a" },
];

export const STAGE_META = Object.fromEntries(MEMBER_STAGES.map((s) => [s.key, s])) as
  Record<MemberStage, (typeof MEMBER_STAGES)[number]>;

const has = (value: string | null | undefined, ...needles: string[]) => {
  const text = (value ?? "").toLowerCase();
  return needles.some((needle) => text.includes(needle));
};

export interface StageInput {
  status: string | null;
  isActive: boolean;
  /** "not_invited" | "invited" | "active" — from portal_accounts. */
  portalStatus?: string | null;
  /** True when they have set at least one monthly cash goal in the Portal. */
  hasCashGoal?: boolean;
}

/**
 * Which bucket a member belongs in.
 *
 * The status you set decides, and nothing else overrides it. Helm's own
 * vocabulary already has all six values, "🆕 Not Started" included, so a
 * derived guess can only ever disagree with what someone deliberately chose:
 * setting a member to Not Started and watching them file under Onboarding
 * because they once logged into the Portal is worse than no grouping at all.
 *
 * The one thing status cannot say is whether an active member has actually
 * done anything, and the row already shows that without regrouping them: the
 * 📱 chip is unticked and the 🎯 goal reads as a dash.
 */
export function memberStage(member: StageInput): MemberStage {
  if (!member.isActive) return "off_boarded";
  // Spaced, hyphenated and joined, the same way off-track is matched below.
  if (has(member.status, "off-board", "off board", "offboard")) return "off_boarded";
  if (has(member.status, "risk")) return "at_risk";
  if (has(member.status, "off-track", "off track")) return "off_track";
  // Checked before "onboard" so "🆕 Not Started" is not swallowed by it.
  if (has(member.status, "not started", "not-started")) return "not_started";
  if (has(member.status, "onboard")) return "onboarding";
  return "on_track";
}

/* ── The numbers they set in the Portal ──────────────────────────────────── */

export interface CashGoalRow {
  client_id: string | null;
  year: number | null;
  month: number | null;
  goal: number | null;
}

export interface MonthCheckInRow {
  client_id?: string | null;
  month_date?: string | null;
  cash_collected?: unknown;
}

export interface MemberCash {
  /** Sum of every monthly goal set for the year. Null when none are set. */
  yearGoal: number | null;
  /** How many of the twelve months they have actually filled in. */
  monthsSet: number;
  /** This month's goal, or null when they have not set one. */
  monthGoal: number | null;
  /** This month's cash collected, from their check-in. Null when not submitted. */
  monthActual: number | null;
  /** Actual against this month's goal, 0-999. Null when either side is missing. */
  monthPct: number | null;
}

export const EMPTY_CASH: MemberCash = {
  yearGoal: null, monthsSet: 0, monthGoal: null, monthActual: null, monthPct: null,
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/**
 * Build each member's numbers for one year and one month.
 *
 * A month with no goal row is not a zero, it is unset, and the sheet has to be
 * able to tell those apart: a member who set $0 for September is making a
 * statement, one who set nothing has not been asked yet.
 */
export function buildMemberCash(
  goals: CashGoalRow[],
  checkIns: MonthCheckInRow[],
  year: number,
  month: number,
): Map<string, MemberCash> {
  const byClient = new Map<string, MemberCash>();

  for (const row of goals) {
    if (!row.client_id || row.year !== year) continue;
    const goal = num(row.goal);
    if (goal === null) continue;
    if (row.month === null || row.month < 1 || row.month > 12) continue;

    const current = byClient.get(row.client_id) ?? { ...EMPTY_CASH };
    current.yearGoal = (current.yearGoal ?? 0) + goal;
    current.monthsSet += 1;
    if (row.month === month) current.monthGoal = goal;
    byClient.set(row.client_id, current);
  }

  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  for (const row of checkIns) {
    if (!row.client_id) continue;
    const when = typeof row.month_date === "string" ? row.month_date : null;
    if (!when || !when.startsWith(prefix)) continue;
    const cash = num(row.cash_collected);
    if (cash === null) continue;

    const current = byClient.get(row.client_id) ?? { ...EMPTY_CASH };
    // More than one check-in for a month should not double-count; the larger
    // number is the later correction in every case seen in the data.
    current.monthActual = Math.max(current.monthActual ?? 0, cash);
    byClient.set(row.client_id, current);
  }

  for (const cash of byClient.values()) {
    cash.monthPct = cash.monthGoal && cash.monthGoal > 0 && cash.monthActual !== null
      ? Math.min(999, Math.round((cash.monthActual / cash.monthGoal) * 100))
      : null;
  }
  return byClient;
}

/** Compact money for a sheet cell: $12.5K, $1.2M, $840. */
export function money(value: number | null): string {
  if (value === null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  // Most goals here are five figures, so keep a decimal until six: $12.5K says
  // something $13K does not, but $120.0K is just noise.
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `$${Math.round(value)}`;
}

/** The month a sheet defaults to, as {year, month}, from a real date. */
export function currentPeriod(now: Date): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Totals for the header strip, across whoever is currently shown. */
export function cashTotals(rows: MemberCash[]) {
  let yearGoal = 0, monthGoal = 0, monthActual = 0, withGoal = 0, withActual = 0;
  for (const row of rows) {
    if (row.yearGoal !== null) { yearGoal += row.yearGoal; }
    if (row.monthGoal !== null) { monthGoal += row.monthGoal; withGoal += 1; }
    if (row.monthActual !== null) { monthActual += row.monthActual; withActual += 1; }
  }
  return {
    yearGoal, monthGoal, monthActual, withGoal, withActual,
    monthPct: monthGoal > 0 ? Math.round((monthActual / monthGoal) * 100) : null,
  };
}
