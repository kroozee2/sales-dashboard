export type MorningBriefWorkspaceSection = {
  id: "morning-setter" | "calls-today" | "sales" | "clients" | "priorities" | "details";
  content: string;
};

type WorkspaceSectionId = MorningBriefWorkspaceSection["id"];

type ParsedSection = {
  heading: string;
  body: string[];
};

const GROUP_ORDER: WorkspaceSectionId[] = ["morning-setter", "calls-today", "sales", "clients", "priorities", "details"];

function normalizeHeading(heading: string) {
  return heading.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function groupForHeading(heading: string): WorkspaceSectionId {
  const normalized = normalizeHeading(heading);
  if (/schedule|calendar|calls? today|today s calls|preparation/.test(normalized)) return "calls-today";
  if (/sales calls?|pipeline calls?/.test(normalized)) return "sales";
  if (/client|member success|member action/.test(normalized)) return "clients";
  if (/win|priority|priorities|must do/.test(normalized)) return "priorities";
  if (/personal|admin|coverage gap|decision/.test(normalized)) return "details";
  if (/setter|outreach|reach out|reaching out|reply|replies|inbox|revenue|lead|follow up/.test(normalized)) return "morning-setter";
  return "details";
}

function parseSections(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const raw of content.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = raw.trim().match(/^##\s+(.+)$/);
    if (heading) {
      current = { heading: heading[1].trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { heading: "Overview", body: [] };
      sections.push(current);
    }
    current.body.push(raw);
  }

  return sections.filter((section) => section.heading && (section.body.some((line) => line.trim()) || normalizeHeading(section.heading) !== "morning brief"));
}

export function findMentionedLeads<T extends { id: string; full_name: string }>(content: string, leads: T[]): T[] {
  const normalizedContent = content.normalize("NFKC");
  const groups = new Map<string, T[]>();
  for (const lead of leads) {
    const name = typeof lead.full_name === "string" ? lead.full_name.trim() : "";
    if (name.length < 5 || name.split(/\s+/).length < 2) continue;
    const identity = name.toLocaleLowerCase("en-US");
    groups.set(identity, [...(groups.get(identity) ?? []), lead]);
  }
  const matches: T[] = [];
  for (const candidates of groups.values()) {
    if (candidates.length !== 1) continue;
    const name = candidates[0].full_name.trim();
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(normalizedContent)) {
      matches.push(candidates[0]);
    }
  }
  return matches;
}

export function formatSalesCallDate(value: string): string {
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function organizeMorningBrief(content: string): MorningBriefWorkspaceSection[] {
  const grouped = new Map<WorkspaceSectionId, string[]>();

  for (const section of parseSections(content)) {
    if (/^morning brief(?:\b|,)/i.test(section.heading)) continue;
    const id = groupForHeading(section.heading);
    const block = [`### ${section.heading}`, ...section.body].join("\n").trim();
    if (!block) continue;
    grouped.set(id, [...(grouped.get(id) ?? []), block]);
  }

  return GROUP_ORDER.flatMap((id) => {
    const blocks = grouped.get(id);
    return blocks?.length ? [{ id, content: blocks.join("\n\n") }] : [];
  });
}
