export type ContentScheduleGroup = "due" | "upcoming" | "unscheduled";

export interface SpreadsheetContentItem {
  id: string;
  title: string;
  category: string;
  status: string;
  scheduled_date: string | null;
  platforms?: string[];
  meta?: Record<string, unknown>;
  created_at: string;
}

export type ContentCadenceKey = "youtube" | "youtube_shorts" | "instagram" | "email" | "facebook";

/**
 * `kinds` narrows a lane to one format. YouTube runs two rhythms at once, a
 * long-form video weekly and shorts daily, and posted_content already tags
 * every video long or short. `countBy` is how the week is scored: "days" for a
 * daily habit, where a second post on Tuesday does not buy back a silent
 * Wednesday, and "posts" for a weekly quota.
 */
export const CONTENT_CADENCE: {
  key: ContentCadenceKey; label: string; icon: string; weeklyTarget: number;
  helper: string; platforms: string[]; kinds?: string[]; countBy: "days" | "posts";
}[] = [
  { key: "youtube", label: "YouTube", icon: "▶️", weeklyTarget: 1, helper: "1 long-form video each week", platforms: ["youtube"], kinds: ["long"], countBy: "posts" },
  { key: "youtube_shorts", label: "YT Shorts", icon: "⚡", weeklyTarget: 7, helper: "7 short-form videos each week", platforms: ["youtube"], kinds: ["short"], countBy: "posts" },
  { key: "instagram", label: "Instagram", icon: "📱", weeklyTarget: 7, helper: "1 Reel or carousel daily", platforms: ["instagram", "carousel"], countBy: "days" },
  { key: "email", label: "Email", icon: "✉️", weeklyTarget: 3, helper: "3 broadcasts each week", platforms: ["email"], countBy: "posts" },
  { key: "facebook", label: "Facebook", icon: "📘", weeklyTarget: 7, helper: "7 posts each week", platforms: ["facebook"], countBy: "posts" },
];

export const CONTENT_FOCUS_AREAS = [
  { key: "event", label: "Upcoming events" },
  { key: "ai_claude", label: "AI + Claude updates" },
  { key: "offer_launch", label: "Offer launches + CTA" },
  { key: "methodology", label: "Core methodologies" },
] as const;

export const CONTENT_SCHEDULE_GROUPS: ContentScheduleGroup[] = [
  "due",
  "upcoming",
  "unscheduled",
];

/**
 * Anything dated today or earlier is simply due. There is no separate overdue
 * bucket: a date that has slipped says nothing useful about the work, and a red
 * banner counting your misses every time you open the page is the reason this
 * view felt like a telling-off rather than a plan.
 */
export function scheduleGroupOf(
  item: SpreadsheetContentItem,
  today: string,
): ContentScheduleGroup | null {
  if (item.status === "posted") return null;
  if (!item.scheduled_date) return "unscheduled";
  if (item.scheduled_date <= today) return "due";
  return "upcoming";
}

export function sortContentSpreadsheetItems<T extends SpreadsheetContentItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const date = (a.scheduled_date ?? "9999-12-31").localeCompare(b.scheduled_date ?? "9999-12-31");
    if (date !== 0) return date;
    const category = a.category.localeCompare(b.category);
    if (category !== 0) return category;
    return a.title.localeCompare(b.title);
  });
}

export function groupContentBySchedule<T extends SpreadsheetContentItem>(items: T[], today: string) {
  const groups: Record<ContentScheduleGroup, T[]> = {
    due: [],
    upcoming: [],
    unscheduled: [],
  };

  for (const item of items) {
    const group = scheduleGroupOf(item, today);
    if (group) groups[group].push(item);
  }

  for (const group of CONTENT_SCHEDULE_GROUPS) {
    groups[group] = sortContentSpreadsheetItems(groups[group]);
  }
  return groups;
}

/** A real post that went out: platform plus the day it landed. */
export type ContentActual = { platform: string; date: string; kind?: string | null };

export function weekBoundsFor(today: string) {
  const value = new Date(`${today}T12:00:00`);
  const day = value.getDay();
  const weekStart = datePlusDays(today, day === 0 ? -6 : 1 - day);
  return { weekStart, weekEnd: datePlusDays(weekStart, 6) };
}

/**
 * How the week is actually going.
 *
 * This used to count planned content items, so a YouTube video that genuinely
 * went out on Wednesday showed as 0 of 1 unless somebody had also created a
 * scheduled row for it. A publishing tracker that ignores what you published is
 * worse than no tracker, because it is confidently wrong.
 *
 * `posted` counts what the platforms themselves report. `planned` is kept
 * alongside it so the card can still say what is lined up, but the bar and the
 * met/not-met state follow reality.
 */
export function contentCadenceProgress<T extends SpreadsheetContentItem>(
  items: T[],
  today: string,
  actuals: ContentActual[] = [],
) {
  const { weekStart, weekEnd } = weekBoundsFor(today);
  const inWeek = (date: string) => date >= weekStart && date <= weekEnd;

  return Object.fromEntries(CONTENT_CADENCE.map((cadence) => {
    const planned = items.filter((item) => {
      if (!item.scheduled_date || !inWeek(item.scheduled_date)) return false;
      if (!(item.platforms ?? []).some((platform) => cadence.platforms.includes(platform))) return false;
      // Planned rows carry no long/short distinction, so a planned YouTube video
      // counts as the weekly long-form one. Shorts are counted once they exist.
      return cadence.key !== "youtube_shorts";
    });

    const posted = actuals.filter((a) => {
      if (!inWeek(a.date) || !cadence.platforms.includes(a.platform)) return false;
      return !cadence.kinds || (a.kind != null && cadence.kinds.includes(a.kind));
    });
    const postedDates = [...new Set(posted.map((a) => a.date))].sort();
    const plannedDates = [...new Set(planned.map((item) => item.scheduled_date as string))].sort();

    const count = cadence.countBy === "days" ? postedDates.length : posted.length;
    const plannedCount = cadence.countBy === "days" ? plannedDates.length : planned.length;

    return [cadence.key, {
      count,
      planned: plannedCount,
      target: cadence.weeklyTarget,
      dates: postedDates,
      met: count >= cadence.weeklyTarget,
    }];
  })) as Record<ContentCadenceKey, { count: number; planned: number; target: number; dates: string[]; met: boolean }>;
}

function datePlusDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function moveContentToScheduleGroup(group: ContentScheduleGroup, today: string): string | null {
  if (group === "unscheduled") return null;
  if (group === "upcoming") return datePlusDays(today, 1);
  // Dropping something into "due" means do it now, so it takes today's date
  // rather than keeping whatever slipped date it had.
  return today;
}
