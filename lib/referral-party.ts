// The 🎉 7-Figure CEO Referral Party: when the next one is, and which Google
// Calendar instance it is.
//
// Two facts about the real series drive everything here:
//
//   1. It recurs on the SECOND THURSDAY of each month.
//   2. Its timezone is `America/Hermosillo`, at 09:00.
//
// Hermosillo does not observe daylight saving, so the party is pinned to 16:00
// UTC all year. That reads as 9:00 AM Pacific from March to November and 8:00
// AM Pacific from November to March. Nothing here hardcodes a Pacific time; it
// is always derived, so this cannot drift out of step with the invite people
// actually receive.
//
// The series moved on 2026-09-07. The previous one (r0mjc229cjidri36bbkbhmfaj0,
// at T190000Z) is retired and every one of its instance ids now 404s.

export const SERIES_ID = "8gk1dn0pk1jso1bo86b5sp1v5p";
export const EVENT_TITLE = "🎉 7-Figure CEO Referral Party";
export const EVENT_TZ = "America/Hermosillo";
export const EVENT_HOUR = 9;
export const DURATION_MINUTES = 75;
export const PACIFIC_TZ = "America/Los_Angeles";
export const ZOOM_URL = "https://us02web.zoom.us/j/8681235900";

/** The wall-clock fields of `date` as they read in `timeZone`. */
function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Intl renders midnight as hour 24 in some ICU versions; 24:00 is 00:00.
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/**
 * The UTC instant at which the clock in `timeZone` reads the given wall time.
 * Solved by iteration rather than with a timezone library: guess the wall time
 * is UTC, measure how far off that lands in the target zone, correct. Two
 * passes converge even across a DST boundary.
 */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const seen = partsIn(new Date(guess), timeZone);
    const drift = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) - guess;
    guess = target - drift;
  }
  return new Date(guess);
}

/** The second Thursday of the given month, as a day number. */
function secondThursday(year: number, month: number): number {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 Sun … 4 Thu
  return 1 + ((4 - firstWeekday + 7) % 7) + 7;
}

export type Party = {
  start: Date;
  end: Date;
  /** `YYYY-MM-DD`. The key the invite queue is stored under. */
  date: string;
  /** The Google Calendar id of this one instance. */
  eventId: string;
  /** e.g. "Thursday, September 10 · 9:00 AM PDT" */
  label: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function formatPartyDate(date: Date, timeZone = PACIFIC_TZ): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(date);
}

/** The start time with the zone's own short name, e.g. "9:00 AM PDT". */
export function formatPartyTime(date: Date, timeZone = PACIFIC_TZ): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(date);
}

export function partyFor(year: number, month: number): Party {
  const day = secondThursday(year, month);
  const start = zonedTimeToUtc(year, month, day, EVENT_HOUR, 0, EVENT_TZ);
  const stamp = `${year}${pad(month)}${pad(day)}T${pad(start.getUTCHours())}${pad(start.getUTCMinutes())}00Z`;
  return {
    start,
    end: new Date(start.getTime() + DURATION_MINUTES * 60_000),
    date: `${year}-${pad(month)}-${pad(day)}`,
    eventId: `${SERIES_ID}_${stamp}`,
    label: `${formatPartyDate(start)} · ${formatPartyTime(start)}`,
  };
}

/**
 * The next party someone can still be added to. The cutoff is the END of the
 * event, not its start, so it keeps pointing at today's party while that party
 * is actually running rather than rolling forward the moment it begins.
 */
export function nextParty(now: Date = new Date()): Party {
  const here = partsIn(now, EVENT_TZ);
  const thisMonth = partyFor(here.year, here.month);
  if (now < thisMonth.end) return thisMonth;
  return here.month === 12 ? partyFor(here.year + 1, 1) : partyFor(here.year, here.month + 1);
}
