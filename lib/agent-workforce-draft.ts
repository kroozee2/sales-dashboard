import { AGENT_AUTONOMY, AGENT_STATUSES, parseJsonWithUniqueKeys, type AgentAutonomy, type AgentDefinition, type AgentStatus, type AgentType } from "./agent-workforce.ts";

export type AgentWorkforceDraftForm = Omit<AgentDefinition, "capabilities" | "inputs" | "outputs"> & {
  capabilities_text: string;
  inputs_text: string;
  outputs_text: string;
};

export type AgentWorkforceDraftWriteResult =
  | { ok: true }
  | { ok: false; warning: string; staleSnapshotMayRemain: boolean };

export const AGENT_DRAFT_KEY_PREFIX = "salesos:agent-workforce:draft:v3";
export const AGENT_DRAFT_MAX_BYTES = 20_000;

const STRING_LIMITS: Partial<Record<keyof AgentWorkforceDraftForm, number>> = {
  id: 80,
  name: 80,
  emoji: 12,
  role: 120,
  department: 100,
  mission: 1_200,
  personality: 600,
  cadence: 200,
  schedule: 200,
  next_milestone: 300,
  capabilities_text: 4_000,
  inputs_text: 4_000,
  outputs_text: 4_000,
};
const DRAFT_KEYS = ["form", "owner_id", "revision", "view"].sort();
const FORM_KEYS = [
  "id", "type", "parent_id", "name", "emoji", "role", "department", "mission", "personality", "status", "progress",
  "autonomy", "cadence", "schedule", "next_milestone", "capabilities_text", "inputs_text", "outputs_text",
].sort();

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function agentWorkforceDraftKey(ownerId: string, view: AgentType) {
  return `${AGENT_DRAFT_KEY_PREFIX}:${encodeURIComponent(ownerId)}:${view}`;
}

function validRevision(revision: unknown): revision is string {
  return typeof revision === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(revision) && new Date(revision).toISOString() === revision;
}

function validOwnerId(ownerId: string): boolean {
  return ownerId.length > 0 && ownerId.length <= 128 && !/[\u0000-\u001f\u007f-\u009f]/.test(ownerId);
}

export function parseAgentWorkforceDraft(raw: string, revision: string | null, ownerId: string, view: AgentType): AgentWorkforceDraftForm | null {
  if (byteLength(raw) > AGENT_DRAFT_MAX_BYTES) return null;
  try {
    const stored = parseJsonWithUniqueKeys(raw) as { revision?: unknown; owner_id?: unknown; view?: unknown; form?: unknown };
    if (!validOwnerId(ownerId) || !stored || typeof stored !== "object" || Array.isArray(stored) || Object.keys(stored).sort().join("|") !== DRAFT_KEYS.join("|") || (revision !== null && stored.revision !== revision) || !validRevision(stored.revision) || stored.owner_id !== ownerId || stored.view !== view || !stored.form || typeof stored.form !== "object" || Array.isArray(stored.form)) return null;
    const form = stored.form as Record<string, unknown>;
    if (Object.keys(form).sort().join("|") !== FORM_KEYS.join("|") || form.type !== view) return null;
    for (const [key, max] of Object.entries(STRING_LIMITS)) {
      const stringValue = form[key];
      const hasInvalidControl = typeof stringValue === "string" && (key.endsWith("_text") ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(stringValue) : /\p{Cc}/u.test(stringValue));
      if (typeof stringValue !== "string" || stringValue.length > max || hasInvalidControl) return null;
    }
    if (!AGENT_STATUSES.includes(form.status as AgentStatus) || !AGENT_AUTONOMY.includes(form.autonomy as AgentAutonomy)) return null;
    if (form.type !== "core" && form.type !== "subagent") return null;
    if (!Number.isInteger(form.progress) || Number(form.progress) < 0 || Number(form.progress) > 100) return null;
    if (form.parent_id !== null && (typeof form.parent_id !== "string" || form.parent_id.length > 80 || /\p{Cc}/u.test(form.parent_id))) return null;
    return form as unknown as AgentWorkforceDraftForm;
  } catch {
    return null;
  }
}

export function reconcileAgentWorkforceDraft(original: AgentWorkforceDraftForm, draft: AgentWorkforceDraftForm, latest: AgentWorkforceDraftForm) {
  const form = { ...latest };
  const conflicts: Array<keyof AgentWorkforceDraftForm> = [];
  for (const key of FORM_KEYS as Array<keyof AgentWorkforceDraftForm>) {
    const userChanged = draft[key] !== original[key];
    if (!userChanged) continue;
    if (latest[key] !== original[key] && latest[key] !== draft[key]) conflicts.push(key);
    Object.assign(form, { [key]: draft[key] });
  }
  return { form, conflicts };
}

export function serializeAgentWorkforceDraft(revision: string, ownerId: string, view: AgentType, form: AgentWorkforceDraftForm): string | null {
  if (!validOwnerId(ownerId)) return null;
  const raw = JSON.stringify({ revision, owner_id: ownerId, view, form });
  if (byteLength(raw) > AGENT_DRAFT_MAX_BYTES) return null;
  return parseAgentWorkforceDraft(raw, revision, ownerId, view) ? raw : null;
}

export function persistAgentWorkforceDraft(storage: Pick<Storage, "setItem" | "removeItem">, revision: string, ownerId: string, view: AgentType, form: AgentWorkforceDraftForm | null): AgentWorkforceDraftWriteResult {
  const key = agentWorkforceDraftKey(ownerId, view);
  if (!form) {
    try { storage.removeItem(key); return { ok: true }; }
    catch { return { ok: false, warning: "Draft recovery storage could not be cleared. An older snapshot may remain in this tab.", staleSnapshotMayRemain: true }; }
  }
  const raw = serializeAgentWorkforceDraft(revision, ownerId, view, form);
  if (!raw) {
    try { storage.removeItem(key); }
    catch { return { ok: false, warning: "This draft exceeds recovery limits, and an older snapshot may remain in this tab.", staleSnapshotMayRemain: true }; }
    return { ok: false, warning: "This draft exceeds recovery limits and cannot be recovered after a reload.", staleSnapshotMayRemain: false };
  }
  try {
    storage.setItem(key, raw);
    return { ok: true };
  } catch {
    try {
      storage.removeItem(key);
      return { ok: false, warning: "Draft recovery storage failed. The older snapshot was removed, so keep this editor open until you save.", staleSnapshotMayRemain: false };
    } catch {
      return { ok: false, warning: "Draft recovery storage failed, and an older snapshot may remain. Keep this editor open until you save.", staleSnapshotMayRemain: true };
    }
  }
}
