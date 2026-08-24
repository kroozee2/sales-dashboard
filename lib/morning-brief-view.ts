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
  if (/setter|outreach|reply|replies|inbox|revenue|lead|follow up/.test(normalized)) return "morning-setter";
  return "details";
}

function parseSections(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const raw of content.split("\n")) {
    const heading = raw.match(/^##\s+(.+)$/);
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
