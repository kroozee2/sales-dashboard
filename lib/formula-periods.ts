// The Winning Formula runs on three clocks: daily, weekly, monthly.
//
// All three share one storage trick: habit_logs.day holds the START of the
// period, so a Monday date means that week and the 1st means that month. The
// (habit_id, day) unique index then makes ticking idempotent for every cadence
// with no schema change. (Ported from the Mastermind Portal tracker.)
//
// Pure and dependency-free. Dates are handled as UTC midnights throughout.

export const CADENCES = ["Daily", "Weekly", "Monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

export const CADENCE_META: Record<Cadence, { emoji: string; title: string; blurb: string; unit: string; slots: number }> = {
  Daily:   { emoji: "☀️", title: "Daily Winning Formula",   blurb: "The non-negotiables. Done every day, you win the day.", unit: "day",   slots: 7 },
  Weekly:  { emoji: "📆", title: "Weekly Winning Formula",  blurb: "The moves that only need to happen once a week, but never slip.", unit: "week",  slots: 8 },
  Monthly: { emoji: "🗓️", title: "Monthly Winning Formula", blurb: "The big rocks. Miss these and the month quietly disappears.", unit: "month", slots: 6 },
};

export const isCadence = (c: unknown): c is Cadence => (CADENCES as readonly string[]).includes(String(c));

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day));

/** The date that identifies the period a moment falls in. */
export function periodStart(cadence: Cadence, on: Date | string = new Date()): string {
  const d = typeof on === "string" ? new Date(`${on}T00:00:00Z`) : on;
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (cadence === "Monthly") return iso(utc(y, m, 1));
  if (cadence === "Weekly") {
    // ISO weeks start Monday. getUTCDay() is 0 for Sunday, so Sunday goes back 6.
    const dow = utc(y, m, day).getUTCDay();
    const back = dow === 0 ? 6 : dow - 1;
    return iso(utc(y, m, day - back));
  }
  return iso(utc(y, m, day));
}

/** The previous period start, walking backwards from a period start. */
export function prevPeriod(cadence: Cadence, start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (cadence === "Monthly") return iso(utc(y, m - 1, 1));
  if (cadence === "Weekly") return iso(utc(y, m, day - 7));
  return iso(utc(y, m, day - 1));
}

/** The last N period starts, oldest first, ending with the one we are in now. */
export function lastPeriods(cadence: Cadence, count: number, on: Date | string = new Date()): string[] {
  const out: string[] = [];
  let cur = periodStart(cadence, on);
  for (let i = 0; i < count; i++) { out.unshift(cur); cur = prevPeriod(cadence, cur); }
  return out;
}

/** The short label under each box in the grid. */
export function periodLabel(cadence: Cadence, start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  if (cadence === "Daily") return ["S", "M", "T", "W", "T", "F", "S"][d.getUTCDay()];
  if (cadence === "Weekly") return `${d.getUTCDate()}`;
  return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

/** The fuller label, for a tooltip. */
export function periodTitle(cadence: Cadence, start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "UTC", month: "short", day: "numeric" };
  if (cadence === "Monthly") return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  if (cadence === "Weekly") return `Week of ${d.toLocaleDateString("en-US", opts)}`;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

// SalesOS habit shape: `name` + `emoji` + `owner` (Andrew/Jameson) + `cadence`.
export type FormulaHabit = { id: string; name: string; emoji: string; owner: string; cadence: string; done: string[] };

/**
 * The streak that makes this addictive: how many periods in a row EVERY habit
 * in this formula was completed. The current period does not break the streak
 * while it is still running.
 */
export function formulaStreak(habits: FormulaHabit[], cadence: Cadence, on: Date | string = new Date()): number {
  if (!habits.length) return 0;
  const complete = (p: string) => habits.every((h) => h.done.includes(p));
  const current = periodStart(cadence, on);
  let streak = 0;
  let p = complete(current) ? current : prevPeriod(cadence, current);
  for (let i = 0; i < 400 && complete(p); i++) { streak++; p = prevPeriod(cadence, p); }
  return streak;
}

/** How much of the CURRENT period is done, for the ring. */
export function periodProgress(habits: FormulaHabit[], cadence: Cadence, on: Date | string = new Date()): { done: number; total: number; pct: number } {
  const p = periodStart(cadence, on);
  const total = habits.length;
  const done = habits.filter((h) => h.done.includes(p)).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Hit rate across the visible grid. */
export function gridRate(habits: FormulaHabit[], periods: string[]): number {
  const slots = habits.length * periods.length;
  if (!slots) return 0;
  const hit = habits.reduce((a, h) => a + h.done.filter((d) => periods.includes(d)).length, 0);
  return Math.round((hit / slots) * 100);
}

/**
 * One number across all three formulas. Weighted so the daily work carries the
 * most, because it is the one that compounds.
 */
export function winningScore(byCadence: Record<Cadence, FormulaHabit[]>, on: Date | string = new Date()): number {
  const weights: Record<Cadence, number> = { Daily: 0.5, Weekly: 0.3, Monthly: 0.2 };
  let score = 0, used = 0;
  for (const c of CADENCES) {
    const hs = byCadence[c] ?? [];
    if (!hs.length) continue;
    score += periodProgress(hs, c, on).pct * weights[c];
    used += weights[c];
  }
  return used ? Math.round(score / used) : 0;
}
