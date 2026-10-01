// The live 7-Figure CEO Referral Party series is at 09:00 America/Hermosillo
// on the second Thursday of each month. Hermosillo does not observe DST, so
// every occurrence begins at 16:00 UTC. Keep the queue identity derived from
// that verified contract instead of the retired series ID.

export const REFERRAL_PARTY_SERIES_ID = "8gk1dn0pk1jso1bo86b5sp1v5p";
export const REFERRAL_PARTY_TITLE = "🎉 7-Figure CEO Referral Party";
export const REFERRAL_PARTY_TIME_ZONE = "America/Hermosillo";
export const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const EVENT_HOUR = 9;
const DURATION_MINUTES = 75;

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let index = 0; index < 2; index += 1) {
    const seen = partsIn(new Date(guess), timeZone);
    const drift = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) - guess;
    guess = target - drift;
  }
  return new Date(guess);
}

function secondThursday(year: number, month: number): number {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((4 - firstWeekday + 7) % 7) + 7;
}

const pad = (value: number) => String(value).padStart(2, "0");

export type ReferralPartyOccurrence = {
  start: Date;
  end: Date;
  date: string;
  eventId: string;
  label: string;
};

export function partyFor(year: number, month: number): ReferralPartyOccurrence {
  const day = secondThursday(year, month);
  const start = zonedTimeToUtc(year, month, day, EVENT_HOUR, 0, REFERRAL_PARTY_TIME_ZONE);
  const date = `${year}-${pad(month)}-${pad(day)}`;
  const stamp = `${year}${pad(month)}${pad(day)}T${pad(start.getUTCHours())}${pad(start.getUTCMinutes())}00Z`;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(start);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(start);
  return {
    start,
    end: new Date(start.getTime() + DURATION_MINUTES * 60_000),
    date,
    eventId: `${REFERRAL_PARTY_SERIES_ID}_${stamp}`,
    label: `${dateLabel} · ${timeLabel}`,
  };
}

export function nextParty(now: Date = new Date()): ReferralPartyOccurrence {
  const current = partsIn(now, REFERRAL_PARTY_TIME_ZONE);
  const thisMonth = partyFor(current.year, current.month);
  if (now < thisMonth.end) return thisMonth;
  return current.month === 12 ? partyFor(current.year + 1, 1) : partyFor(current.year, current.month + 1);
}
