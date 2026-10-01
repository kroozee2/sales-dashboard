import { createHash, timingSafeEqual } from "node:crypto";

export const MAX_REFERRAL_INVITE_BODY_BYTES = 8 * 1024;
export const MAX_QUEUED_REFERRAL_INVITES = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT_ID_RE = /^[A-Za-z0-9_-]{5,1024}$/;

export class ReferralInviteInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type InviteCompletion =
  | { id: string; status: "invited"; actual_event_id: string }
  | { id: string; status: "failed" };

export type QueuedReferralInvite = {
  id: string;
  lead_id: string | null;
  name: string | null;
  email: string;
  event_date: string;
  status: "queued";
  created_at: string;
  event_id: string | null;
};

function exactString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new ReferralInviteInputError(`Invalid ${field}`);
  }
  return value;
}

export function normalizeReferralInviteRegistrant(value: unknown): { lead_id: string | null; name: string | null; email: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReferralInviteInputError("JSON object required");
  const input = value as Record<string, unknown>;
  const rawEmail = exactString(input.email, "email", 254).trim().toLowerCase();
  if (!EMAIL_RE.test(rawEmail)) throw new ReferralInviteInputError("Invalid email");
  const optional = (field: "lead_id" | "name", max: number): string | null => {
    const raw = input[field];
    if (raw === undefined || raw === null) return null;
    const safe = exactString(raw, field, max);
    const trimmed = safe.trim();
    return trimmed || null;
  };
  return { lead_id: optional("lead_id", 200), name: optional("name", 200), email: rawEmail };
}

function validDateOnly(value: unknown): string {
  const date = exactString(value, "event_date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ReferralInviteInputError("Invalid event_date");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ReferralInviteInputError("Invalid event_date");
  }
  return date;
}

function assertNoDuplicateJsonMembers(text: string): void {
  let index = 0;
  const whitespace = () => { while (/\s/.test(text[index] ?? "")) index += 1; };
  const stringEnd = () => {
    if (text[index] !== '"') throw new SyntaxError();
    index += 1;
    while (index < text.length) {
      if (text[index] === '"') { index += 1; return; }
      if (text[index] === "\\") {
        index += 1;
        if (text[index] === "u") index += 5;
        else index += 1;
      } else index += 1;
    }
    throw new SyntaxError();
  };
  const value = (): void => {
    whitespace();
    if (text[index] === "{") {
      index += 1;
      const keys = new Set<string>();
      whitespace();
      if (text[index] === "}") { index += 1; return; }
      while (true) {
        whitespace();
        const start = index;
        stringEnd();
        const key = JSON.parse(text.slice(start, index)) as string;
        if (keys.has(key)) throw new ReferralInviteInputError(`Duplicate JSON member: ${key}`);
        keys.add(key);
        whitespace();
        if (text[index] !== ":") throw new SyntaxError();
        index += 1;
        value();
        whitespace();
        if (text[index] === "}") { index += 1; return; }
        if (text[index] !== ",") throw new SyntaxError();
        index += 1;
      }
    }
    if (text[index] === "[") {
      index += 1;
      whitespace();
      if (text[index] === "]") { index += 1; return; }
      while (true) {
        value();
        whitespace();
        if (text[index] === "]") { index += 1; return; }
        if (text[index] !== ",") throw new SyntaxError();
        index += 1;
      }
    }
    if (text[index] === '"') { stringEnd(); return; }
    const token = text.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
    if (!token) throw new SyntaxError();
    index += token.length;
  };
  value();
  whitespace();
  if (index !== text.length) throw new SyntaxError();
}

export function agentBearerAuthorized(authorization: string | null, expected: string | undefined): boolean {
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  const expectedDigest = createHash("sha256").update(expected ?? "").digest();
  return Boolean(expected && authorization?.startsWith("Bearer ") && timingSafeEqual(suppliedDigest, expectedDigest));
}

export function referralInviteId(email: string, eventDate: string): string {
  const chars = createHash("sha256").update(`referral-party\0${email}\0${eventDate}`).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseInviteCompletion(value: unknown): InviteCompletion {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ReferralInviteInputError("JSON object required");
  }
  const input = value as Record<string, unknown>;
  const status = input.status;
  if (status !== "invited" && status !== "failed") throw new ReferralInviteInputError("Invalid status");
  const allowed = status === "invited"
    ? new Set(["id", "status", "actual_event_id"])
    : new Set(["id", "status"]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new ReferralInviteInputError(`Unknown field: ${key}`);
  const id = exactString(input.id, "id", 36);
  if (!UUID_RE.test(id)) throw new ReferralInviteInputError("Invalid id");
  if (status === "failed") return { id, status };
  const actualEventId = exactString(input.actual_event_id, "actual_event_id", 1024);
  if (!EVENT_ID_RE.test(actualEventId)) throw new ReferralInviteInputError("Invalid actual_event_id");
  return { id, status, actual_event_id: actualEventId };
}

export async function readBoundedReferralInviteJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_REFERRAL_INVITE_BODY_BYTES) {
    throw new ReferralInviteInputError("Request body too large", 413);
  }
  if (!req.body) throw new ReferralInviteInputError("JSON body required");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REFERRAL_INVITE_BODY_BYTES) {
      await reader.cancel();
      throw new ReferralInviteInputError("Request body too large", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assertNoDuplicateJsonMembers(text);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ReferralInviteInputError) throw error;
    throw new ReferralInviteInputError("Valid UTF-8 JSON body required");
  }
}

export async function readInviteCompletionBody(req: Request): Promise<InviteCompletion> {
  return parseInviteCompletion(await readBoundedReferralInviteJson(req));
}

export function projectQueuedInvite(value: unknown): QueuedReferralInvite {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid queued invite row");
  const row = value as Record<string, unknown>;
  const id = exactString(row.id, "id", 36);
  if (!UUID_RE.test(id)) throw new Error("Invalid id");
  if (row.status !== "queued") throw new Error("Invalid status");
  const email = exactString(row.email, "email", 254).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Invalid email");
  const leadId = row.lead_id === null ? null : exactString(row.lead_id, "lead_id", 200);
  const name = row.name === null ? null : exactString(row.name, "name", 200);
  const eventDate = validDateOnly(row.event_date);
  const createdAt = exactString(row.created_at, "created_at", 64);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("Invalid created_at");
  const eventId = row.event_id === null ? null : exactString(row.event_id, "event_id", 1024);
  if (eventId !== null && !EVENT_ID_RE.test(eventId)) throw new Error("Invalid event_id");
  return { id, lead_id: leadId, name, email, event_date: eventDate, status: "queued", created_at: createdAt, event_id: eventId };
}
