export const HOT_INSTAGRAM_SETTINGS_KEY = "hot_leads_instagram_v1";
export const HOT_INSTAGRAM_MAX_CONTEXTS = 50;
export const HOT_INSTAGRAM_MAX_MESSAGES = 20;
export const HOT_INSTAGRAM_MAX_BODY_BYTES = 750_000;

export type HotInstagramStatus = "draft" | "approved" | "sending" | "sent" | "failed";
export type HotInstagramMessage = { id: string; text: string; is_sender: boolean; timestamp: string };
export type HotInstagramContext = {
  lead_id: string;
  instagram_handle: string;
  chat_id: string;
  account_id: string;
  messages: HotInstagramMessage[];
  draft_reply: string;
  status: HotInstagramStatus;
  last_error: string | null;
  sent_at: string | null;
  updated_at: string;
  revision: string;
};
export type HotInstagramDocument = { version: 1; synced_at: string; contexts: HotInstagramContext[] };
export type PublicHotInstagramContext = Omit<HotInstagramContext, "chat_id" | "account_id">;

export function publicHotInstagramContext(context: HotInstagramContext): PublicHotInstagramContext {
  const publicContext: Partial<HotInstagramContext> = { ...context };
  delete publicContext.chat_id;
  delete publicContext.account_id;
  return publicContext as PublicHotInstagramContext;
}

type Patch = {
  actor: "browser" | "worker";
  draft_reply?: string;
  status?: HotInstagramStatus;
  expected_draft_reply?: string;
  expected_revision?: string;
  last_error?: string | null;
};

const STATUS = new Set<HotInstagramStatus>(["draft", "approved", "sending", "sent", "failed"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const DOCUMENT_KEYS = new Set(["version", "synced_at", "contexts"]);
const CONTEXT_KEYS = new Set(["lead_id", "instagram_handle", "chat_id", "account_id", "messages", "draft_reply", "status", "last_error", "sent_at", "updated_at", "revision"]);
const MESSAGE_KEYS = new Set(["id", "text", "is_sender", "timestamp"]);
const PATCH_KEYS = new Set(["actor", "draft_reply", "status", "expected_draft_reply", "expected_revision", "last_error"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exactKeys(input: Record<string, unknown>, keys: Set<string>, label: string) {
  const extra = Object.keys(input).find((key) => !keys.has(key));
  if (extra) throw new Error(`${label} has unexpected field: ${extra}`);
}
function string(value: unknown, field: string, max: number, empty = true) {
  if (typeof value !== "string" || value.length > max || (!empty && value.length === 0)) throw new Error(`${field} must be ${empty ? "a" : "a non-empty"} string of at most ${max} characters`);
  return value;
}
function nullableString(value: unknown, field: string, max: number) { return value === null ? null : string(value, field, max); }
function iso(value: unknown, field: string) {
  const result = string(value, field, 40, false);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result) || Number.isNaN(Date.parse(result))) throw new Error(`${field} must be an ISO UTC timestamp`);
  return result;
}
function revision(value: unknown, field: string) {
  const result = string(value, field, 36, false);
  if (!REVISION.test(result)) throw new Error(`${field} must be a UUID revision`);
  return result;
}
function newRevision() { return globalThis.crypto.randomUUID(); }

function parseMessage(value: unknown, index: number): HotInstagramMessage {
  const input = object(value, `messages[${index}]`);
  exactKeys(input, MESSAGE_KEYS, `messages[${index}]`);
  if (typeof input.is_sender !== "boolean") throw new Error(`messages[${index}].is_sender must be boolean`);
  return { id: string(input.id, `messages[${index}].id`, 300, false), text: string(input.text, `messages[${index}].text`, 5000), is_sender: input.is_sender, timestamp: iso(input.timestamp, `messages[${index}].timestamp`) };
}

function parseContext(value: unknown, index: number): HotInstagramContext {
  const input = object(value, `contexts[${index}]`);
  exactKeys(input, CONTEXT_KEYS, `contexts[${index}]`);
  for (const key of CONTEXT_KEYS) if (!(key in input)) throw new Error(`contexts[${index}].${key} is required`);
  const leadId = string(input.lead_id, `contexts[${index}].lead_id`, 36, false);
  if (!UUID.test(leadId)) throw new Error(`contexts[${index}].lead_id is invalid`);
  const handle = string(input.instagram_handle, `contexts[${index}].instagram_handle`, 30, false);
  if (!HANDLE.test(handle)) throw new Error(`contexts[${index}].instagram_handle is invalid`);
  if (!Array.isArray(input.messages) || input.messages.length > HOT_INSTAGRAM_MAX_MESSAGES) throw new Error(`contexts[${index}].messages must contain at most ${HOT_INSTAGRAM_MAX_MESSAGES} messages`);
  if (typeof input.status !== "string" || !STATUS.has(input.status as HotInstagramStatus)) throw new Error(`contexts[${index}].status is invalid`);
  const status = input.status as HotInstagramStatus;
  const sentAt = input.sent_at === null ? null : iso(input.sent_at, `contexts[${index}].sent_at`);
  if ((status === "sent") !== (sentAt !== null)) throw new Error(`contexts[${index}].sent_at must be set only for sent status`);
  return {
    lead_id: leadId,
    instagram_handle: handle,
    chat_id: string(input.chat_id, `contexts[${index}].chat_id`, 300, false),
    account_id: string(input.account_id, `contexts[${index}].account_id`, 300, false),
    messages: input.messages.map(parseMessage).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    draft_reply: string(input.draft_reply, `contexts[${index}].draft_reply`, 2000),
    status,
    last_error: nullableString(input.last_error, `contexts[${index}].last_error`, 500),
    sent_at: sentAt,
    updated_at: iso(input.updated_at, `contexts[${index}].updated_at`),
    revision: revision(input.revision, `contexts[${index}].revision`),
  };
}

export function parseHotInstagramDocument(value: unknown): HotInstagramDocument {
  const input = object(value, "document");
  exactKeys(input, DOCUMENT_KEYS, "document");
  if (input.version !== 1 || !Array.isArray(input.contexts) || input.contexts.length > HOT_INSTAGRAM_MAX_CONTEXTS) throw new Error(`document must be version 1 with at most ${HOT_INSTAGRAM_MAX_CONTEXTS} contexts`);
  const contexts = input.contexts.map(parseContext);
  const ids = new Set<string>();
  const handles = new Set<string>();
  const deliveries = new Set<string>();
  for (const context of contexts) {
    if (ids.has(context.lead_id)) throw new Error(`duplicate lead: ${context.lead_id}`);
    const handle = context.instagram_handle.toLowerCase();
    const delivery = `${context.account_id}\u0000${context.chat_id}`;
    if (handles.has(handle)) throw new Error(`duplicate Instagram handle: ${context.instagram_handle}`);
    if (deliveries.has(delivery)) throw new Error("duplicate Instagram delivery identity");
    ids.add(context.lead_id);
    handles.add(handle);
    deliveries.add(delivery);
  }
  return { version: 1, synced_at: iso(input.synced_at, "document.synced_at"), contexts };
}

export function emptyHotInstagramDocument(now = "1970-01-01T00:00:00.000Z"): HotInstagramDocument { return { version: 1, synced_at: now, contexts: [] }; }
export class HotInstagramConflictError extends Error {}

function lastMessageId(context: HotInstagramContext) { return context.messages.at(-1)?.id ?? null; }
export function mergeHotInstagramSync(currentValue: unknown, incomingValue: unknown, now = new Date().toISOString(), activeLeadIds?: ReadonlySet<string>): HotInstagramDocument {
  const current = parseHotInstagramDocument(currentValue);
  const incoming = parseHotInstagramDocument(incomingValue);
  if (current.contexts.some((row) => row.status === "sending")) throw new HotInstagramConflictError("Cannot sync while an Instagram send is in flight");
  const existing = new Map(current.contexts.map((row) => [row.lead_id, row]));
  const contexts = incoming.contexts.map((row) => {
    const old = existing.get(row.lead_id);
    if (!old) return { ...row, status: "draft" as const, last_error: null, sent_at: null, updated_at: now, revision: newRevision() };
    const sameIdentity = old.chat_id === row.chat_id && old.account_id === row.account_id && old.instagram_handle.toLowerCase() === row.instagram_handle.toLowerCase();
    const threadChanged = lastMessageId(old) !== lastMessageId(row);
    if (!sameIdentity) return { ...row, draft_reply: "", status: "draft" as const, last_error: "Instagram delivery identity changed; review again.", sent_at: null, updated_at: now, revision: newRevision() };
    if (threadChanged && old.status === "sent") return { ...row, draft_reply: "", status: "draft" as const, last_error: null, sent_at: null, updated_at: now, revision: newRevision() };
    if (threadChanged && (old.status === "approved" || old.status === "failed")) return { ...row, draft_reply: old.draft_reply, status: "draft" as const, last_error: "Instagram conversation changed; review the latest messages before sending.", sent_at: null, updated_at: now, revision: newRevision() };
    return { ...row, draft_reply: old.draft_reply, status: old.status, last_error: old.last_error, sent_at: old.sent_at, updated_at: old.updated_at, revision: old.revision };
  });
  const incomingIds = new Set(incoming.contexts.map((row) => row.lead_id));
  const preserved = activeLeadIds
    ? current.contexts.filter((row) => activeLeadIds.has(row.lead_id) && !incomingIds.has(row.lead_id))
    : [];
  return parseHotInstagramDocument({ version: 1, synced_at: incoming.synced_at, contexts: [...contexts, ...preserved].slice(0, HOT_INSTAGRAM_MAX_CONTEXTS) });
}

function parsePatch(value: unknown): Patch {
  const input = object(value, "patch");
  exactKeys(input, PATCH_KEYS, "patch");
  if (input.actor !== "browser" && input.actor !== "worker") throw new Error("patch.actor must be browser or worker");
  const patch: Patch = { actor: input.actor };
  if ("draft_reply" in input) patch.draft_reply = string(input.draft_reply, "draft_reply", 2000);
  if ("status" in input) {
    if (typeof input.status !== "string" || !STATUS.has(input.status as HotInstagramStatus)) throw new Error("status is invalid");
    patch.status = input.status as HotInstagramStatus;
  }
  if ("expected_draft_reply" in input) patch.expected_draft_reply = string(input.expected_draft_reply, "expected_draft_reply", 2000);
  if ("expected_revision" in input) patch.expected_revision = revision(input.expected_revision, "expected_revision");
  if ("last_error" in input) patch.last_error = nullableString(input.last_error, "last_error", 500);
  if (patch.draft_reply === undefined && patch.status === undefined) throw new Error("patch requires draft_reply and/or status");
  return patch;
}

export function applyHotInstagramPatch(current: HotInstagramContext, value: unknown, now = new Date().toISOString()): HotInstagramContext {
  const patch = parsePatch(value);
  iso(now, "now");
  if (patch.expected_revision !== current.revision) throw new Error("Stale update: revision changed");
  if (patch.expected_draft_reply !== undefined && patch.expected_draft_reply !== current.draft_reply) throw new Error("Stale update: draft reply changed");
  if (patch.draft_reply !== undefined) {
    if (patch.actor !== "browser" || patch.status !== undefined) throw new Error("Only the browser may save a draft separately");
    if (current.status === "sending" || current.status === "sent") throw new Error(`Cannot edit a ${current.status} message`);
    return { ...current, draft_reply: patch.draft_reply, status: "draft", last_error: null, sent_at: null, updated_at: now, revision: newRevision() };
  }
  const next = patch.status!;
  if (patch.actor === "browser") {
    if (next === "approved" && (current.status === "draft" || current.status === "failed") && current.draft_reply) {
      if (patch.expected_draft_reply === undefined) throw new Error("Approval requires expected_draft_reply");
      return { ...current, status: "approved", last_error: null, updated_at: now, revision: newRevision() };
    }
    throw new Error(`Invalid browser status transition ${current.status} -> ${next}`);
  }
  if (current.status === "approved" && next === "sending") {
    if (patch.expected_draft_reply === undefined) throw new Error("Worker claim requires expected_draft_reply");
    return { ...current, status: "sending", last_error: null, updated_at: now, revision: newRevision() };
  }
  if (current.status === "sending" && next === "sent") return { ...current, status: "sent", last_error: null, sent_at: now, updated_at: now, revision: newRevision() };
  if (current.status === "sending" && next === "failed") {
    if (!patch.last_error) throw new Error("Failed transition requires last_error");
    return { ...current, status: "failed", last_error: patch.last_error, sent_at: null, updated_at: now, revision: newRevision() };
  }
  throw new Error(`Invalid worker status transition ${current.status} -> ${next}`);
}
