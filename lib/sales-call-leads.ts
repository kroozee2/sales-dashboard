export type SalesCallLeadFields = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  call_type?: string | null;
  call_date?: string | null;
  confirmed?: string | null;
  result?: string | null;
  showed?: boolean | null;
  offer?: string | null;
  deal_amount?: number | null;
  follow_up_status?: string | null;
  follow_up_date?: string | null;
  follow_up_notes?: string | null;
  updated_at?: string;
  booked_view_moved_off?: boolean;
  booked_view_revision?: string;
};

export type LeadCandidate = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  prospect_stage?: string | null;
  notes?: string | null;
};

type LeadLookup = {
  byEmail: (email: string) => Promise<LeadCandidate[]>;
  byPhone: (lastTenDigits: string) => Promise<LeadCandidate[]>;
  byName: (name: string) => Promise<LeadCandidate[]>;
};

export type LeadMatch =
  | { status: "matched"; method: "email" | "phone" | "name"; lead: LeadCandidate }
  | { status: "ambiguous"; method: "email" | "phone" | "name"; count: number }
  | { status: "unmatched" };

export type LeadCallUpdates = {
  prospect_stage?: string;
  notes?: string;
  last_update: string;
};

const UPCOMING_RESULT = "🔜 Upcoming";
const STAGE_RANK: Record<string, number> = {
  "👨 Prospect": 0,
  "📣 Reached Out": 1,
  "📞 Call Booked": 2,
  "🔥 Hot Prospect": 3,
  "🔗 Pay Link Sent": 4,
  "🏦 Payment Received": 5,
};

function normalizedEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizedPhone(value: string | null | undefined): string {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function normalizedName(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function uniqueMatch(
  candidates: LeadCandidate[],
  method: "email" | "phone" | "name",
  expected: string,
): LeadMatch | null {
  const matches = candidates.filter((lead) => {
    if (method === "email") return normalizedEmail(lead.email) === expected;
    if (method === "phone") return normalizedPhone(lead.phone) === expected;
    return normalizedName(lead.full_name) === expected.toLowerCase();
  });
  if (matches.length > 1) return { status: "ambiguous", method, count: matches.length };
  if (matches.length === 1) return { status: "matched", method, lead: matches[0] };
  return null;
}

export async function findLeadForCall(call: SalesCallLeadFields, lookup: LeadLookup): Promise<LeadMatch> {
  const email = normalizedEmail(call.email);
  if (email) {
    const result = uniqueMatch(await lookup.byEmail(email), "email", email);
    if (result) return result;
  }

  const phone = normalizedPhone(call.phone);
  if (phone) {
    const result = uniqueMatch(await lookup.byPhone(phone), "phone", phone);
    if (result) return result;
  }

  const name = call.name?.trim().replace(/\s+/g, " ") ?? "";
  if (name) {
    const result = uniqueMatch(await lookup.byName(name), "name", name);
    if (result) return result;
  }

  return { status: "unmatched" };
}

function isFutureCallDate(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  if (!value.includes("T")) return value >= now.toISOString().slice(0, 10);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function shouldOpenSalesCallRow(event: { key: string; target: EventTarget | null; currentTarget: EventTarget | null }): boolean {
  return event.target === event.currentTarget && (event.key === "Enter" || event.key === " ");
}

export type SalesCallViewState = "booked" | "moved-off" | "completed" | "past" | "ineligible";

export function callViewState(call: SalesCallLeadFields, now = new Date()): SalesCallViewState {
  if (call.call_type !== "📞 Sales Call" || call.confirmed !== "✅ Confirmed") return "ineligible";
  if (call.booked_view_moved_off === true) return "moved-off";
  if (call.result && call.result !== UPCOMING_RESULT) return "completed";
  return isFutureCallDate(call.call_date, now) ? "booked" : "past";
}

export function isBookedSalesCall(call: SalesCallLeadFields, now = new Date()): boolean {
  return callViewState(call, now) === "booked"
    && call.call_type === "📞 Sales Call"
    && call.confirmed === "✅ Confirmed"
    && isFutureCallDate(call.call_date, now)
    && (!call.result || call.result === UPCOMING_RESULT);
}

export function bookedSalesCalls<T extends SalesCallLeadFields>(calls: T[], now = new Date()): T[] {
  return calls.filter((call) => isBookedSalesCall(call, now));
}

export function leadStageForCall(call: SalesCallLeadFields, now = new Date()): string | null {
  if (isBookedSalesCall(call, now)) return "📞 Call Booked";
  if (call.showed !== true) return null;
  if (call.result === "📣 Follow Up") return "🔥 Hot Prospect";
  if (call.result === "✅ Sale") return "🔗 Pay Link Sent";
  return null;
}

export function leadUpdatesForCall(
  previousCall: SalesCallLeadFields | null,
  nextCall: SalesCallLeadFields,
  lead: LeadCandidate,
  now = new Date(),
): LeadCallUpdates | null {
  const updates: Partial<LeadCallUpdates> = {};
  const nextStage = leadStageForCall(nextCall, now);
  const currentStageRank = STAGE_RANK[lead.prospect_stage ?? ""];
  if (nextStage && currentStageRank !== undefined && STAGE_RANK[nextStage] > currentStageRank) {
    updates.prospect_stage = nextStage;
  }

  const attendanceRecorded = nextCall.showed === true || (nextCall.showed === false && nextCall.result === "👻 No Show");
  const noteMarker = nextCall.result ? `[sales-call:${nextCall.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 200)}:${nextCall.result}]` : "";
  if (attendanceRecorded && nextCall.result && nextCall.result !== UPCOMING_RESULT && !lead.notes?.includes(noteMarker)) {
    const date = (nextCall.call_date ?? now.toISOString()).slice(0, 10);
    const recap = [
      `${date} - Sales call: ${nextCall.result} ${noteMarker}`,
      nextCall.deal_amount ? `$${nextCall.deal_amount.toLocaleString()}` : null,
      nextCall.offer || null,
      nextCall.follow_up_date ? `follow up ${nextCall.follow_up_date}` : null,
      nextCall.follow_up_notes || null,
    ].filter(Boolean).join(" · ");
    updates.notes = `${recap}\n\n${lead.notes ?? ""}`.trim();
  }

  if (!updates.prospect_stage && updates.notes === undefined) return null;
  return { ...updates, last_update: now.toISOString() } as LeadCallUpdates;
}


export async function persistLeadUpdateWithCas(
  previousCall: SalesCallLeadFields | null,
  nextCall: SalesCallLeadFields,
  load: () => Promise<LeadCandidate>,
  compareAndSet: (expected: LeadCandidate, updates: LeadCallUpdates) => Promise<LeadCandidate | null>,
  now = new Date(),
): Promise<{ status: "updated" | "unchanged"; lead: LeadCandidate }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const lead = await load();
    const updates = leadUpdatesForCall(previousCall, nextCall, lead, now);
    if (!updates) return { status: "unchanged", lead };
    const saved = await compareAndSet(lead, updates);
    if (saved) return { status: "updated", lead: saved };
  }
  throw new Error("Lead changed concurrently; retry limit reached");
}
