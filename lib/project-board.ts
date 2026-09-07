// The Projects board's ordering rules, kept pure so they can be reasoned about
// and tested without a browser.
//
// The board answers one question at the top: what needs me now? Overdue leads,
// then this week, then the months ahead. Finished work leaves the flow entirely
// so a pile of completed projects can never sit above live work.

export type BoardProject = {
  stage: string;
  priority: string;
  due_date: string | null;
};

export type BoardSection<T> = {
  key: string;
  label: string;
  emoji: string;
  tone: "rose" | "amber" | "zinc";
  items: T[];
};

export const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Most important first, then soonest due. */
export function sortByImportance<T extends BoardProject>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pr = (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1);
    if (pr !== 0) return pr;
    return String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999"));
  });
}

/** "2026-09" or a full date → "September 2026". */
export function monthLabel(s: string | null): string {
  if (!s) return "No date yet";
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** A local YYYY-MM-DD, `days` from now. */
export function isoDaysFromNow(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildBoard<T extends BoardProject>(projects: T[], today: string, in7: string) {
  const open = projects.filter((p) => p.stage !== "done");
  const done = projects.filter((p) => p.stage === "done");

  const overdue = open.filter((p) => p.due_date && p.due_date < today);
  const week = open.filter((p) => p.due_date && p.due_date >= today && p.due_date <= in7);
  const later = open.filter((p) => p.due_date && p.due_date > in7);
  const undated = open.filter((p) => !p.due_date);

  const sections: BoardSection<T>[] = [];
  if (overdue.length) sections.push({ key: "overdue", label: "Overdue", emoji: "⚠️", tone: "rose", items: sortByImportance(overdue) });
  if (week.length) sections.push({ key: "week", label: "This week", emoji: "🎯", tone: "amber", items: sortByImportance(week) });

  // Anything further out keeps its month block, so the runway stays readable.
  const months = new Map<string, T[]>();
  for (const p of later) {
    const k = p.due_date!.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(p);
  }
  for (const k of Array.from(months.keys()).sort()) {
    sections.push({ key: `m-${k}`, label: monthLabel(`${k}-01`), emoji: "📆", tone: "zinc", items: sortByImportance(months.get(k)!) });
  }
  if (undated.length) sections.push({ key: "undated", label: "No date yet", emoji: "💤", tone: "zinc", items: sortByImportance(undated) });

  return {
    sections,
    doneItems: [...done].sort((a, b) => String(b.due_date ?? "").localeCompare(String(a.due_date ?? ""))),
    counts: { overdue: overdue.length, week: week.length, open: open.length, done: done.length },
  };
}
