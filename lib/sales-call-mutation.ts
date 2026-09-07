import type { SalesCall } from "./supabase-calls";

export const SALES_CALL_BODY_LIMIT = 64 * 1024;
const RESULTS = new Set(["✅ Sale", "📣 Follow Up", "🔜 Upcoming", "❌ Did Not Close", "👻 No Show", "➖ Other"]);
const CALL_TYPES = new Set(["📞 Sales Call", "🔍 Triage Call", "🤙 Connection Call", "🧑‍💼 Client Call", "🤝 Partnership Call", "🎓 Coaching Call", "🤝 JV Call", "👥 Group Call"]);
const QUALITIES = new Set(["🔥 High", "👌 Medium", "❄️ Low"]);
const FOLLOW_UP_STATUSES = new Set(["🚀 Rebook", "💳 Payment Link Sent", "📣 Sent Message", "✅ Closed", "❌ Lost"]);
const STRING_FIELDS = new Set(["name", "call_date", "booking_source", "set_by", "confirmed", "phone", "email", "ghl_contact_id", "ghl_url", "call_notes", "recording_url", "fathom_call_id", "ai_summary", "objections_notes", "offer", "offer_brief_id", "enrollment_date", "follow_up_by", "follow_up_date", "follow_up_notes", "booking_date", "sales_call_by"]);
const BOOLEAN_FIELDS = new Set(["success", "showed", "offer_made"]);
const NUMBER_FIELDS = new Set(["cc_upfront", "deal_amount", "new_revenue", "follow_up_count", "monthly_revenue"]);
const ENUM_FIELDS: Record<string, Set<string>> = { result: RESULTS, call_type: CALL_TYPES, prospect_quality: QUALITIES, follow_up_status: FOLLOW_UP_STATUSES };
const MUTABLE_FIELDS = new Set([...STRING_FIELDS, ...BOOLEAN_FIELDS, ...NUMBER_FIELDS, ...Object.keys(ENUM_FIELDS), "objections"]);
const NON_NULLABLE_FIELDS = new Set(["name", "objections", "offer_made"]);
const URL_FIELDS = new Set(["ghl_url", "recording_url"]);

export class MutationInputError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
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
        if (keys.has(key)) throw new MutationInputError(`Duplicate JSON member: ${key}`);
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

export async function readBoundedJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > SALES_CALL_BODY_LIMIT) throw new MutationInputError("Request body too large", 413);
  if (!req.body) throw new MutationInputError("JSON body required");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > SALES_CALL_BODY_LIMIT) { await reader.cancel(); throw new MutationInputError("Request body too large", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assertNoDuplicateJsonMembers(text);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof MutationInputError) throw error;
    throw new MutationInputError("Valid UTF-8 JSON body required");
  }
}

function validateValue(key: string, value: unknown): unknown {
  if (value === null) {
    if (NON_NULLABLE_FIELDS.has(key)) throw new MutationInputError(`Invalid ${key}`);
    return null;
  }
  if (STRING_FIELDS.has(key)) {
    if (typeof value !== "string" || value.length > 10_000) throw new MutationInputError(`Invalid ${key}`);
    if ((key === "call_notes" || key === "follow_up_notes") && value.normalize("NFKC").toLowerCase().includes("[[salesos-booked-view:")) {
      throw new MutationInputError(`Invalid ${key}`);
    }
    if (["name", "email", "phone", "ghl_contact_id", "fathom_call_id", "offer_brief_id"].includes(key) && value.length > 500) throw new MutationInputError(`Invalid ${key}`);
    if (URL_FIELDS.has(key) && value) { let url: URL; try { url = new URL(value); } catch { throw new MutationInputError(`Invalid ${key}`); } if (!new Set(["http:", "https:"]).has(url.protocol)) throw new MutationInputError(`Invalid ${key}`); }
    return value;
  }
  if (BOOLEAN_FIELDS.has(key)) { if (typeof value !== "boolean") throw new MutationInputError(`Invalid ${key}`); return value; }
  if (NUMBER_FIELDS.has(key)) { if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000) throw new MutationInputError(`Invalid ${key}`); return value; }
  if (key === "objections") {
    if (!Array.isArray(value) || value.length > 50 || value.some((item) => typeof item !== "string" || item.length > 500)) throw new MutationInputError("Invalid objections");
    return value;
  }
  const allowed = ENUM_FIELDS[key];
  if (allowed) { if (typeof value !== "string" || !allowed.has(value)) throw new MutationInputError(`Invalid ${key}`); return value; }
  throw new MutationInputError(`Unknown field: ${key}`);
}

export type BookedViewAction = {
  action: "move_off" | "restore";
  expectedUpdatedAt: string;
  revision?: string;
};

function boundedToken(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new MutationInputError(`Invalid ${field}`);
  }
  return value;
}

export function parseSalesCallDelete(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new MutationInputError("JSON object required");
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "id") throw new MutationInputError(keys.some((key) => key !== "id") ? `Unknown field: ${keys.find((key) => key !== "id")}` : "id required");
  return boundedToken(input.id, "id", 200);
}

export function parseSalesCallMutation(value: unknown, method: "POST" | "PATCH"): { id?: string; fields: Partial<SalesCall>; bookedViewAction?: BookedViewAction } {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new MutationInputError("JSON object required");
  const input = value as Record<string, unknown>;
  const isAction = method === "PATCH" && Object.hasOwn(input, "booked_view_action");
  const allowed = isAction
    ? new Set(["id", "booked_view_action", "expected_updated_at", "booked_view_revision"])
    : new Set(MUTABLE_FIELDS);
  if (method === "PATCH") allowed.add("id");
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new MutationInputError(`Unknown field: ${key}`);
  if (method === "POST") {
    for (const key of NON_NULLABLE_FIELDS) if (!Object.hasOwn(input, key)) throw new MutationInputError(`${key} required`);
  }
  let id: string | undefined;
  if (method === "PATCH") { if (typeof input.id !== "string" || input.id.length < 1 || input.id.length > 200) throw new MutationInputError("Invalid id"); id = input.id; }
  if (isAction) {
    if (input.booked_view_action !== "move_off" && input.booked_view_action !== "restore") throw new MutationInputError("Invalid booked_view_action");
    const expectedUpdatedAt = boundedToken(input.expected_updated_at, "expected_updated_at", 100);
    const revision = input.booked_view_revision === undefined ? undefined : boundedToken(input.booked_view_revision, "booked_view_revision", 100);
    if (input.booked_view_action === "move_off" && revision !== undefined) throw new MutationInputError("Invalid booked_view_revision");
    if (input.booked_view_action === "restore" && !revision) throw new MutationInputError("booked_view_revision required");
    return { id, fields: {}, bookedViewAction: { action: input.booked_view_action, expectedUpdatedAt, revision } };
  }
  const fields: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input)) if (key !== "id") fields[key] = validateValue(key, item);
  if (method === "PATCH" && Object.keys(fields).length === 0) throw new MutationInputError("At least one update field required");
  return { id, fields: fields as Partial<SalesCall> };
}
