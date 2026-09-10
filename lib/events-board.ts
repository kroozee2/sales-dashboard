// The events board: every event by the month it actually happens, and whether
// that month has a conversion event in it.
//
// The Events tab was a flat list of cards ordered by date, which answers "what
// is next" but not "is every month covered". The goal is at least one
// conversion event a month, and a list cannot show you the month you skipped.

import { EVENT_TYPES } from "./content-constants.ts";

export type BoardEvent = {
  id: string;
  title: string;
  event_type: string;
  start_date: string | null;
  end_date: string | null;
  price: number | null;
  spots_goal: number | null;
  signups: number;
  page_url: string | null;
  location: string | null;
  notes: string | null;
};

/**
 * The mechanisms that ask for money. A free webinar and a JV workshop build the
 * audience; these are what convert it, which is the thing being counted one a
 * month. A free-typed event that carries a price still counts — the price is
 * the stronger signal about what the event is actually for.
 */
export const CONVERSION_TYPES = new Set([
  "paid_webinar", "paid_trial", "limited_spots", "in_person", "challenge",
]);

export function isConversionEvent(event: BoardEvent): boolean {
  if ((event.price ?? 0) > 0) return true;
  return CONVERSION_TYPES.has(event.event_type);
}

export const typeLabel = (key: string) =>
  EVENT_TYPES.find((t) => t.key === key)?.label ?? key;

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

export type MonthGroup = {
  key: string;
  label: string;
  events: BoardEvent[];
  conversions: number;
  /** True once the month has the one conversion event it is supposed to have. */
  covered: boolean;
  isPast: boolean;
  isCurrent: boolean;
};

/** Spots, and never a percentage that outruns the goal. */
export function spots(event: BoardEvent) {
  const goal = event.spots_goal ?? 0;
  const filled = Math.max(0, event.signups ?? 0);
  if (goal <= 0) return { has: false, goal: 0, filled, remaining: 0, pct: 0, full: false };
  const remaining = Math.max(0, goal - filled);
  return {
    has: true, goal, filled, remaining,
    pct: Math.min(100, Math.round((filled / goal) * 100)),
    full: remaining === 0,
  };
}

/**
 * Every month from `months` back to `months` ahead, whether or not it has an
 * event. An empty month is the point: a board that only lists what exists
 * cannot show you the gap you are trying to close.
 */
export function groupByMonth(
  events: BoardEvent[],
  { back = 3, ahead = 6, now = new Date() }: { back?: number; ahead?: number; now?: Date } = {},
): MonthGroup[] {
  const current = monthKey(now);
  const byMonth = new Map<string, BoardEvent[]>();
  for (const event of events) {
    if (!event.start_date) continue;
    const key = event.start_date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    byMonth.set(key, [...(byMonth.get(key) ?? []), event]);
  }

  const keys = new Set<string>();
  for (let offset = -back; offset <= ahead; offset += 1) {
    keys.add(monthKey(new Date(now.getFullYear(), now.getMonth() + offset, 1)));
  }
  // A dated event outside the window still deserves a row; it is real work.
  for (const key of byMonth.keys()) keys.add(key);

  return [...keys].sort().map((key) => {
    const list = [...(byMonth.get(key) ?? [])].sort((a, b) =>
      (a.start_date ?? "").localeCompare(b.start_date ?? "") || a.title.localeCompare(b.title));
    const conversions = list.filter(isConversionEvent).length;
    return {
      key,
      label: monthLabel(key),
      events: list,
      conversions,
      covered: conversions > 0,
      isPast: key < current,
      isCurrent: key === current,
    };
  });
}

/** Events with no date at all. They are invisible on a month board otherwise. */
export function undated(events: BoardEvent[]): BoardEvent[] {
  return events.filter((event) => !event.start_date)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export type Coverage = {
  months: { key: string; label: string; short: string; covered: boolean; isPast: boolean; isCurrent: boolean; conversions: number }[];
  covered: number;
  total: number;
  /** Months from here on with nothing that converts. The list to act on. */
  gaps: string[];
};

/**
 * How the year is tracking against one conversion event a month.
 *
 * Past months are counted because they are the record; upcoming months are what
 * you can still fix, so the gaps list only names those.
 */
export function coverage(groups: MonthGroup[], { window = 12 }: { window?: number } = {}): Coverage {
  const inWindow = groups.slice(0, window).length === groups.length
    ? groups
    : groups.filter((g) => !g.isPast || g.events.length > 0).slice(0, window);

  return {
    months: inWindow.map((g) => ({
      key: g.key,
      label: g.label,
      short: g.label.slice(0, 3),
      covered: g.covered,
      isPast: g.isPast,
      isCurrent: g.isCurrent,
      conversions: g.conversions,
    })),
    covered: inWindow.filter((g) => g.covered).length,
    total: inWindow.length,
    gaps: inWindow.filter((g) => !g.covered && !g.isPast).map((g) => g.label),
  };
}
