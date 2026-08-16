export type ContentScheduleGroup = "overdue" | "today" | "upcoming" | "unscheduled";

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

export type ContentCadenceKey = "youtube" | "instagram" | "email" | "facebook";

export const CONTENT_CADENCE: { key: ContentCadenceKey; label: string; icon: string; weeklyTarget: number; helper: string; platforms: string[] }[] = [
  { key: "youtube", label: "YouTube", icon: "▶️", weeklyTarget: 1, helper: "1 video each week", platforms: ["youtube"] },
  { key: "instagram", label: "Instagram", icon: "📱", weeklyTarget: 7, helper: "1 Reel or carousel daily", platforms: ["instagram", "carousel"] },
  { key: "email", label: "Email", icon: "✉️", weeklyTarget: 3, helper: "3 emails each week", platforms: ["email"] },
  { key: "facebook", label: "Facebook", icon: "📘", weeklyTarget: 1, helper: "1 methodology post weekly", platforms: ["facebook"] },
];

export const CONTENT_FOCUS_AREAS = [
  { key: "event", label: "Upcoming events" },
  { key: "ai_claude", label: "AI + Claude updates" },
  { key: "offer_launch", label: "Offer launches + CTA" },
  { key: "methodology", label: "Core methodologies" },
] as const;

export const CONTENT_SCHEDULE_GROUPS: ContentScheduleGroup[] = [
  "overdue",
  "today",
  "upcoming",
  "unscheduled",
];

export function scheduleGroupOf(
  item: SpreadsheetContentItem,
  today: string,
): ContentScheduleGroup | null {
  if (item.status === "posted") return null;
  if (!item.scheduled_date) return "unscheduled";
  if (item.scheduled_date < today) return "overdue";
  if (item.scheduled_date === today) return "today";
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
    overdue: [],
    today: [],
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

export function contentCadenceProgress<T extends SpreadsheetContentItem>(items: T[], today: string) {
  const value = new Date(`${today}T12:00:00`);
  const day = value.getDay();
  const weekStart = datePlusDays(today, day === 0 ? -6 : 1 - day);
  const weekEnd = datePlusDays(weekStart, 6);

  return Object.fromEntries(CONTENT_CADENCE.map((cadence) => {
    const matching = items.filter((item) => {
      if (!item.scheduled_date || item.scheduled_date < weekStart || item.scheduled_date > weekEnd) return false;
      if (!(item.platforms ?? []).some((platform) => cadence.platforms.includes(platform))) return false;
      return cadence.key !== "facebook" || item.meta?.content_focus === "methodology";
    });
    const dates = [...new Set(matching.map((item) => item.scheduled_date as string))].sort();
    const count = cadence.key === "instagram" ? dates.length : matching.length;
    return [cadence.key, { count, target: cadence.weeklyTarget, dates, met: count >= cadence.weeklyTarget }];
  })) as Record<ContentCadenceKey, { count: number; target: number; dates: string[]; met: boolean }>;
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
  if (group === "overdue") return datePlusDays(today, -1);
  if (group === "upcoming") return datePlusDays(today, 1);
  return today;
}
