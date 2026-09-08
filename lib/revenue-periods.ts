/**
 * Period maths for the Finances dashboard.
 *
 * Every period is expressed as explicit bucket *edges* (unix seconds) rather
 * than formatted labels, so a charge lands in a bucket by comparing numbers.
 * The old chart matched formatted strings ("Jun 27"), which silently put a
 * payment in the wrong bar whenever two periods happened to format alike.
 *
 * `previousWindow` returns the same shape shifted back one period, so "this
 * month vs last month" compares day 1..today against day 1..the same day.
 */

export type PeriodKey = "wtd" | "mtd" | "qtd" | "ytd" | "alltime";

export interface RevenueWindow {
  key: string;
  /** Inclusive start, unix seconds. null means "everything ever". */
  gte: number | null;
  /** Exclusive end, unix seconds. */
  lt: number;
  /** One label per bucket. */
  labels: string[];
  /** Bucket boundaries, length labels.length + 1. */
  edges: number[];
}

const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const dayLabel = (d: Date) => `${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`;
const weekdayLabel = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });

/** Consecutive day buckets starting at `start`. */
function dayBuckets(start: Date, count: number, label: (d: Date) => string) {
  const labels: string[] = [];
  const edges: number[] = [];
  for (let i = 0; i < count; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    labels.push(label(day));
    edges.push(secs(day));
  }
  edges.push(secs(new Date(start.getFullYear(), start.getMonth(), start.getDate() + count)));
  return { labels, edges };
}

/** Consecutive month buckets starting at (year, month). */
function monthBuckets(year: number, month: number, count: number) {
  const labels: string[] = [];
  const edges: number[] = [];
  for (let i = 0; i < count; i++) {
    const first = new Date(year, month + i, 1);
    labels.push(monthLabel(first));
    edges.push(secs(first));
  }
  edges.push(secs(new Date(year, month + count, 1)));
  return { labels, edges };
}

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** Monday-based start of the week containing `now`. */
export function weekStart(now: Date): Date {
  const dow = now.getDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
}

export function periodWindow(period: string, now = new Date()): RevenueWindow {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const lt = secs(new Date(now.getTime() + 1000)); // include the charge that just landed

  if (period === "wtd") {
    const start = weekStart(now);
    const count = Math.round((startOfDay(now).getTime() - start.getTime()) / 86400000) + 1;
    const { labels, edges } = dayBuckets(start, count, weekdayLabel);
    return { key: "wtd", gte: secs(start), lt, labels, edges };
  }

  if (period === "qtd") {
    const qMonth = Math.floor(m / 3) * 3;
    const { labels, edges } = monthBuckets(y, qMonth, m - qMonth + 1);
    return { key: "qtd", gte: secs(new Date(y, qMonth, 1)), lt, labels, edges };
  }

  if (period === "ytd") {
    const { labels, edges } = monthBuckets(y, 0, m + 1);
    return { key: "ytd", gte: secs(new Date(y, 0, 1)), lt, labels, edges };
  }

  if (period === "alltime") {
    const firstYear = 2020;
    const labels: string[] = [];
    const edges: number[] = [];
    for (let yr = firstYear; yr <= y; yr++) {
      labels.push(String(yr));
      edges.push(secs(new Date(yr, 0, 1)));
    }
    edges.push(secs(new Date(y + 1, 0, 1)));
    return { key: "alltime", gte: null, lt, labels, edges };
  }

  // mtd (the default)
  const { labels, edges } = dayBuckets(new Date(y, m, 1), d, dayLabel);
  return { key: "mtd", gte: secs(new Date(y, m, 1)), lt, labels, edges };
}

/**
 * The same stretch of the previous period — last month days 1..today, last week
 * Mon..the same weekday, and so on. null when there's nothing to compare to.
 */
export function previousWindow(period: string, now = new Date()): RevenueWindow | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (period === "wtd") {
    const start = new Date(weekStart(now).getTime() - 7 * 86400000);
    const count = periodWindow("wtd", now).labels.length;
    const { labels, edges } = dayBuckets(start, count, weekdayLabel);
    return { key: "wtd-prev", gte: edges[0], lt: edges[edges.length - 1], labels, edges };
  }

  if (period === "mtd") {
    const py = m === 0 ? y - 1 : y;
    const pm = m === 0 ? 11 : m - 1;
    // Clamp: comparing through Mar 31 against February stops at the 28th.
    const count = Math.min(d, daysInMonth(py, pm));
    const { labels, edges } = dayBuckets(new Date(py, pm, 1), count, dayLabel);
    return { key: "mtd-prev", gte: edges[0], lt: edges[edges.length - 1], labels, edges };
  }

  if (period === "qtd") {
    const qMonth = Math.floor(m / 3) * 3;
    const prevQStart = new Date(y, qMonth - 3, 1);
    const { labels, edges } = monthBuckets(prevQStart.getFullYear(), prevQStart.getMonth(), m - qMonth + 1);
    return { key: "qtd-prev", gte: edges[0], lt: edges[edges.length - 1], labels, edges };
  }

  if (period === "ytd") {
    const { labels, edges } = monthBuckets(y - 1, 0, m + 1);
    return { key: "ytd-prev", gte: edges[0], lt: edges[edges.length - 1], labels, edges };
  }

  return null; // all time has no "before"
}

/** Index of the bucket holding `ts`, or -1 when it falls outside the window. */
export function bucketIndex(edges: number[], ts: number): number {
  if (edges.length < 2 || ts < edges[0] || ts >= edges[edges.length - 1]) return -1;
  let lo = 0;
  let hi = edges.length - 2;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ts < edges[mid]) hi = mid - 1;
    else if (ts >= edges[mid + 1]) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Percent change, or null when there's no meaningful base to divide by. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Straight-line projection for the full period from what's landed so far.
 * Returns null once the period is complete (nothing left to project).
 */
export function projectTotal(total: number, elapsed: number, full: number): number | null {
  if (elapsed <= 0 || full <= elapsed) return null;
  return (total / elapsed) * full;
}

/** How many buckets the period will hold once it's over (for projection). */
export function fullPeriodLength(period: string, now = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "wtd") return 7;
  if (period === "mtd") return daysInMonth(y, m);
  if (period === "qtd") return 3;
  if (period === "ytd") return 12;
  return 0; // all time never ends
}
