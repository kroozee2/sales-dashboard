// Follow-ups: who had a sales call, did not buy, and is still worth a message.
//
// The heat score is deliberately explainable. Every point it awards carries a
// reason in plain language, because a number Andrew cannot interrogate is a
// number he will not trust.

export const FOLLOW_UP_RESULTS = ["📣 Follow Up", "❌ Did Not Close"] as const;

export type SalesCallRow = {
  id: string;
  name: string | null;
  call_date: string | null;
  call_type: string | null;
  result: string | null;
  showed: boolean | null;
  success: boolean | null;
  offer: string | null;
  offer_made: boolean | null;
  deal_amount: number | null;
  prospect_quality: string | null;
  objections: string[] | null;
  objections_notes: string | null;
  call_notes: string | null;
  ai_summary: string | null;
  follow_up_status: string | null;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  recording_url: string | null;
  fathom_call_id: string | null;
  email: string | null;
  phone: string | null;
  ghl_url: string | null;
};

export type HeatReason = { points: number; because: string };
export type ScoredCall = {
  call: SalesCallRow;
  score: number;
  band: "hot" | "warm" | "cool";
  reasons: HeatReason[];
};

/** An objection about timing or hesitation is recoverable. One about fit is not. */
const OBJECTION_WEIGHT: Array<{ match: RegExp; points: number; because: string }> = [
  { match: /timing|not right now|too busy/i, points: 12, because: "The objection was timing, not fit" },
  { match: /think about it/i, points: 12, because: "They wanted to think, so the door is open" },
  { match: /spouse|partner/i, points: 10, because: "They needed a partner conversation, not convincing" },
  { match: /more information/i, points: 10, because: "They asked for more information" },
  { match: /price|afford/i, points: 6, because: "Price was the blocker, so a lower-friction offer may fit" },
  { match: /not sure it will work/i, points: 5, because: "They doubted it would work for them" },
  { match: /already working with/i, points: 0, because: "They are committed elsewhere" },
];

function daysSince(date: string | null, now: Date): number | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return null;
  const startOfDay = (value: Date) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.round((startOfDay(now) - startOfDay(parsed)) / 86_400_000);
}

/**
 * Whether a call belongs on the follow-up board at all. Closed deals and
 * no-shows are out: one needs nothing, the other never had a conversation.
 */
export function needsFollowUp(call: SalesCallRow): boolean {
  if (call.success === true) return false;
  const result = (call.result ?? "").trim();
  if (/sale|completed/i.test(result)) return false;
  if (/no show/i.test(result)) return false;
  if (/upcoming/i.test(result)) return false;

  // `showed` is not maintained reliably — it reads false on calls that plainly
  // happened — so a recorded outcome outranks it. Only when there is no outcome
  // at all do we need other evidence that a conversation took place.
  if (result) return true;
  return Boolean(
    (call.ai_summary ?? "").trim() ||
    (call.call_notes ?? "").trim() ||
    call.recording_url ||
    call.fathom_call_id,
  );
}

/**
 * One person, one row. A prospect called twice is one follow-up, and the live
 * one is the most recent conversation.
 */
export function dedupeByPerson(scored: ScoredCall[]): ScoredCall[] {
  const seen = new Map<string, ScoredCall>();
  for (const entry of scored) {
    const key = (entry.call.email?.trim().toLowerCase() || entry.call.name?.trim().toLowerCase() || entry.call.id);
    const existing = seen.get(key);
    if (!existing) { seen.set(key, entry); continue; }
    const newer = (Date.parse(entry.call.call_date ?? "") || 0) > (Date.parse(existing.call.call_date ?? "") || 0);
    if (newer) seen.set(key, entry);
  }
  return [...seen.values()];
}

export function scoreCall(call: SalesCallRow, now = new Date()): ScoredCall {
  const reasons: HeatReason[] = [];
  const add = (points: number, because: string) => {
    if (points > 0) reasons.push({ points, because });
  };

  if (call.showed === true) add(15, "They showed up to the call");
  if (call.offer_made === true) add(15, "They heard the full offer");

  if (call.result === "📣 Follow Up") add(25, "The call ended asking for a follow-up");
  else if (call.result === "❌ Did Not Close") add(5, "They said no on the call");

  if (typeof call.deal_amount === "number" && call.deal_amount > 0) {
    add(10, `A $${call.deal_amount.toLocaleString()} deal was on the table`);
  }

  const objections = call.objections ?? [];
  const best = objections
    .map((objection) => OBJECTION_WEIGHT.find((entry) => entry.match.test(objection)))
    .filter((entry): entry is (typeof OBJECTION_WEIGHT)[number] => Boolean(entry))
    .sort((a, b) => b.points - a.points)[0];
  if (best) add(best.points, best.because);

  const age = daysSince(call.call_date, now);
  if (age !== null && age >= 0) {
    if (age <= 3) add(20, age === 0 ? "The call was today" : `The call was ${age} day${age === 1 ? "" : "s"} ago`);
    else if (age <= 14) add(12, `The call was ${age} days ago, still fresh`);
    else if (age <= 30) add(6, `The call was ${age} days ago`);
  }

  const due = daysSince(call.follow_up_date, now);
  if (due !== null && due >= 0) add(12, "The follow-up date has arrived");

  if (call.prospect_quality && /high|hot|a\b|great/i.test(call.prospect_quality)) {
    add(10, `Marked ${call.prospect_quality.trim()} when booked`);
  }

  const score = Math.min(100, reasons.reduce((total, reason) => total + reason.points, 0));
  const band = score >= 60 ? "hot" : score >= 35 ? "warm" : "cool";
  return { call, score, band, reasons: reasons.sort((a, b) => b.points - a.points) };
}

export function rankFollowUps(calls: SalesCallRow[], now = new Date()): ScoredCall[] {
  return dedupeByPerson(calls.filter(needsFollowUp).map((call) => scoreCall(call, now)))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const left = Date.parse(a.call.call_date ?? "") || 0;
      const right = Date.parse(b.call.call_date ?? "") || 0;
      return right - left;
    });
}

// ---------------------------------------------------------------------------
// Extracted intel
// ---------------------------------------------------------------------------

export const INTEL_FIELDS = ["pains", "goals", "challenges", "wants", "objections"] as const;
export type IntelField = (typeof INTEL_FIELDS)[number];

/** Where the intel came from. A guess from thin notes must never look like a transcript. */
export const INTEL_SOURCES = ["recording", "notes", "none"] as const;
export type IntelSource = (typeof INTEL_SOURCES)[number];

export type CallIntel = {
  pains: string[];
  goals: string[];
  challenges: string[];
  wants: string[];
  objections: string[];
  in_their_words: string[];
  source: IntelSource;
  confidence: "high" | "medium" | "low";
};

const MAX_ITEMS = 8;
const MAX_ITEM_LENGTH = 300;

function cleanList(value: unknown, field: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const items = value
    .map((item) => {
      if (typeof item !== "string") throw new Error(`${field} must contain strings`);
      return item.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .map((item) => (item.length > MAX_ITEM_LENGTH ? `${item.slice(0, MAX_ITEM_LENGTH - 1)}…` : item));
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_ITEMS);
}

/**
 * Validates what the model returned. Anything malformed becomes an empty list
 * rather than throwing, so one bad field cannot cost Andrew the whole readout —
 * but the shape itself is still enforced.
 */
export function parseCallIntel(value: unknown, source: IntelSource): CallIntel {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Intel must be an object");
  const record = value as Record<string, unknown>;
  const intel: CallIntel = {
    pains: cleanList(record.pains, "pains"),
    goals: cleanList(record.goals, "goals"),
    challenges: cleanList(record.challenges, "challenges"),
    wants: cleanList(record.wants, "wants"),
    objections: cleanList(record.objections, "objections"),
    in_their_words: cleanList(record.in_their_words, "in_their_words"),
    source,
    confidence: "low",
  };
  const filled = INTEL_FIELDS.reduce((count, field) => count + (intel[field].length ? 1 : 0), 0);
  // Confidence describes how much was actually recoverable, not how sure the
  // model sounded. A transcript that yielded four of five sections is strong;
  // two lines of typed notes never is.
  if (source === "recording" && filled >= 4) intel.confidence = "high";
  else if (filled >= 3) intel.confidence = "medium";
  return intel;
}

export function isIntelEmpty(intel: CallIntel): boolean {
  return INTEL_FIELDS.every((field) => intel[field].length === 0);
}

/**
 * The Fathom recording id for a call, from the linked id or from a pasted
 * fathom.video URL — most rows were filled in by hand and only have the URL.
 */
export function fathomRecordingId(call: Pick<SalesCallRow, "fathom_call_id" | "recording_url">): number | null {
  const direct = Number(call.fathom_call_id);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const url = call.recording_url ?? "";
  const match = /fathom\.video\/(?:calls|share)\/(\d+)/i.exec(url);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** What we can honestly say we have for this call, before spending an AI call. */
export function intelSourceFor(call: SalesCallRow): IntelSource {
  if (call.fathom_call_id || (call.recording_url && /fathom\.video/i.test(call.recording_url))) return "recording";
  if ((call.ai_summary ?? "").trim() || (call.call_notes ?? "").trim()) return "notes";
  return "none";
}
