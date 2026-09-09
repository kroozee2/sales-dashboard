// The Sales OS side of a client record: the onboarding runbook, and the shape
// the client screens read.
//
// This file used to describe a second table. Helm answered over a GET-only
// proxy, so Sales OS kept its own `client_accounts` row for deal value, MRR,
// owner and onboarding, and merged the two on read. That gave every client two
// rows, and an edit in one place never reached the other.
//
// Sales OS now reads and writes Helm's `clients` table directly (see
// lib/helm-clients.ts), so there is one row per client and the merge is gone.

export type OnboardingStepKey =
  | "payment" | "fam" | "call" | "graphic" | "posted" | "portal" | "calls";

export interface RunbookStep {
  key: OnboardingStepKey;
  emoji: string;
  label: string;
  detail: string;
}

/**
 * The runbook, modelled on Helm's but written for what actually has to happen
 * the week someone signs. Order is the order you do them in.
 */
export const RUNBOOK: RunbookStep[] = [
  { key: "payment", emoji: "💰", label: "Payment recorded", detail: "Deal value and what recurs are on the record." },
  { key: "fam", emoji: "🎉", label: "In the Fam chat", detail: "Added to the 7-Figure CEO Fam WhatsApp community." },
  { key: "call", emoji: "📅", label: "Onboarding call booked", detail: "A time in the calendar, and the invite sent." },
  { key: "graphic", emoji: "🎨", label: "Welcome graphic made", detail: "Built in the Graphics Studio with their name on it." },
  { key: "posted", emoji: "📣", label: "Welcome posted", detail: "Announced in the community so the room knows them." },
  { key: "portal", emoji: "🔑", label: "Portal login sent", detail: "Mastermind app access, where everything else lives." },
  { key: "calls", emoji: "🗓️", label: "On the recurring calls", detail: "Invited to the weekly coaching calls." },
];

export const RUNBOOK_KEYS = RUNBOOK.map((step) => step.key);

export type StepState = { done: boolean; at?: string | null; note?: string | null };
export type OnboardingState = Partial<Record<OnboardingStepKey, StepState>>;

/**
 * The status vocabulary, exactly as it is stored.
 *
 * These strings carry their emoji because that is what is in the column and
 * what Helm's own screens filter on. Writing a tidier "Off-Track" from here
 * would quietly create a second vocabulary in the same column and drop the
 * client out of Helm's filters.
 */
export const CLIENT_STATUSES = [
  "\u{1F195} Not Started",
  "\u{1F4C6} Onboarding Booked",
  "\u{1F680} On-Track",
  "\u{1F68A} Off-Track",
  "\u274C At Risk",
  "\u{1F44B} Off-Boarded",
] as const;

/** What "remove from the roster" sets. Off-boarding, never deletion. */
export const OFF_BOARDED_STATUS = "\u{1F44B} Off-Boarded";

export function isRunbookKey(value: unknown): value is OnboardingStepKey {
  return typeof value === "string" && (RUNBOOK_KEYS as string[]).includes(value);
}

/** How many steps are done, and the share of the runbook that represents. */
export function onboardingProgress(state: OnboardingState | null | undefined) {
  const done = RUNBOOK.filter((step) => state?.[step.key]?.done === true).length;
  return { done, total: RUNBOOK.length, pct: Math.round((done / RUNBOOK.length) * 100) };
}

/** The next thing to do, or null when the runbook is finished. */
export function nextRunbookStep(state: OnboardingState | null | undefined): RunbookStep | null {
  return RUNBOOK.find((step) => state?.[step.key]?.done !== true) ?? null;
}

/**
 * Ticking a step stamps when it happened, so "done" always carries a date.
 * Unticking clears the stamp rather than leaving a misleading one behind.
 */
export function applyStep(
  state: OnboardingState,
  key: OnboardingStepKey,
  patch: { done?: boolean; note?: string | null },
  now = new Date(),
): OnboardingState {
  const current = state[key] ?? { done: false };
  const done = patch.done === undefined ? current.done : patch.done;
  return {
    ...state,
    [key]: {
      done,
      at: done ? (current.done && current.at ? current.at : now.toISOString()) : null,
      note: patch.note === undefined ? (current.note ?? null) : patch.note,
    },
  };
}

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** One client, as every client screen reads them. `key` is the client's id. */
export interface MergedClient {
  key: string;
  accountId: string | null;
  helmId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  program: string | null;
  status: string | null;
  owner: string;
  dealValue: number | null;
  mrr: number | null;
  startDate: string | null;
  addedAt: string | null;
  notes: string | null;
  whatsapp: string | null;
  onboarding: OnboardingState;
  /** Fields the fulfilment side fills in: attendance, portal, contact history. */
  helm: {
    membership: string | null;
    isActive: boolean;
    lastContactAt: string | null;
    portalStatus: string | null;
    callsAttended: number | null;
    headshotUrl: string | null;
  } | null;
  /** Always true now. Kept so screens can still ask before offering an edit. */
  editable: boolean;
}

/** Newest first, by when we started with them; unknown dates sink. */
export function sortByNewest(clients: MergedClient[]): MergedClient[] {
  const when = (c: MergedClient) => c.startDate ?? (c.addedAt ? c.addedAt.slice(0, 10) : "");
  return [...clients].sort((a, b) => {
    const av = when(a);
    const bv = when(b);
    if (!av && !bv) return a.name.localeCompare(b.name);
    if (!av) return 1;
    if (!bv) return -1;
    return bv.localeCompare(av);
  });
}

/** Everyone who started within `days`, newest first. */
export function recentClients(clients: MergedClient[], days = 60, now = new Date()): MergedClient[] {
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return sortByNewest(clients).filter((client) => {
    const when = client.startDate ?? (client.addedAt ? client.addedAt.slice(0, 10) : "");
    return Boolean(when) && when >= cutoff;
  });
}
