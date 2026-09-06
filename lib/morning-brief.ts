export const MORNING_BRIEFS_KEY = "morning_briefs_v1";
export const MAX_BRIEFS = 31;
export const MAX_CHECKLIST_ITEMS = 40;
export const MAX_CONTENT_LENGTH = 30_000;

export type BriefChecklistItem = {
  id: string;
  title: string;
  section: string;
  task_id: string | null;
  done: boolean;
  completed_at: string | null;
};

export type MorningBrief = {
  id: string;
  date: string;
  title: string;
  summary: string;
  content: string;
  checklist: BriefChecklistItem[];
  source: "hermes-cron" | "manual";
  created_at: string;
  updated_at: string;
  revision: string;
};

export type MorningBriefDocument = { version: 1; briefs: MorningBrief[] };

const INPUT_KEYS = new Set(["date", "title", "summary", "content", "checklist", "source"]);
const BRIEF_KEYS = new Set(["id", "date", "title", "summary", "content", "checklist", "source", "created_at", "updated_at", "revision"]);
const ITEM_KEYS = new Set(["id", "title", "section", "task_id", "done", "completed_at"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} contains unknown field: ${unknown[0]}`);
}

function boundedString(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${label} is required`);
  if (trimmed.length > max) throw new Error(`${label} is too long`);
  return trimmed;
}

function iso(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  const text = boundedString(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function dateOnly(value: unknown): string {
  const text = boundedString(value, "date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T12:00:00Z`))) throw new Error("date must be YYYY-MM-DD");
  return text;
}

function optionalUuid(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const text = boundedString(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(`${label} must be a UUID`);
  }
  return text;
}

function normalizedTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function createBriefFromInput(
  raw: unknown,
  now = new Date().toISOString(),
  idFactory: () => string = () => globalThis.crypto.randomUUID(),
): MorningBrief {
  const input = object(raw, "brief");
  exactKeys(input, INPUT_KEYS, "brief");
  const checklistRaw = input.checklist;
  if (!Array.isArray(checklistRaw)) throw new Error("checklist must be an array");
  if (checklistRaw.length > MAX_CHECKLIST_ITEMS) throw new Error(`checklist cannot exceed ${MAX_CHECKLIST_ITEMS} items`);
  const seen = new Set<string>();
  const checklist = checklistRaw.map((entry, index) => {
    const item = object(entry, `checklist[${index}]`);
    exactKeys(item, new Set(["title", "section"]), `checklist[${index}]`);
    const title = boundedString(item.title, `checklist[${index}].title`, 300);
    const normalized = normalizedTitle(title);
    if (seen.has(normalized)) throw new Error("checklist contains duplicate titles");
    seen.add(normalized);
    return {
      id: idFactory(),
      title,
      section: boundedString(item.section ?? "Action Items", `checklist[${index}].section`, 80),
      task_id: null,
      done: false,
      completed_at: null,
    };
  });
  const source = input.source ?? "hermes-cron";
  if (source !== "hermes-cron" && source !== "manual") throw new Error("source is invalid");
  const date = dateOnly(input.date);
  return {
    id: date,
    date,
    title: boundedString(input.title, "title", 160),
    summary: boundedString(input.summary, "summary", 1_000),
    content: boundedString(input.content, "content", MAX_CONTENT_LENGTH),
    checklist,
    source,
    created_at: now,
    updated_at: now,
    revision: idFactory(),
  };
}

function parseChecklistItem(raw: unknown, index: number): BriefChecklistItem {
  const item = object(raw, `checklist[${index}]`);
  exactKeys(item, ITEM_KEYS, `checklist[${index}]`);
  if (typeof item.done !== "boolean") throw new Error(`checklist[${index}].done must be boolean`);
  return {
    id: boundedString(item.id, `checklist[${index}].id`, 100),
    title: boundedString(item.title, `checklist[${index}].title`, 300),
    section: boundedString(item.section, `checklist[${index}].section`, 80),
    task_id: optionalUuid(item.task_id, `checklist[${index}].task_id`),
    done: item.done,
    completed_at: iso(item.completed_at, `checklist[${index}].completed_at`, true),
  };
}

function parseBrief(raw: unknown): MorningBrief {
  const brief = object(raw, "brief");
  exactKeys(brief, BRIEF_KEYS, "brief");
  if (!Array.isArray(brief.checklist) || brief.checklist.length > MAX_CHECKLIST_ITEMS) throw new Error("brief checklist is invalid");
  const source = brief.source;
  if (source !== "hermes-cron" && source !== "manual") throw new Error("brief source is invalid");
  const date = dateOnly(brief.date);
  const id = boundedString(brief.id, "brief.id", 40);
  if (id !== date) throw new Error("brief id must match its date");
  return {
    id,
    date,
    title: boundedString(brief.title, "brief.title", 160),
    summary: boundedString(brief.summary, "brief.summary", 1_000),
    content: boundedString(brief.content, "brief.content", MAX_CONTENT_LENGTH),
    checklist: brief.checklist.map(parseChecklistItem),
    source,
    created_at: iso(brief.created_at, "brief.created_at")!,
    updated_at: iso(brief.updated_at, "brief.updated_at")!,
    revision: boundedString(brief.revision, "brief.revision", 100),
  };
}

export function parseBriefDocument(value: string | null | undefined): MorningBriefDocument {
  if (!value) return { version: 1, briefs: [] };
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { throw new Error("stored morning briefs are not valid JSON"); }
  const doc = object(raw, "document");
  exactKeys(doc, new Set(["version", "briefs"]), "document");
  if (doc.version !== 1 || !Array.isArray(doc.briefs) || doc.briefs.length > MAX_BRIEFS) throw new Error("stored morning brief document is invalid");
  const briefs = doc.briefs.map(parseBrief);
  if (new Set(briefs.map((brief) => brief.id)).size !== briefs.length) throw new Error("stored morning briefs contain duplicate dates");
  return { version: 1, briefs: briefs.sort((a, b) => b.date.localeCompare(a.date)) };
}

export function mergeBrief(previous: MorningBrief | undefined, incoming: MorningBrief): MorningBrief {
  if (!previous) return incoming;
  const completed = new Map(previous.checklist.map((item) => [normalizedTitle(item.title), item]));
  return {
    ...incoming,
    created_at: previous.created_at,
    checklist: incoming.checklist.map((item) => {
      const prior = completed.get(normalizedTitle(item.title));
      return prior ? {
        ...item,
        id: prior.id,
        task_id: prior.task_id,
        done: prior.done,
        completed_at: prior.completed_at,
      } : item;
    }),
  };
}

export function upsertBrief(document: MorningBriefDocument, incoming: MorningBrief): MorningBriefDocument {
  const previous = document.briefs.find((brief) => brief.id === incoming.id);
  const merged = mergeBrief(previous, incoming);
  return {
    version: 1,
    briefs: [merged, ...document.briefs.filter((brief) => brief.id !== incoming.id)]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_BRIEFS),
  };
}

export function toggleChecklistItem(
  brief: MorningBrief,
  itemId: string,
  done: boolean,
  expectedRevision: string,
  now = new Date().toISOString(),
  idFactory: () => string = () => globalThis.crypto.randomUUID(),
): MorningBrief {
  if (brief.revision !== expectedRevision) throw new Error("stale brief revision");
  if (!brief.checklist.some((item) => item.id === itemId)) throw new Error("checklist item not found");
  return {
    ...brief,
    checklist: brief.checklist.map((item) => item.id === itemId ? { ...item, done, completed_at: done ? now : null } : item),
    updated_at: now,
    revision: idFactory(),
  };
}

export function linkChecklistTask(
  brief: MorningBrief,
  itemId: string,
  taskId: string,
  expectedRevision: string,
  now = new Date().toISOString(),
  idFactory: () => string = () => globalThis.crypto.randomUUID(),
): MorningBrief {
  if (brief.revision !== expectedRevision) throw new Error("stale brief revision");
  if (!brief.checklist.some((item) => item.id === itemId)) throw new Error("checklist item not found");
  const validatedTaskId = optionalUuid(taskId, "task_id");
  return {
    ...brief,
    checklist: brief.checklist.map((item) => item.id === itemId ? { ...item, task_id: validatedTaskId } : item),
    updated_at: now,
    revision: idFactory(),
  };
}
