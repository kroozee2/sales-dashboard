// The clients Dashboard, on the shape Helm's Dashboards uses.
//
// Sales OS was showing counts and health bars. Helm's version answers the
// question the roster cannot: is the book growing? It reads the monthly
// check-ins — cash collected, new revenue, NPS — and draws them by month, with
// client health, contact recency and check-in compliance beside them.
//
// Pure, so the arithmetic can be checked without a database.

import type { CheckInRecord } from "@/lib/client-detail";

export type MonthPoint = {
  key: string;
  label: string;
  cash: number;
  newRevenue: number;
  nps: number | null;
  checkIns: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Money by month, across everyone.
 *
 * Months are keyed from the date, not the typed label: "Aug 2026", "August
 * 2026" and "august 2026" are the same month and were three bars.
 * Future-dated check-ins are excluded — a month nobody has lived through has
 * no cash in it, and a zero bar at the right-hand edge reads as a collapse.
 */
export function monthlySeries(rows: CheckInRecord[], months = 12, now = new Date()): MonthPoint[] {
  const cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const buckets = new Map<string, MonthPoint>();

  for (const row of rows) {
    if (!row.monthDate) continue;
    const key = row.monthDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key) || key > cutoff) continue;
    const [year, month] = key.split("-");
    const point = buckets.get(key) ?? {
      key,
      label: `${MONTHS[Number(month) - 1] ?? month} ${year.slice(2)}`,
      cash: 0, newRevenue: 0, nps: null, checkIns: 0,
    };
    point.cash += row.cashCollected ?? 0;
    point.newRevenue += row.newRevenue ?? 0;
    point.checkIns += 1;
    if (row.nps !== null) {
      // A running mean, so one month's scores weigh equally.
      const seen = point.nps === null ? 0 : 1;
      point.nps = point.nps === null ? row.nps : (point.nps * seen + row.nps) / (seen + 1);
    }
    buckets.set(key, point);
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-months);
}

/** The tallest bar, so a chart can scale to what is actually in it. */
export function peak(points: MonthPoint[], pick: (p: MonthPoint) => number): number {
  return points.reduce((max, point) => Math.max(max, pick(point)), 0);
}

export type Compliance = { submitted: number; expected: number; pct: number };

/**
 * How many active clients filed this month's check-in. Compliance is of the
 * people who were asked, so a bigger roster does not look like worse discipline.
 */
export function checkInCompliance(
  activeClientIds: string[],
  rowsByClient: Map<string, CheckInRecord[]>,
  now = new Date(),
): Compliance {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const expected = activeClientIds.length;
  const submitted = activeClientIds.filter((id) =>
    (rowsByClient.get(id) ?? []).some((row) => row.monthDate?.slice(0, 7) === key),
  ).length;
  return { submitted, expected, pct: expected ? Math.round((submitted / expected) * 100) : 0 };
}

export type RecencyBand = { label: string; count: number; tone: "good" | "watch" | "risk" };

/**
 * Contact recency in bands, which is how Helm reads it. "14+ days" is the one
 * that matters; a mean would hide it behind everyone you spoke to yesterday.
 */
export function contactRecency(daysSince: (number | null)[]): RecencyBand[] {
  const within = (lo: number, hi: number) =>
    daysSince.filter((d) => d !== null && d >= lo && d < hi).length;
  return [
    { label: "This week", count: within(0, 7), tone: "good" },
    { label: "1–2 weeks", count: within(7, 14), tone: "watch" },
    { label: "14+ days", count: daysSince.filter((d) => d !== null && d >= 14).length, tone: "risk" },
    { label: "Never", count: daysSince.filter((d) => d === null).length, tone: "risk" },
  ];
}

/** Latest NPS across active clients, from each one's most recent scored month. */
export function averageNps(rowsByClient: Map<string, CheckInRecord[]>, activeClientIds: string[]): number | null {
  const scores = activeClientIds
    .map((id) => (rowsByClient.get(id) ?? []).find((row) => row.nps !== null)?.nps)
    .filter((score): score is number => typeof score === "number");
  if (!scores.length) return null;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
}
