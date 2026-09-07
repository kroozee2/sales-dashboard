export const AGENT_TYPES = ["core", "subagent"] as const;
export const AGENT_STATUSES = ["planned", "designed", "building", "testing", "live", "paused"] as const;
export const AGENT_AUTONOMY = ["draft_only", "internal", "approval_gated"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentAutonomy = (typeof AGENT_AUTONOMY)[number];

export type AgentDefinition = {
  id: string;
  type: AgentType;
  parent_id: string | null;
  name: string;
  emoji: string;
  role: string;
  department: string;
  mission: string;
  personality: string;
  status: AgentStatus;
  progress: number;
  autonomy: AgentAutonomy;
  cadence: string;
  schedule: string;
  capabilities: string[];
  inputs: string[];
  outputs: string[];
  next_milestone: string;
};

export type AgentWorkforceDocument = {
  version: 1;
  agents: AgentDefinition[];
  revision: string;
  updated_at: string;
};

export type AgentWorkforceInput = { agents: AgentDefinition[] };
export type AgentWorkforceUpdateInput = AgentWorkforceInput & { expected_revision: string };

export const AGENT_WORKFORCE_MAX_BODY_BYTES = 180_000;
const MAX_AGENTS = 60;
const MAX_LIST_ITEMS = 20;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AGENT_KEYS = [
  "id", "type", "parent_id", "name", "emoji", "role", "department", "mission", "personality",
  "status", "progress", "autonomy", "cadence", "schedule", "capabilities", "inputs", "outputs", "next_milestone",
] as const;

export function parseJsonWithUniqueKeys(raw: string): unknown {
  const containers: Array<{ type: "object" | "array"; keys: Set<string> }> = [];
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '"') {
      const start = index;
      index += 1;
      while (index < raw.length) {
        if (raw[index] === "\\") { index += 2; continue; }
        if (raw[index] === '"') break;
        index += 1;
      }
      if (index >= raw.length) return JSON.parse(raw) as unknown;
      const container = containers.at(-1);
      if (container?.type === "object") {
        let cursor = index + 1;
        while (/\s/u.test(raw[cursor] ?? "")) cursor += 1;
        if (raw[cursor] === ":") {
          const key = JSON.parse(raw.slice(start, index + 1)) as string;
          if (container.keys.has(key)) throw new Error("Duplicate JSON field");
          container.keys.add(key);
        }
      }
      continue;
    }
    if (character === "{") containers.push({ type: "object", keys: new Set() });
    else if (character === "[") containers.push({ type: "array", keys: new Set() });
    else if (character === "}" || character === "]") containers.pop();
  }
  return JSON.parse(raw) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], context: string) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) throw new Error(`Unknown field: ${context}.${unknown}`);
}

function boundedString(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (/\p{Cc}/u.test(value)) throw new Error(`${field} contains invalid control characters`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${field} is required`);
  if (value.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return trimmed;
}

function canonicalString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (!value || value.length > max) throw new Error(`${field} is invalid`);
  if (value !== value.trim() || /\p{Cc}/u.test(value)) throw new Error(`${field} must use its exact canonical value`);
  return value;
}

function boundedIcon(value: unknown, field: string): string {
  const icon = boundedString(value, field, 12);
  if (Array.from(icon).length > 4 || /[\p{L}\p{N}]/u.test(icon)) throw new Error(`${field} must be a short emoji or symbol`);
  return icon;
}

function boundedStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  if (value.length > MAX_LIST_ITEMS) throw new Error(`${field} exceeds ${MAX_LIST_ITEMS} items`);
  const items = value.map((item, index) => boundedString(item, `${field}[${index}]`, 160));
  if (new Set(items.map((item) => item.toLowerCase())).size !== items.length) {
    throw new Error(`${field} contains duplicate items`);
  }
  return items;
}

function isOneOf<T extends readonly string[]>(value: unknown, choices: T): value is T[number] {
  return typeof value === "string" && (choices as readonly string[]).includes(value);
}

function validateAgent(value: unknown, index: number): AgentDefinition {
  if (!isRecord(value)) throw new Error(`agents[${index}] must be an object`);
  assertExactKeys(value, AGENT_KEYS, `agents[${index}]`);
  const id = canonicalString(value.id, `agents[${index}].id`, 80);
  if (!ID_PATTERN.test(id)) throw new Error(`agents[${index}].id must be a lowercase slug`);
  if (!isOneOf(value.type, AGENT_TYPES)) throw new Error(`agents[${index}].type is invalid`);
  if (!isOneOf(value.status, AGENT_STATUSES)) throw new Error(`agents[${index}].status is invalid`);
  if (!isOneOf(value.autonomy, AGENT_AUTONOMY)) throw new Error(`agents[${index}].autonomy is invalid`);
  if (!Number.isInteger(value.progress) || Number(value.progress) < 0 || Number(value.progress) > 100) {
    throw new Error(`agents[${index}].progress must be an integer from 0 to 100`);
  }
  const parentId = value.parent_id === null ? null : canonicalString(value.parent_id, `agents[${index}].parent_id`, 80);
  if (parentId !== null && !ID_PATTERN.test(parentId)) throw new Error(`agents[${index}].parent_id must be a lowercase slug`);
  if (value.type === "core" && parentId !== null) throw new Error(`Core agent ${id} cannot have a parent`);
  if (value.type === "subagent" && parentId === null) throw new Error(`Sub-agent ${id} requires a parent`);

  return {
    id,
    type: value.type,
    parent_id: parentId,
    name: boundedString(value.name, `agents[${index}].name`, 80),
    emoji: boundedIcon(value.emoji, `agents[${index}].emoji`),
    role: boundedString(value.role, `agents[${index}].role`, 120),
    department: boundedString(value.department, `agents[${index}].department`, 100),
    mission: boundedString(value.mission, `agents[${index}].mission`, 1_200),
    personality: boundedString(value.personality, `agents[${index}].personality`, 600),
    status: value.status,
    progress: Number(value.progress),
    autonomy: value.autonomy,
    cadence: boundedString(value.cadence, `agents[${index}].cadence`, 200, true),
    schedule: boundedString(value.schedule, `agents[${index}].schedule`, 200, true),
    capabilities: boundedStringList(value.capabilities, `agents[${index}].capabilities`),
    inputs: boundedStringList(value.inputs, `agents[${index}].inputs`),
    outputs: boundedStringList(value.outputs, `agents[${index}].outputs`),
    next_milestone: boundedString(value.next_milestone, `agents[${index}].next_milestone`, 300, true),
  };
}

function validateInput(value: unknown, includeRevision: boolean): AgentWorkforceInput & { expected_revision?: string } {
  if (!isRecord(value)) throw new Error("Agent workforce must be an object");
  assertExactKeys(value, includeRevision ? ["agents", "expected_revision"] : ["agents"], "workforce");
  if (!Array.isArray(value.agents)) throw new Error("agents must be an array");
  if (value.agents.length > MAX_AGENTS) throw new Error(`agents exceeds ${MAX_AGENTS} items`);
  const agents = value.agents.map(validateAgent);
  const ids = new Set<string>();
  for (const agent of agents) {
    if (ids.has(agent.id)) throw new Error(`Duplicate agent id: ${agent.id}`);
    ids.add(agent.id);
  }
  const coreIds = new Set(agents.filter((agent) => agent.type === "core").map((agent) => agent.id));
  for (const agent of agents) {
    if (agent.type === "subagent" && !coreIds.has(agent.parent_id ?? "")) {
      throw new Error(`Sub-agent ${agent.id} references an unknown core parent`);
    }
  }
  const result: AgentWorkforceInput & { expected_revision?: string } = { agents };
  if (includeRevision) result.expected_revision = canonicalString(value.expected_revision, "expected_revision", 64);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > AGENT_WORKFORCE_MAX_BODY_BYTES) {
    throw new Error(`Agent workforce exceeds ${AGENT_WORKFORCE_MAX_BODY_BYTES} bytes`);
  }
  return result;
}

function canonicalTimestamp(value: unknown, field: string): string {
  const timestamp = canonicalString(value, field, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(timestamp)) throw new Error(`${field} must be a canonical UTC ISO timestamp`);
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== timestamp) throw new Error(`${field} must be a canonical UTC ISO timestamp`);
  return timestamp;
}

function nextRevision(current: string, requestedNow: string, databaseRevision: string): string {
  const times = [Date.parse(current), Date.parse(requestedNow), Date.parse(databaseRevision)];
  if (times.some((value) => !Number.isFinite(value))) throw new Error("Invalid revision timestamp");
  return new Date(Math.max(times[1], times[0] + 1, times[2] + 1)).toISOString();
}

export function createAgentWorkforceDocument(input: unknown, now = new Date().toISOString()): AgentWorkforceDocument {
  const valid = validateInput(input, false);
  return { version: 1, agents: valid.agents, revision: now, updated_at: now };
}

export function parseAgentWorkforceDocument(raw: string): AgentWorkforceDocument {
  let parsed: unknown;
  try { parsed = parseJsonWithUniqueKeys(raw); } catch { throw new Error("Stored agent workforce is invalid JSON"); }
  if (!isRecord(parsed)) throw new Error("Stored agent workforce must be an object");
  assertExactKeys(parsed, ["version", "agents", "revision", "updated_at"], "stored workforce");
  if (parsed.version !== 1) throw new Error("Unsupported agent workforce version");
  const valid = validateInput({ agents: parsed.agents }, false);
  const revision = canonicalTimestamp(parsed.revision, "revision");
  const updatedAt = canonicalTimestamp(parsed.updated_at, "updated_at");
  if (!Number.isFinite(Date.parse(revision)) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("Stored agent workforce revision is invalid");
  }
  return { version: 1, agents: valid.agents, revision, updated_at: updatedAt };
}

export function updateAgentWorkforceDocument(
  current: AgentWorkforceDocument,
  input: unknown,
  now = new Date().toISOString(),
  databaseRevision = current.revision,
): AgentWorkforceDocument {
  const valid = validateInput(input, true);
  if (valid.expected_revision !== current.revision) throw new Error("Stale agent workforce revision");
  const nextIds = new Set(valid.agents.map((agent) => agent.id));
  const removed = current.agents.find((agent) => !nextIds.has(agent.id));
  if (removed) throw new Error(`Agent deletion is not supported: ${removed.id}`);
  const revision = nextRevision(current.revision, now, databaseRevision);
  return { version: 1, agents: valid.agents, revision, updated_at: revision };
}

export async function readBoundedAgentWorkforceBody(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > AGENT_WORKFORCE_MAX_BODY_BYTES) {
      void reader.cancel("Request body is too large").catch(() => undefined);
      throw new Error("Agent workforce is too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { throw new Error("Request body must be valid UTF-8"); }
}

export function slugifyAgentId(name: string, role: string): string {
  const value = `${name}-${role}`.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-+$/g, "");
  return value || `agent-${Date.now()}`;
}

export function uniqueAgentId(base: string, usedIds: Iterable<string>): string {
  const used = new Set(usedIds);
  let id = base.slice(0, 80) || "agent";
  let suffix = 2;
  while (used.has(id)) {
    const ending = `-${suffix++}`;
    id = `${base.slice(0, 80 - ending.length)}${ending}`;
  }
  return id;
}

export function shouldCloseAgentEditor(saving: boolean, isDirty: boolean, discardConfirmed: boolean): boolean {
  if (saving) return false;
  return !isDirty || discardConfirmed;
}

export function isAgentEditorDirty(initialForm: string, currentForm: string, restoredDraft: boolean): boolean {
  return restoredDraft || currentForm !== initialForm;
}
