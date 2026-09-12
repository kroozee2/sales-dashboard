import { parseJsonWithUniqueKeys } from "./agent-workforce";
import {
  PRESENTATIONS_SEED,
  PRESENTATIONS_SEED_ID,
  PRESENTATIONS_SEED_SLUG,
} from "./presentations-seed";

export { PRESENTATIONS_SEED_ID, PRESENTATIONS_SEED_SLUG };

export type PresentationSlide = {
  id: string;
  title: string;
  on_screen_copy: string;
  speaker_notes: string;
  visual_direction: string;
  exercise: string;
  optional: boolean;
};

export type DeployedPresentationSlide = Pick<PresentationSlide, "id" | "title" | "on_screen_copy" | "optional">;

export type DeployedPresentationSnapshot = {
  revision: number;
  deployed_at: string;
  title: string;
  subtitle: string;
  audience: string;
  slides: DeployedPresentationSlide[];
};

export type PresentationRecord = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  audience: string;
  status: "draft" | "deployed";
  revision: number;
  updated_at: string;
  slides: PresentationSlide[];
  facilitator_notes: string;
  deployed_snapshot: DeployedPresentationSnapshot | null;
};

export type PresentationsDocument = {
  version: 1;
  revision: string;
  updated_at: string;
  presentations: PresentationRecord[];
};

const SEED_REVISION = "2026-09-12T00:00:00.000Z";

export function createSeedPresentationsDocument(): PresentationsDocument {
  return structuredClone({
    version: 1,
    revision: SEED_REVISION,
    updated_at: SEED_REVISION,
    presentations: [PRESENTATIONS_SEED],
  }) as unknown as PresentationsDocument;
}


export function seedPresentationsDocument(document: PresentationsDocument): PresentationsDocument {
  const copy = structuredClone(document);
  const hasSeedIdentity = copy.presentations.some((presentation) =>
    presentation.id === PRESENTATIONS_SEED_ID || presentation.slug === PRESENTATIONS_SEED_SLUG
  );
  if (!hasSeedIdentity) copy.presentations.push(structuredClone(PRESENTATIONS_SEED) as unknown as PresentationRecord);
  return copy;
}


export function slugifyPresentationId(title: string): string {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-+$/g, "");
  return slug || "presentation";
}

export function uniquePresentationSlug(base: string, usedSlugs: Iterable<string>): string {
  const used = new Set(usedSlugs);
  const canonical = slugifyPresentationId(base);
  if (!used.has(canonical)) return canonical;
  for (let suffix = 2; suffix <= 10_000; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = `${canonical.slice(0, 80 - ending.length).replace(/-+$/g, "")}${ending}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("Could not allocate a unique presentation slug");
}


const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RECORD_KEYS = ["id", "slug", "title", "subtitle", "audience", "status", "revision", "updated_at", "slides", "facilitator_notes", "deployed_snapshot"] as const;
const SLIDE_KEYS = ["id", "title", "on_screen_copy", "speaker_notes", "visual_direction", "exercise", "optional"] as const;
const SNAPSHOT_KEYS = ["revision", "deployed_at", "title", "subtitle", "audience", "slides"] as const;
const PUBLIC_SLIDE_KEYS = ["id", "title", "on_screen_copy", "optional"] as const;

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], field: string) {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Unknown field: ${field}.${unknown}`);
  const missing = keys.find((key) => !(key in value));
  if (missing) throw new Error(`${field}.${missing} is required`);
}
function text(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)) throw new Error(`${field} contains invalid control characters`);
  if (value.length > max) throw new Error(`${field} exceeds ${max} characters`);
  if (required && !value.trim()) throw new Error(`${field} is required`);
  return value;
}
function id(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 80 || !ID_RE.test(value)) throw new Error(`${field} is invalid`);
  return value;
}
function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_RE.test(value) || new Date(value).toISOString() !== value) throw new Error(`${field} is invalid`);
  return value;
}
function integer(value: unknown, field: string, min: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) throw new Error(`${field} must be an integer`);
  return value as number;
}
function parseSlide(value: unknown, field: string, publicOnly = false): PresentationSlide | DeployedPresentationSlide {
  const row = objectValue(value, field);
  exactKeys(row, publicOnly ? PUBLIC_SLIDE_KEYS : SLIDE_KEYS, field);
  const audienceFields: DeployedPresentationSlide = {
    id: id(row.id, `${field}.id`),
    title: text(row.title, `${field}.title`, 200, true),
    on_screen_copy: text(row.on_screen_copy, `${field}.on_screen_copy`, 8_000),
    optional: (() => { if (typeof row.optional !== "boolean") throw new Error(`${field}.optional must be a boolean`); return row.optional; })(),
  };
  return publicOnly ? audienceFields : {
    ...audienceFields,
    speaker_notes: text(row.speaker_notes, `${field}.speaker_notes`, 12_000),
    visual_direction: text(row.visual_direction, `${field}.visual_direction`, 4_000),
    exercise: text(row.exercise, `${field}.exercise`, 6_000),
  };
}
function parseSlides(value: unknown, field: string, publicOnly = false) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) throw new Error(`${field} must contain 1 to 200 slides`);
  const slides = value.map((slide, index) => parseSlide(slide, `${field}[${index}]`, publicOnly));
  if (new Set(slides.map((slide) => slide.id)).size !== slides.length) throw new Error(`${field} contains duplicate slide IDs`);
  return slides;
}
function parseSnapshot(value: unknown, field: string): DeployedPresentationSnapshot | null {
  if (value === null) return null;
  const row = objectValue(value, field);
  exactKeys(row, SNAPSHOT_KEYS, field);
  return {
    revision: integer(row.revision, `${field}.revision`, 1),
    deployed_at: timestamp(row.deployed_at, `${field}.deployed_at`),
    title: text(row.title, `${field}.title`, 200, true),
    subtitle: text(row.subtitle, `${field}.subtitle`, 500),
    audience: text(row.audience, `${field}.audience`, 1_000),
    slides: parseSlides(row.slides, `${field}.slides`, true) as DeployedPresentationSlide[],
  };
}
function parseRecord(value: unknown, field: string): PresentationRecord {
  const row = objectValue(value, field);
  exactKeys(row, RECORD_KEYS, field);
  const status = row.status;
  if (status !== "draft" && status !== "deployed") throw new Error(`${field}.status is invalid`);
  const deployedSnapshot = parseSnapshot(row.deployed_snapshot, `${field}.deployed_snapshot`);
  if (status === "deployed" && !deployedSnapshot) throw new Error(`${field}.deployed_snapshot is required when deployed`);
  return {
    id: id(row.id, `${field}.id`), slug: id(row.slug, `${field}.slug`),
    title: text(row.title, `${field}.title`, 200, true), subtitle: text(row.subtitle, `${field}.subtitle`, 500),
    audience: text(row.audience, `${field}.audience`, 1_000), status,
    revision: integer(row.revision, `${field}.revision`, 1), updated_at: timestamp(row.updated_at, `${field}.updated_at`),
    slides: parseSlides(row.slides, `${field}.slides`) as PresentationSlide[],
    facilitator_notes: text(row.facilitator_notes, `${field}.facilitator_notes`, 30_000),
    deployed_snapshot: deployedSnapshot,
  };
}

export function parsePresentationsDocument(raw: string): PresentationsDocument {
  const value = objectValue(parseJsonWithUniqueKeys(raw), "document");
  exactKeys(value, ["version", "revision", "updated_at", "presentations"], "document");
  if (value.version !== 1) throw new Error("document.version is invalid");
  if (!Array.isArray(value.presentations) || value.presentations.length > 50) throw new Error("document.presentations exceeds 50 items");
  const presentations = value.presentations.map((row, index) => parseRecord(row, `presentations[${index}]`));
  if (new Set(presentations.map((row) => row.id)).size !== presentations.length) throw new Error("document contains duplicate presentation IDs");
  if (new Set(presentations.map((row) => row.slug)).size !== presentations.length) throw new Error("document contains duplicate presentation slugs");
  return { version: 1, revision: timestamp(value.revision, "document.revision"), updated_at: timestamp(value.updated_at, "document.updated_at"), presentations };
}


type PresentationDraftInput = Pick<PresentationRecord, "id" | "slug" | "title" | "subtitle" | "audience" | "slides" | "facilitator_notes">;
export type PresentationsMutationInput = {
  action: "save" | "deploy";
  expected_document_revision: string;
  expected_row_updated_at: string | null;
  presentation: PresentationDraftInput;
};

function parseDraft(value: unknown, field: string): PresentationDraftInput {
  const row = objectValue(value, field);
  exactKeys(row, ["id", "slug", "title", "subtitle", "audience", "slides", "facilitator_notes"], field);
  return {
    id: id(row.id, `${field}.id`), slug: id(row.slug, `${field}.slug`),
    title: text(row.title, `${field}.title`, 200, true), subtitle: text(row.subtitle, `${field}.subtitle`, 500),
    audience: text(row.audience, `${field}.audience`, 1_000),
    slides: parseSlides(row.slides, `${field}.slides`) as PresentationSlide[],
    facilitator_notes: text(row.facilitator_notes, `${field}.facilitator_notes`, 30_000),
  };
}

export function parsePresentationsMutation(value: unknown): PresentationsMutationInput {
  const row = objectValue(value, "request");
  exactKeys(row, ["action", "expected_document_revision", "expected_row_updated_at", "presentation"], "request");
  if (row.action !== "save" && row.action !== "deploy") throw new Error("request.action is invalid");
  const expectedRow = row.expected_row_updated_at;
  if (expectedRow !== null && (typeof expectedRow !== "string" || expectedRow.length > 64 || /\p{Cc}/u.test(expectedRow) || !Number.isFinite(Date.parse(expectedRow)))) throw new Error("request.expected_row_updated_at is invalid");
  return {
    action: row.action,
    expected_document_revision: timestamp(row.expected_document_revision, "request.expected_document_revision"),
    expected_row_updated_at: expectedRow as string | null,
    presentation: parseDraft(row.presentation, "request.presentation"),
  };
}

function nextTimestamp(now: string, ...tokens: Array<string | null>): string {
  const values = [Date.parse(now), ...tokens.filter((token): token is string => Boolean(token)).map((token) => Date.parse(token))];
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Revision timestamp is invalid");
  return new Date(Math.max(...values) + 1).toISOString();
}

export function updatePresentationsDocument(current: PresentationsDocument, rawInput: unknown, now: string, rowUpdatedAt: string | null): PresentationsDocument {
  const input = parsePresentationsMutation(rawInput);
  if (input.expected_document_revision !== current.revision || input.expected_row_updated_at !== rowUpdatedAt) throw new Error("Stale presentations revision");
  const index = current.presentations.findIndex((item) => item.id === input.presentation.id);
  const slugOwner = current.presentations.find((item) => item.slug === input.presentation.slug);
  if (slugOwner && slugOwner.id !== input.presentation.id) throw new Error("Presentation slug is already in use");
  const revision = nextTimestamp(now, current.revision, rowUpdatedAt);
  const next = structuredClone(current);
  const existing = index >= 0 ? current.presentations[index] : null;
  const recordRevision = (existing?.revision ?? 0) + 1;
  const publicSlides = input.presentation.slides.map(({ id: slideId, title, on_screen_copy, optional }) => ({ id: slideId, title, on_screen_copy, optional }));
  const deployedSnapshot: DeployedPresentationSnapshot | null = input.action === "deploy"
    ? { revision: recordRevision, deployed_at: revision, title: input.presentation.title, subtitle: input.presentation.subtitle, audience: input.presentation.audience, slides: publicSlides }
    : existing?.deployed_snapshot ?? null;
  const record: PresentationRecord = {
    ...input.presentation,
    status: input.action === "deploy" ? "deployed" : "draft",
    revision: recordRevision,
    updated_at: revision,
    deployed_snapshot: deployedSnapshot,
  };
  if (index < 0) next.presentations.push(record);
  else next.presentations[index] = record;
  next.revision = revision;
  next.updated_at = revision;
  return parsePresentationsDocument(JSON.stringify(next));
}

export const PRESENTATIONS_MAX_BODY_BYTES = 2_000_000;

export async function readBoundedPresentationsBody(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > PRESENTATIONS_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("Presentations document is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function getDeployedPresentation(document: PresentationsDocument, slug: string): DeployedPresentationSnapshot | null {
  const record = document.presentations.find((presentation) => presentation.slug === slug);
  return record?.deployed_snapshot ? structuredClone(record.deployed_snapshot) : null;
}
