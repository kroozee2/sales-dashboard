// The Goals board's ordering rules, kept pure so they can be reasoned about and
// tested without a browser. A sibling of lib/project-board.ts, and deliberately
// the same shape — the two boards should read the same way.
//
// The board answers one question at the top: what needs me now? Goals whose
// date has passed without landing come first, then this week, then the months
// ahead. Achieved goals leave the flow entirely so a pile of wins can never sit
// above work still in play.

export type GoalStatus = "achieved" | "behind" | "atrisk" | "ontrack";

export type BoardGoal = {
  /**
   * Closed out by hand — "I'm not chasing this any more". Distinct from
   * achieved, which the board works out for itself. A missed month stays in
   * Past due until you say you're done with it, and then it leaves the flow
   * rather than being deleted, because what you aimed at is worth keeping.
   */
  archived?: boolean;
  target_amount: number;
  period: string;
  target_date: string | null;
  created_at?: string;
  /**
   * "accumulates" — a running total through the period (cash collected,
   * tickets sold). "level" — a number you hold rather than pile up (active
   * MRR, headcount). Only a running total can be projected forward.
   */
  track_mode?: "accumulates" | "level";
};

export type GoalSection<T> = {
  key: string;
  label: string;
  emoji: string;
  tone: "rose" | "amber" | "zinc";
  items: T[];
};

/** A local YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoDaysFromNow(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** "2026-09" or a full date → "September 2026". */
export function monthLabel(s: string | null): string {
  if (!s) return "No date yet";
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * How much of the goal's window has gone by, 0..1.
 *
 * A target date wins over the period: a monthly goal dated the 18th is measured
 * against the run-up to the 18th, not the whole month, because that's the date
 * the number actually has to land on.
 */
export function elapsedFraction(g: BoardGoal, now = new Date()): number | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let start: Date;
  let end: Date;

  if (g.period === "one_time") {
    if (!g.target_date) return null;
    start = g.created_at ? new Date(g.created_at) : new Date(y, m, 1);
    end = new Date(`${g.target_date}T23:59:59`);
  } else if (g.period === "monthly") {
    start = new Date(y, m, 1);
    end = new Date(y, m + 1, 1);
  } else if (g.period === "quarterly") {
    const q = Math.floor(m / 3);
    start = new Date(y, q * 3, 1);
    end = new Date(y, q * 3 + 3, 1);
  } else if (g.period === "annual") {
    start = new Date(y, 0, 1);
    end = new Date(y + 1, 0, 1);
  } else if (g.period === "weekly") {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday-based
    start = new Date(y, m, d - dow);
    end = new Date(start.getTime() + 7 * 86400000);
  } else {
    return null;
  }

  const total = end.getTime() - start.getTime();
  if (total <= 0) return null;
  return Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / total));
}

/** Whole days from today to `date`; negative once it's past. */
export function daysUntil(date: string, now = new Date()): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T12:00:00`);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * Status is progress measured against time, not against zero.
 *
 * Half a target on the 15th of the month is on track; the same number on the
 * 28th is behind. Only "achieved" is absolute.
 */
export function goalStatus(g: BoardGoal, current: number, now = new Date()): GoalStatus {
  const target = g.target_amount || 0;
  const progress = target > 0 ? current / target : 0;
  if (progress >= 1) return "achieved";
  if (g.target_date && daysUntil(g.target_date, now) < 0) return "behind";
  if (g.track_mode === "level") {
    // No pace to measure — how close it sits to the number is the whole story.
    if (progress >= 0.9) return "ontrack";
    if (progress >= 0.7) return "atrisk";
    return "behind";
  }
  const elapsed = elapsedFraction(g, now);
  if (elapsed == null) return "ontrack";
  if (progress >= elapsed) return "ontrack";
  if (progress >= elapsed * 0.85) return "atrisk";
  return "behind";
}

/**
 * Where the goal ends up at today's rate, or null when the question doesn't
 * apply — too early to have a rate, or a level that doesn't accumulate.
 */
export function projectedTotal(g: BoardGoal, current: number, now = new Date()): number | null {
  if (g.track_mode === "level") return null;
  const elapsed = elapsedFraction(g, now);
  if (elapsed == null || elapsed <= 0.02) return null;
  return current / elapsed;
}

const STATUS_RANK: Record<GoalStatus, number> = { behind: 0, atrisk: 1, ontrack: 2, achieved: 3 };

/**
 * Most at risk first, then soonest due.
 *
 * Projects sort by a priority you set by hand; a goal carries its own urgency
 * in how far behind pace it is, so the board reads it rather than asking.
 */
export function sortByUrgency<T>(items: T[], statusOf: (item: T) => GoalStatus, dateOf: (item: T) => string | null): T[] {
  return [...items].sort((a, b) => {
    const rank = STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)];
    if (rank !== 0) return rank;
    return String(dateOf(a) ?? "9999").localeCompare(String(dateOf(b) ?? "9999"));
  });
}

export type GoalBoard<T> = {
  sections: GoalSection<T>[];
  achievedItems: T[];
  closedItems: T[];
  counts: { behind: number; week: number; open: number; achieved: number; closed: number };
};

/**
 * Split goals into the board's sections.
 *
 * `statusOf` is injected because a goal's current value depends on live Stripe
 * data the page owns — this module stays pure and knows nothing about fetching.
 */
export function buildGoalBoard<T extends BoardGoal>(
  goals: T[],
  statusOf: (goal: T) => GoalStatus,
  today: string,
  in7: string,
): GoalBoard<T> {
  const dateOf = (g: T) => g.target_date;
  const sort = (items: T[]) => sortByUrgency(items, statusOf, dateOf);

  // Closed out wins over everything: once you've said you're done with a goal
  // it shouldn't reappear in Past due, and it shouldn't be counted as a win.
  const closed = goals.filter((g) => g.archived === true);
  const live = goals.filter((g) => g.archived !== true);
  const achieved = live.filter((g) => statusOf(g) === "achieved");
  const open = live.filter((g) => statusOf(g) !== "achieved");

  const missed = open.filter((g) => g.target_date && g.target_date < today);
  const week = open.filter((g) => g.target_date && g.target_date >= today && g.target_date <= in7);
  const later = open.filter((g) => g.target_date && g.target_date > in7);
  const ongoing = open.filter((g) => !g.target_date);

  const sections: GoalSection<T>[] = [];
  if (missed.length) {
    sections.push({ key: "missed", label: "Past due", emoji: "⚠️", tone: "rose", items: sort(missed) });
  }
  if (week.length) {
    sections.push({ key: "week", label: "This week", emoji: "🎯", tone: "amber", items: sort(week) });
  }

  // Everything further out keeps its month block, so the runway stays readable.
  const months = new Map<string, T[]>();
  for (const g of later) {
    const key = g.target_date!.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(g);
  }
  for (const key of Array.from(months.keys()).sort()) {
    sections.push({
      key: `m-${key}`,
      label: monthLabel(`${key}-01`),
      emoji: "📆",
      tone: "zinc",
      items: sort(months.get(key)!),
    });
  }

  if (ongoing.length) {
    sections.push({ key: "ongoing", label: "Ongoing", emoji: "♾️", tone: "zinc", items: sort(ongoing) });
  }

  return {
    sections,
    achievedItems: [...achieved].sort((a, b) => String(b.target_date ?? "").localeCompare(String(a.target_date ?? ""))),
    closedItems: [...closed].sort((a, b) => String(b.target_date ?? "").localeCompare(String(a.target_date ?? ""))),
    counts: {
      behind: missed.length, week: week.length, open: open.length,
      achieved: achieved.length, closed: closed.length,
    },
  };
}

/**
 * A section's combined progress — the roll-up that turns a month heading into a
 * status line. Cash and counts don't share a unit, so this averages each goal's
 * own completion rather than summing raw numbers across incompatible scales.
 */
export function sectionProgress<T>(
  items: T[],
  currentOf: (item: T) => number,
  targetOf: (item: T) => number,
): { pct: number; complete: number } {
  if (!items.length) return { pct: 0, complete: 0 };
  let sum = 0;
  let complete = 0;
  for (const item of items) {
    const target = targetOf(item);
    const ratio = target > 0 ? Math.min(1, currentOf(item) / target) : 0;
    sum += ratio;
    if (ratio >= 1) complete += 1;
  }
  return { pct: (sum / items.length) * 100, complete };
}

// ─── Automated goals ─────────────────────────────────────────────────────────

/**
 * Where a goal gets its current number from.
 *
 * "manual" is whatever was typed in. The rest read the same data the Finances
 * and Calls pages read, scoped to the goal's own window — so "August Cash
 * Collected" shows August, not month-to-date.
 */
export type GoalSource = "manual" | "stripe_cash" | "booked_calls";

export const AUTO_SOURCES: { key: GoalSource; label: string; emoji: string; hint: string }[] = [
  { key: "manual", label: "Manual", emoji: "✍️", hint: "You type the number" },
  { key: "stripe_cash", label: "Cash collected", emoji: "💵", hint: "Stripe + logged payments, in this goal's window" },
  { key: "booked_calls", label: "Booked calls", emoji: "📞", hint: "Sales calls on the calendar, in this goal's window" },
];

/** Legacy fixed-period sources, kept working so old goals don't break. */
const LEGACY_CASH_SOURCES = new Set(["cash_mtd", "cash_wtd", "cash_qtd", "cash_ytd", "cash_alltime"]);

export function isAutoSource(source: string | null | undefined): boolean {
  return source === "stripe_cash" || source === "booked_calls" || LEGACY_CASH_SOURCES.has(source ?? "");
}

/**
 * The months a goal covers, as "YYYY-MM" keys.
 *
 * A goal's window comes from its own target date, not from today: an annual
 * goal dated 2026-12-31 covers all of 2026, and a monthly goal dated
 * 2026-08-31 covers August — which is the whole point of automating it.
 */
export function goalMonths(
  g: { period: string; target_date: string | null; created_at?: string },
  now = new Date(),
): string[] {
  const anchor = g.target_date ? new Date(`${g.target_date}T12:00:00`) : now;
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const key = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;

  if (g.period === "annual") return Array.from({ length: 12 }, (_, i) => key(y, i));
  if (g.period === "quarterly") {
    const q = Math.floor(m / 3) * 3;
    return [key(y, q), key(y, q + 1), key(y, q + 2)];
  }
  if (g.period === "one_time" && g.created_at) {
    // A one-off spans from when it was set to when it's due.
    const start = new Date(g.created_at);
    const months: string[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = new Date(y, m, 1);
    while (cur <= end) {
      months.push(key(cur.getFullYear(), cur.getMonth()));
      cur.setMonth(cur.getMonth() + 1);
    }
    return months.length ? months : [key(y, m)];
  }
  // monthly, weekly and anything unrecognised resolve to the single month.
  return [key(y, m)];
}

/** Live totals by month, as returned by /api/goals/live. */
export type LiveMonthly = { cashByMonth: Record<string, number>; callsByMonth: Record<string, number> };

/**
 * The automated part of a goal's current value, or null when it has none.
 *
 * Legacy `cash_*` goals keep reading their fixed period from the old
 * period-keyed totals rather than being silently re-scoped.
 */
export function autoValue(
  g: { period: string; target_date: string | null; created_at?: string; source: string | null },
  live: LiveMonthly,
  legacyByPeriod: Record<string, number> = {},
  now = new Date(),
): number | null {
  if (!g.source) return null;
  if (LEGACY_CASH_SOURCES.has(g.source)) return legacyByPeriod[g.source] ?? null;
  if (g.source !== "stripe_cash" && g.source !== "booked_calls") return null;

  const table = g.source === "stripe_cash" ? live.cashByMonth : live.callsByMonth;
  const months = goalMonths(g, now);
  let total = 0;
  let sawAny = false;
  for (const m of months) {
    if (m in table) sawAny = true;
    total += table[m] ?? 0;
  }
  // An empty window is a real zero once the data has loaded — but before it
  // loads, every month is missing, and claiming zero would flash "behind".
  return sawAny || Object.keys(table).length > 0 ? total : null;
}
