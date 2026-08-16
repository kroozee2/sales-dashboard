export type ContentScheduleGroup = "overdue" | "today" | "upcoming" | "unscheduled";

export interface SpreadsheetContentItem {
  id: string;
  title: string;
  category: string;
  status: string;
  scheduled_date: string | null;
  created_at: string;
}

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
