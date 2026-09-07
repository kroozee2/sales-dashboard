export const INSTAGRAM_HOT_LEADS_SETTINGS_KEY = "instagram_hot_leads_v1";
export const INSTAGRAM_HOT_LEADS_MAX_ROWS = 50;
export const INSTAGRAM_HOT_LEADS_MAX_BODY_BYTES = 512_000;

export type InstagramHotLeadStatus =
  | "draft"
  | "approved"
  | "sending"
  | "sent"
  | "failed"
  | "skipped";

export type InstagramHotLead = {
  rank: number;
  username: string;
  display_name: string | null;
  updated_time: string;
  heat_score: number;
  heat_reason: string;
  relevant_offer: string;
  latest_inbound_summary: string;
  salesos_match: string | null;
  salesos_lead_id: string | null;
  conversation_id: string | null;
  recipient_id: string | null;
  provider_account_id: string;
  draft_reply: string;
  status: InstagramHotLeadStatus;
  last_error: string | null;
  sent_at: string | null;
  updated_at: string;
  revision: string;
};

export type InstagramHotLeadsDocument = {
  generated_at: string;
  leads: InstagramHotLead[];
};

export type InstagramHotLeadPatch = {
  actor: "browser" | "worker";
  draft_reply?: string;
  status?: InstagramHotLeadStatus;
  expected_draft_reply?: string;
  expected_revision?: string;
  last_error?: string | null;
};

const STATUSES = new Set<InstagramHotLeadStatus>(["draft", "approved", "sending", "sent", "failed", "skipped"]);
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;
const REVISION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEAD_KEYS = new Set([
  "rank", "username", "display_name", "updated_time", "heat_score", "heat_reason",
  "relevant_offer", "latest_inbound_summary", "salesos_match", "salesos_lead_id",
  "conversation_id", "recipient_id", "provider_account_id", "draft_reply", "status", "last_error", "sent_at", "updated_at", "revision",
]);
const DOCUMENT_KEYS = new Set(["generated_at", "leads"]);
const PATCH_KEYS = new Set(["actor", "draft_reply", "status", "expected_draft_reply", "expected_revision", "last_error"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`${label} has unexpected field: ${unexpected[0]}`);
}

function string(value: unknown, field: string, max: number, { empty = true }: { empty?: boolean } = {}): string {
  if (typeof value !== "string" || value.length > max || (!empty && value.length === 0)) {
    throw new Error(`${field} must be ${empty ? "a" : "a non-empty"} string of at most ${max} characters`);
  }
  return value;
}

function nullableString(value: unknown, field: string, max: number): string | null {
  return value === null ? null : string(value, field, max);
}

function iso(value: unknown, field: string): string {
  const result = string(value, field, 40, { empty: false });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result) || Number.isNaN(Date.parse(result))) {
    throw new Error(`${field} must be an ISO-8601 UTC timestamp`);
  }
  return result;
}

function nullableIso(value: unknown, field: string): string | null {
  return value === null ? null : iso(value, field);
}

function revision(value: unknown, field: string): string {
  const result = string(value, field, 36, { empty: false });
  if (!REVISION_RE.test(result)) throw new Error(`${field} must be a UUID revision`);
  return result;
}

function newRevision(): string {
  return globalThis.crypto.randomUUID();
}

function parseLead(value: unknown, index: number): InstagramHotLead {
  const input = record(value, `leads[${index}]`);
  exactKeys(input, LEAD_KEYS, `leads[${index}]`);
  for (const key of LEAD_KEYS) {
    if (!(key in input)) throw new Error(`leads[${index}].${key} is required`);
  }
  if (!Number.isInteger(input.rank) || (input.rank as number) < 1 || (input.rank as number) > INSTAGRAM_HOT_LEADS_MAX_ROWS) {
    throw new Error(`leads[${index}].rank must be an integer from 1 to 50`);
  }
  const username = string(input.username, `leads[${index}].username`, 30, { empty: false });
  if (!USERNAME_RE.test(username)) throw new Error(`leads[${index}].username is invalid`);
  if (typeof input.heat_score !== "number" || !Number.isFinite(input.heat_score) || input.heat_score < 0 || input.heat_score > 100) {
    throw new Error(`leads[${index}].heat_score must be between 0 and 100`);
  }
  if (typeof input.status !== "string" || !STATUSES.has(input.status as InstagramHotLeadStatus)) {
    throw new Error(`leads[${index}].status is invalid`);
  }
  const status = input.status as InstagramHotLeadStatus;
  const sentAt = nullableIso(input.sent_at, `leads[${index}].sent_at`);
  if ((status === "sent") !== (sentAt !== null)) throw new Error(`leads[${index}].sent_at must be set only for sent rows`);

  return {
    rank: input.rank as number,
    username,
    display_name: nullableString(input.display_name, `leads[${index}].display_name`, 200),
    updated_time: iso(input.updated_time, `leads[${index}].updated_time`),
    heat_score: input.heat_score,
    heat_reason: string(input.heat_reason, `leads[${index}].heat_reason`, 1000),
    relevant_offer: string(input.relevant_offer, `leads[${index}].relevant_offer`, 300),
    latest_inbound_summary: string(input.latest_inbound_summary, `leads[${index}].latest_inbound_summary`, 2000),
    salesos_match: nullableString(input.salesos_match, `leads[${index}].salesos_match`, 1000),
    salesos_lead_id: nullableString(input.salesos_lead_id, `leads[${index}].salesos_lead_id`, 200),
    conversation_id: nullableString(input.conversation_id, `leads[${index}].conversation_id`, 300),
    recipient_id: nullableString(input.recipient_id, `leads[${index}].recipient_id`, 300),
    provider_account_id: string(input.provider_account_id, `leads[${index}].provider_account_id`, 300, { empty: false }),
    draft_reply: string(input.draft_reply, `leads[${index}].draft_reply`, 2000),
    status,
    last_error: nullableString(input.last_error, `leads[${index}].last_error`, 500),
    sent_at: sentAt,
    updated_at: iso(input.updated_at, `leads[${index}].updated_at`),
    revision: revision(input.revision, `leads[${index}].revision`),
  };
}

export function parseInstagramHotLeadsDocument(value: unknown): InstagramHotLeadsDocument {
  const input = record(value, "document");
  exactKeys(input, DOCUMENT_KEYS, "document");
  if (!("generated_at" in input) || !("leads" in input)) throw new Error("document requires generated_at and leads");
  if (!Array.isArray(input.leads) || input.leads.length > INSTAGRAM_HOT_LEADS_MAX_ROWS) throw new Error("leads must contain at most 50 rows");
  const leads = input.leads.map(parseLead);
  const usernames = new Set<string>();
  const ranks = new Set<number>();
  for (const lead of leads) {
    const key = lead.username.toLowerCase();
    if (usernames.has(key)) throw new Error(`duplicate username: ${lead.username}`);
    if (ranks.has(lead.rank)) throw new Error(`duplicate rank: ${lead.rank}`);
    usernames.add(key);
    ranks.add(lead.rank);
  }
  return { generated_at: iso(input.generated_at, "generated_at"), leads };
}

export function emptyInstagramHotLeadsDocument(now = new Date().toISOString()): InstagramHotLeadsDocument {
  return { generated_at: now, leads: [] };
}

export class InstagramHotLeadsImportConflictError extends Error {}

export function replaceInstagramHotLeads(
  currentValue: unknown,
  incomingValue: unknown,
  now = new Date().toISOString(),
): InstagramHotLeadsDocument {
  const current = parseInstagramHotLeadsDocument(currentValue);
  const incoming = parseInstagramHotLeadsDocument(incomingValue);
  if (current.leads.some((row) => row.status === "sending")) {
    throw new InstagramHotLeadsImportConflictError("Cannot import while an Instagram send is in flight");
  }
  const sentByUsername = new Map(current.leads.filter((row) => row.status === "sent").map((row) => [row.username.toLowerCase(), row]));
  return {
    generated_at: incoming.generated_at,
    leads: incoming.leads.map((row) => {
      const sent = sentByUsername.get(row.username.toLowerCase());
      if (
        sent?.draft_reply === row.draft_reply
        && sent.recipient_id === row.recipient_id
        && sent.conversation_id === row.conversation_id
        && sent.provider_account_id === row.provider_account_id
      ) {
        return { ...row, status: "sent", last_error: null, sent_at: sent.sent_at, updated_at: sent.updated_at, revision: sent.revision };
      }
      return { ...row, status: "draft", last_error: null, sent_at: null, updated_at: now, revision: newRevision() };
    }),
  };
}

function parsePatch(value: unknown): InstagramHotLeadPatch {
  const input = record(value, "patch");
  exactKeys(input, PATCH_KEYS, "patch");
  if (input.actor !== "browser" && input.actor !== "worker") throw new Error("patch.actor must be browser or worker");
  const result: InstagramHotLeadPatch = { actor: input.actor };
  if ("draft_reply" in input) result.draft_reply = string(input.draft_reply, "draft_reply", 2000);
  if ("status" in input) {
    if (typeof input.status !== "string" || !STATUSES.has(input.status as InstagramHotLeadStatus)) throw new Error("status is invalid");
    result.status = input.status as InstagramHotLeadStatus;
  }
  if ("expected_draft_reply" in input) result.expected_draft_reply = string(input.expected_draft_reply, "expected_draft_reply", 2000);
  if ("expected_revision" in input) result.expected_revision = revision(input.expected_revision, "expected_revision");
  if ("last_error" in input) result.last_error = nullableString(input.last_error, "last_error", 500);
  if (result.draft_reply === undefined && result.status === undefined) throw new Error("patch requires draft_reply and/or status");
  return result;
}

export function applyInstagramHotLeadPatch(
  current: InstagramHotLead,
  patchValue: unknown,
  now = new Date().toISOString(),
): InstagramHotLead {
  const patch = parsePatch(patchValue);
  iso(now, "now");
  if (patch.expected_revision !== undefined && patch.expected_revision !== current.revision) throw new Error("Stale update: revision changed");
  if (patch.expected_draft_reply !== undefined && patch.expected_draft_reply !== current.draft_reply) throw new Error("Stale update: draft reply changed");

  if (patch.draft_reply !== undefined) {
    if (patch.actor !== "browser") throw new Error("Only the browser may edit draft_reply");
    if (!patch.expected_revision) throw new Error("Draft edits require expected_revision");
    if (current.status === "sending" || current.status === "sent") throw new Error(`Cannot edit a ${current.status} row`);
    if (patch.status !== undefined) throw new Error("Save a draft before changing status");
    return { ...current, draft_reply: patch.draft_reply, status: "draft", last_error: null, sent_at: null, updated_at: now, revision: newRevision() };
  }

  const nextStatus = patch.status!;
  if (patch.actor === "browser") {
    if (nextStatus === "approved" && (current.status === "draft" || current.status === "failed")) {
      if (patch.expected_draft_reply === undefined) throw new Error("Approval requires expected_draft_reply");
      if (!patch.expected_revision) throw new Error("Approval requires expected_revision");
      return { ...current, status: "approved", last_error: null, updated_at: now, revision: newRevision() };
    }
    if (nextStatus === "skipped" && ["draft", "approved", "failed"].includes(current.status)) {
      if (!patch.expected_revision) throw new Error("Skipping requires expected_revision");
      return { ...current, status: "skipped", last_error: null, updated_at: now, revision: newRevision() };
    }
    throw new Error(`Invalid browser status transition ${current.status} -> ${nextStatus}`);
  }

  if (!patch.expected_revision) throw new Error("Worker transitions require expected_revision");
  if (current.status === "approved" && nextStatus === "sending") {
    if (patch.expected_draft_reply === undefined) throw new Error("Worker claim requires expected_draft_reply");
    return { ...current, status: "sending", last_error: null, updated_at: now, revision: newRevision() };
  }
  if (current.status === "sending" && nextStatus === "sent") {
    return { ...current, status: "sent", last_error: null, sent_at: now, updated_at: now, revision: newRevision() };
  }
  if (current.status === "sending" && nextStatus === "failed") {
    if (!patch.last_error) throw new Error("Failed transition requires last_error");
    return { ...current, status: "failed", last_error: patch.last_error, sent_at: null, updated_at: now, revision: newRevision() };
  }
  throw new Error(`Invalid worker status transition ${current.status} -> ${nextStatus}`);
}
