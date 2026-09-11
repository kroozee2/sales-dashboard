export const AGENT_TYPES = ["core", "subagent"] as const;
export const AGENT_STATUSES = ["planned", "designed", "building", "testing", "live", "paused"] as const;
export const AGENT_AUTONOMY = ["draft_only", "internal", "approval_gated"] as const;
export const SKILL_DEPLOYMENT_STATES = ["draft", "configured", "deployed", "paused", "retired"] as const;
export const SKILL_PROVENANCE = ["owner_configured", "starter_recommendation", "legacy_unverified"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentAutonomy = (typeof AGENT_AUTONOMY)[number];
export type SkillDeploymentState = (typeof SKILL_DEPLOYMENT_STATES)[number];
export type SkillProvenance = (typeof SKILL_PROVENANCE)[number];

export type SkillInput = {
  id: string;
  name: string;
  purpose: string;
  behavior: string;
  category: string;
  tags: string[];
  capabilities: string[];
  inputs: string[];
  outputs: string[];
  documentation: string;
  provenance: SkillProvenance;
  agent_ids: string[];
  deployment_state: SkillDeploymentState;
  source_url: string;
  quality_rating: number | null;
  review_count: number;
};

export type SkillUsage = {
  count: number;
  last_used_at: string;
  source: "hermes";
};

export type SkillDefinition = SkillInput & {
  usage: SkillUsage | null;
  created_at: string;
  updated_at: string;
};

// What an editor may send. Timestamps are deliberately absent: the server owns
// them, so a stale or hostile client cannot rewrite an agent's history.
export type AgentInput = {
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
  triggers: string[];
  responsibilities: string[];
  capabilities: string[];
  inputs: string[];
  outputs: string[];
  next_milestone: string;
  notes: string;
};

export type AgentDefinition = AgentInput & {
  created_at: string;
  updated_at: string;
};

export type AgentWorkforceDocument = {
  version: 2;
  agents: AgentDefinition[];
  skills: SkillDefinition[];
  revision: string;
  updated_at: string;
};

export type AgentWorkforceInput = { agents: AgentInput[]; skills: SkillInput[] };
export type AgentWorkforceUpdateInput = AgentWorkforceInput & { expected_revision: string };

export const AGENT_WORKFORCE_MAX_BODY_BYTES = 220_000;
const MAX_AGENTS = 60;
const MAX_SKILLS = 100;
const MAX_LIST_ITEMS = 20;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AGENT_INPUT_KEYS = [
  "id", "type", "parent_id", "name", "emoji", "role", "department", "mission", "personality",
  "status", "progress", "autonomy", "cadence", "schedule", "triggers", "responsibilities",
  "capabilities", "inputs", "outputs", "next_milestone", "notes",
] as const;
const AGENT_STORED_KEYS = [...AGENT_INPUT_KEYS, "created_at", "updated_at"] as const;
// Fields added after the first release. A document written by the previous
// schema is still valid data — fill these in rather than bricking the page.
const LEGACY_OPTIONAL_KEYS = ["triggers", "responsibilities", "notes"] as const;

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

// Notes are the one free-form field where line breaks carry meaning, so they
// allow newlines while still rejecting every other control character.
function multilineString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(value)) throw new Error(`${field} contains invalid control characters`);
  if (value.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return value.trim();
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

type ValidateMode = "input" | "stored";

const SKILL_INPUT_KEYS = ["id", "name", "purpose", "behavior", "category", "tags", "capabilities", "inputs", "outputs", "documentation", "provenance", "agent_ids", "deployment_state", "source_url", "quality_rating", "review_count"] as const;
const SKILL_STORED_KEYS = [...SKILL_INPUT_KEYS, "usage", "created_at", "updated_at"] as const;

function canonicalGithubSourceUrl(value: unknown, field: string): string {
  const sourceUrl = canonicalString(value, field, 500);
  if (sourceUrl.includes("\\")) throw new Error(`${field} must use canonical HTTPS GitHub`);

  let parsedUrl: URL;
  try { parsedUrl = new URL(sourceUrl); } catch { throw new Error(`${field} must be a valid URL`); }
  if (
    sourceUrl !== parsedUrl.href ||
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "github.com" ||
    parsedUrl.host !== "github.com" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.port ||
    parsedUrl.search ||
    parsedUrl.hash ||
    !sourceUrl.startsWith("https://github.com/") ||
    parsedUrl.pathname.includes("//")
  ) throw new Error(`${field} must use canonical HTTPS GitHub`);

  const encodedSegments = parsedUrl.pathname.slice(1).split("/");
  if (encodedSegments.length < 3 || encodedSegments.some((segment) => !segment)) {
    throw new Error(`${field} must identify a GitHub owner, repository, and source path`);
  }
  let segments: string[];
  try { segments = encodedSegments.map((segment) => decodeURIComponent(segment)); }
  catch { throw new Error(`${field} must use a valid canonical GitHub path`); }
  if (segments.some((segment) => segment === "." || segment === ".." || /[\\/\p{Cc}]/u.test(segment))) {
    throw new Error(`${field} must use a valid canonical GitHub path`);
  }
  if (!/^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/.test(segments[0]) || !/^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/.test(segments[1])) {
    throw new Error(`${field} must identify a valid GitHub owner and repository`);
  }
  return sourceUrl;
}

function validateSkill(raw: unknown, index: number, agentIds: Set<string>, mode: ValidateMode = "input"): SkillInput {
  if (!isRecord(raw)) throw new Error(`skills[${index}] must be an object`);
  assertExactKeys(raw, SKILL_INPUT_KEYS, `skills[${index}]`);
  const value: Record<string, unknown> = { ...raw };
  if (mode === "stored") {
    if (!("behavior" in value) || value.behavior === undefined) value.behavior = "";
    for (const key of ["capabilities", "inputs", "outputs"] as const) {
      if (!(key in value) || value[key] === undefined) value[key] = [];
    }
    if (!("documentation" in value) || value.documentation === undefined) value.documentation = "";
    if (!("provenance" in value) || value.provenance === undefined) value.provenance = "legacy_unverified";
  }
  const normalized = value;
  const id = canonicalString(normalized.id, `skills[${index}].id`, 80);
  if (!ID_PATTERN.test(id)) throw new Error(`skills[${index}].id must be a lowercase slug`);
  if (!isOneOf(normalized.deployment_state, SKILL_DEPLOYMENT_STATES)) throw new Error(`skills[${index}].deployment_state is invalid`);
  if (!isOneOf(normalized.provenance, SKILL_PROVENANCE)) throw new Error(`skills[${index}].provenance is invalid`);
  if (!Array.isArray(normalized.agent_ids) || normalized.agent_ids.length > MAX_LIST_ITEMS) throw new Error(`skills[${index}].agent_ids must contain 0 to ${MAX_LIST_ITEMS} references`);
  const connections = normalized.agent_ids.map((value, connectionIndex) => canonicalString(value, `skills[${index}].agent_ids[${connectionIndex}]`, 80));
  if (new Set(connections).size !== connections.length) throw new Error(`skills[${index}].agent_ids contains duplicate references`);
  const unknown = connections.find((value) => value !== "jarvis" && !agentIds.has(value));
  if (unknown) throw new Error(`Skill ${id} references an unknown agent: ${unknown}`);
  const sourceUrl = canonicalGithubSourceUrl(normalized.source_url, `skills[${index}].source_url`);
  if (normalized.quality_rating !== null && (typeof normalized.quality_rating !== "number" || !Number.isFinite(normalized.quality_rating) || normalized.quality_rating < 1 || normalized.quality_rating > 5)) throw new Error(`skills[${index}].quality_rating must be null or from 1 to 5`);
  if (!Number.isInteger(normalized.review_count) || Number(normalized.review_count) < 0 || Number(normalized.review_count) > 10_000) throw new Error(`skills[${index}].review_count must be an integer from 0 to 10000`);
  if ((normalized.quality_rating === null) !== (Number(normalized.review_count) === 0)) throw new Error(`skills[${index}] rating and review count are inconsistent`);
  return {
    id,
    name: boundedString(normalized.name, `skills[${index}].name`, 100),
    purpose: boundedString(normalized.purpose, `skills[${index}].purpose`, 600),
    behavior: boundedString(normalized.behavior, `skills[${index}].behavior`, 1_200, true),
    category: boundedString(normalized.category, `skills[${index}].category`, 80),
    tags: boundedStringList(normalized.tags, `skills[${index}].tags`),
    capabilities: boundedStringList(normalized.capabilities, `skills[${index}].capabilities`),
    inputs: boundedStringList(normalized.inputs, `skills[${index}].inputs`),
    outputs: boundedStringList(normalized.outputs, `skills[${index}].outputs`),
    documentation: multilineString(normalized.documentation, `skills[${index}].documentation`, 4_000),
    provenance: normalized.provenance,
    agent_ids: connections,
    deployment_state: normalized.deployment_state,
    source_url: sourceUrl,
    quality_rating: normalized.quality_rating,
    review_count: Number(normalized.review_count),
  };
}

function validateAgent(raw: unknown, index: number, mode: ValidateMode = "input"): AgentInput {
  if (!isRecord(raw)) throw new Error(`agents[${index}] must be an object`);
  assertExactKeys(raw, mode === "stored" ? AGENT_STORED_KEYS : AGENT_INPUT_KEYS, `agents[${index}]`);
  // A document stored before these fields existed is migrated forward without
  // mutating the caller's object. A field that is present but malformed is
  // still a hard failure.
  const value: Record<string, unknown> = { ...raw };
  if (mode === "stored") {
    for (const key of LEGACY_OPTIONAL_KEYS) {
      if (!(key in value)) value[key] = key === "notes" ? "" : [];
    }
  }
  const id = canonicalString(value.id, `agents[${index}].id`, 80);
  if (!ID_PATTERN.test(id)) throw new Error(`agents[${index}].id must be a lowercase slug`);
  if (id === "jarvis") throw new Error(`agents[${index}].id jarvis is reserved for skill assignments`);
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
    triggers: boundedStringList(value.triggers, `agents[${index}].triggers`),
    responsibilities: boundedStringList(value.responsibilities, `agents[${index}].responsibilities`),
    capabilities: boundedStringList(value.capabilities, `agents[${index}].capabilities`),
    inputs: boundedStringList(value.inputs, `agents[${index}].inputs`),
    outputs: boundedStringList(value.outputs, `agents[${index}].outputs`),
    next_milestone: boundedString(value.next_milestone, `agents[${index}].next_milestone`, 300, true),
    notes: multilineString(value.notes, `agents[${index}].notes`, 2_000),
  };
}

function validateInput(value: unknown, includeRevision: boolean, mode: ValidateMode = "input"): AgentWorkforceInput & { expected_revision?: string } {
  if (!isRecord(value)) throw new Error("Agent workforce must be an object");
  assertExactKeys(value, includeRevision ? ["agents", "skills", "expected_revision"] : ["agents", "skills"], "workforce");
  if (!Array.isArray(value.agents)) throw new Error("agents must be an array");
  if (value.agents.length > MAX_AGENTS) throw new Error(`agents exceeds ${MAX_AGENTS} items`);
  const agents = value.agents.map((agent, index) => validateAgent(agent, index, mode));
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
  const rawSkills = Object.hasOwn(value, "skills") ? value.skills : [];
  if (!Array.isArray(rawSkills)) throw new Error("skills must be an array");
  if (rawSkills.length > MAX_SKILLS) throw new Error(`skills exceeds ${MAX_SKILLS} items`);
  const allAgentIds = new Set(agents.map((agent) => agent.id));
  const skills = rawSkills.map((skill, index) => validateSkill(skill, index, allAgentIds, mode));
  const skillIds = new Set<string>();
  for (const skill of skills) {
    if (skillIds.has(skill.id)) throw new Error(`Duplicate skill id: ${skill.id}`);
    skillIds.add(skill.id);
  }
  const result: AgentWorkforceInput & { expected_revision?: string } = { agents, skills };
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

// Everything about an agent except the timestamps the server maintains. Two
// agents that compare equal here represent an unchanged definition.
function definitionFingerprint(agent: AgentInput): string {
  return JSON.stringify(AGENT_INPUT_KEYS.map((key) => agent[key]));
}

function stamp(agents: AgentInput[], now: string): AgentDefinition[] {
  return agents.map((agent) => ({ ...agent, created_at: now, updated_at: now }));
}

export function createAgentWorkforceDocument(input: unknown, now = new Date().toISOString()): AgentWorkforceDocument {
  const valid = validateInput(input, false);
  return {
    version: 2,
    agents: stamp(valid.agents, now),
    skills: valid.skills.map((skill) => ({ ...skill, usage: null, created_at: now, updated_at: now })),
    revision: now,
    updated_at: now,
  };
}

export function parseAgentWorkforceDocument(raw: string, migrationSkills: SkillInput[] = []): AgentWorkforceDocument {
  let parsed: unknown;
  try { parsed = parseJsonWithUniqueKeys(raw); } catch { throw new Error("Stored agent workforce is invalid JSON"); }
  if (!isRecord(parsed)) throw new Error("Stored agent workforce must be an object");
  if (parsed.version !== 1 && parsed.version !== 2) throw new Error("Unsupported agent workforce version");
  const legacy = parsed.version === 1;
  assertExactKeys(parsed, legacy ? ["version", "agents", "revision", "updated_at"] : ["version", "agents", "skills", "revision", "updated_at"], "stored workforce");
  const storedSkills = legacy ? migrationSkills : parsed.skills;
  if (!Array.isArray(storedSkills)) throw new Error("Stored workforce skills must be an array");
  const skillInputs = storedSkills.map((skill, index) => {
    if (!isRecord(skill)) throw new Error(`skills[${index}] must be an object`);
    if (legacy) return skill;
    assertExactKeys(skill, SKILL_STORED_KEYS, `skills[${index}]`);
    return Object.fromEntries(SKILL_INPUT_KEYS.map((key) => [key, skill[key]]));
  });
  const valid = validateInput({ agents: parsed.agents, skills: skillInputs }, false, "stored");
  const revision = canonicalTimestamp(parsed.revision, "revision");
  const updatedAt = canonicalTimestamp(parsed.updated_at, "updated_at");
  const storedAgents = parsed.agents as Array<Record<string, unknown>>;
  const agents: AgentDefinition[] = valid.agents.map((agent, index) => ({
    ...agent,
    created_at: "created_at" in storedAgents[index]
      ? canonicalTimestamp(storedAgents[index].created_at, `agents[${index}].created_at`)
      : revision,
    updated_at: "updated_at" in storedAgents[index]
      ? canonicalTimestamp(storedAgents[index].updated_at, `agents[${index}].updated_at`)
      : revision,
  }));
  const skillRecords = storedSkills as Array<Record<string, unknown>>;
  const skills: SkillDefinition[] = valid.skills.map((skill, index) => {
    const stored = skillRecords[index];
    let usage: SkillUsage | null = null;
    if (!legacy && stored.usage !== null) {
      if (!isRecord(stored.usage)) throw new Error(`skills[${index}].usage must be null or an object`);
      assertExactKeys(stored.usage, ["count", "last_used_at", "source"], `skills[${index}].usage`);
      if (!Number.isInteger(stored.usage.count) || Number(stored.usage.count) < 0 || Number(stored.usage.count) > 1_000_000_000) throw new Error(`skills[${index}].usage.count is invalid`);
      if (stored.usage.source !== "hermes") throw new Error(`skills[${index}].usage.source is invalid`);
      usage = { count: Number(stored.usage.count), last_used_at: canonicalTimestamp(stored.usage.last_used_at, `skills[${index}].usage.last_used_at`), source: "hermes" };
    }
    return {
      ...skill,
      usage,
      created_at: legacy ? revision : canonicalTimestamp(stored.created_at, `skills[${index}].created_at`),
      updated_at: legacy ? revision : canonicalTimestamp(stored.updated_at, `skills[${index}].updated_at`),
    };
  });
  return { version: 2, agents, skills, revision, updated_at: updatedAt };
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
  const nextSkillIds = new Set(valid.skills.map((skill) => skill.id));
  const removedSkill = current.skills.find((skill) => !nextSkillIds.has(skill.id));
  if (removedSkill) throw new Error(`Skill deletion is not supported: ${removedSkill.id}`);
  const revision = nextRevision(current.revision, now, databaseRevision);
  // Timestamps are derived here rather than trusted from the request: a new
  // agent is born at this revision, an edited one is touched, and an agent the
  // save did not change keeps the history it already had.
  const previous = new Map(current.agents.map((agent) => [agent.id, agent]));
  const agents: AgentDefinition[] = valid.agents.map((agent) => {
    const existing = previous.get(agent.id);
    if (!existing) return { ...agent, created_at: revision, updated_at: revision };
    const unchanged = definitionFingerprint(agent) === definitionFingerprint(existing);
    return {
      ...agent,
      created_at: existing.created_at,
      updated_at: unchanged ? existing.updated_at : revision,
    };
  });
  const previousSkills = new Map(current.skills.map((skill) => [skill.id, skill]));
  const skills: SkillDefinition[] = valid.skills.map((skill) => {
    const existing = previousSkills.get(skill.id);
    if (!existing) return { ...skill, usage: null, created_at: revision, updated_at: revision };
    const unchanged = JSON.stringify(SKILL_INPUT_KEYS.map((key) => skill[key])) === JSON.stringify(SKILL_INPUT_KEYS.map((key) => existing[key]));
    return {
      ...skill,
      usage: existing.usage,
      created_at: existing.created_at,
      updated_at: unchanged ? existing.updated_at : revision,
    };
  });
  return { version: 2, agents, skills, revision, updated_at: revision };
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
  const used = new Set(["jarvis", ...usedIds]);
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
