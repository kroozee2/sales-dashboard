export type MessagingSection = {
  id: string;
  title: string;
  content: string;
};

export type MessagingDocument = {
  version: 1;
  title: string;
  subtitle: string;
  sections: MessagingSection[];
  revision: string;
  updated_at: string;
};

export type MessagingInput = {
  title: string;
  subtitle: string;
  sections: MessagingSection[];
};

export type MessagingUpdateInput = MessagingInput & {
  expected_revision: string;
};

const MAX_SECTIONS = 20;
const MAX_SECTION_CONTENT = 30_000;
const MAX_DOCUMENT_BYTES = 160_000;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function readBoundedRequestBody(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      void reader.cancel("Request body is too large").catch(() => undefined);
      throw new Error("Request body is too large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, allowed: string[], context: string) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) throw new Error(`Unknown field: ${context}.${unknown}`);
}

function boundedString(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${field} is required`);
  if (value.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return value;
}

function validateSection(value: unknown, index: number): MessagingSection {
  if (!isRecord(value)) throw new Error(`sections[${index}] must be an object`);
  assertExactKeys(value, ["id", "title", "content"], `sections[${index}]`);
  const id = boundedString(value.id, `sections[${index}].id`, 80);
  if (!ID_PATTERN.test(id)) throw new Error(`sections[${index}].id must be a lowercase slug`);
  return {
    id,
    title: boundedString(value.title, `sections[${index}].title`, 120),
    content: boundedString(value.content, `sections[${index}].content`, MAX_SECTION_CONTENT, true),
  };
}

function validateInput(value: unknown, includeExpectedRevision: boolean): MessagingInput & { expected_revision?: string } {
  if (!isRecord(value)) throw new Error("Messaging document must be an object");
  const allowed = includeExpectedRevision
    ? ["title", "subtitle", "sections", "expected_revision"]
    : ["title", "subtitle", "sections"];
  assertExactKeys(value, allowed, "messaging");

  if (!Array.isArray(value.sections)) throw new Error("sections must be an array");
  if (value.sections.length === 0 || value.sections.length > MAX_SECTIONS) {
    throw new Error(`sections must contain 1 to ${MAX_SECTIONS} items`);
  }
  const sections = value.sections.map(validateSection);
  const ids = new Set<string>();
  for (const section of sections) {
    if (ids.has(section.id)) throw new Error(`Duplicate section id: ${section.id}`);
    ids.add(section.id);
  }

  const result: MessagingInput & { expected_revision?: string } = {
    title: boundedString(value.title, "title", 160),
    subtitle: boundedString(value.subtitle, "subtitle", 240, true),
    sections,
  };
  if (includeExpectedRevision) {
    result.expected_revision = boundedString(value.expected_revision, "expected_revision", 64);
  }
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_DOCUMENT_BYTES) {
    throw new Error(`Messaging document exceeds ${MAX_DOCUMENT_BYTES} bytes`);
  }
  return result;
}

function nextRevision(current: string, requestedNow: string, databaseRevision: string): string {
  const currentMs = Date.parse(current);
  const requestedMs = Date.parse(requestedNow);
  const databaseMs = Date.parse(databaseRevision);
  if (!Number.isFinite(currentMs) || !Number.isFinite(requestedMs) || !Number.isFinite(databaseMs)) {
    throw new Error("Invalid revision timestamp");
  }
  return new Date(Math.max(requestedMs, currentMs + 1, databaseMs + 1)).toISOString();
}

export function createMessagingDocument(input: unknown, now = new Date().toISOString()): MessagingDocument {
  const valid = validateInput(input, false);
  return {
    version: 1,
    title: valid.title,
    subtitle: valid.subtitle,
    sections: valid.sections,
    revision: now,
    updated_at: now,
  };
}

export function parseMessagingDocument(raw: string): MessagingDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Stored messaging document is invalid JSON");
  }
  if (!isRecord(parsed)) throw new Error("Stored messaging document must be an object");
  assertExactKeys(parsed, ["version", "title", "subtitle", "sections", "revision", "updated_at"], "stored messaging");
  if (parsed.version !== 1) throw new Error("Unsupported messaging document version");
  const valid = validateInput({ title: parsed.title, subtitle: parsed.subtitle, sections: parsed.sections }, false);
  const revision = boundedString(parsed.revision, "revision", 64);
  const updatedAt = boundedString(parsed.updated_at, "updated_at", 64);
  if (!Number.isFinite(Date.parse(revision)) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("Stored messaging revision is invalid");
  }
  return { version: 1, ...valid, revision, updated_at: updatedAt };
}

export function updateMessagingDocument(
  current: MessagingDocument,
  input: unknown,
  now = new Date().toISOString(),
  databaseRevision = current.revision,
): MessagingDocument {
  const valid = validateInput(input, true);
  if (valid.expected_revision !== current.revision) throw new Error("Stale messaging revision");
  const revision = nextRevision(current.revision, now, databaseRevision);
  return {
    version: 1,
    title: valid.title,
    subtitle: valid.subtitle,
    sections: valid.sections,
    revision,
    updated_at: revision,
  };
}
