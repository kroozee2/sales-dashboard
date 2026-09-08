// The Sales OS side of a client record, and how it merges onto Helm's roster.
//
// Helm owns fulfilment and answers over a GET-only proxy, which is why every
// client view in Sales OS has been read-only. These are the fields Sales OS is
// responsible for — deal value, who owns the relationship, how far onboarding
// has got — kept in our own table and merged on read. Nothing here writes to
// Helm, and Helm never sees these fields.

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

export interface ClientAccount {
  id: string;
  helm_client_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  program: string | null;
  deal_value: number | null;
  mrr: number | null;
  start_date: string | null;
  status: string;
  owner: string;
  source: string | null;
  whatsapp: string | null;
  notes: string | null;
  onboarding: OnboardingState;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Fields a client may send. Anything else is refused rather than ignored. */
export const EDITABLE_FIELDS = [
  "name", "email", "phone", "program", "deal_value", "mrr", "start_date",
  "status", "owner", "source", "whatsapp", "notes", "helm_client_id", "archived",
] as const;

export const CLIENT_STATUSES = ["Onboarding", "Active", "At Risk", "Off-Track", "Off-boarded"] as const;

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

export interface MergedClient {
  /** Sales OS row id when we have one; otherwise the Helm id, prefixed. */
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
  /** Helm-only fields, still read-only because Helm owns them. */
  helm: {
    membership: string | null;
    isActive: boolean;
    lastContactAt: string | null;
    portalStatus: string | null;
    callsAttended: number | null;
    headshotUrl: string | null;
  } | null;
  /** True when Sales OS has a row to write to. */
  editable: boolean;
}

type HelmMember = {
  id: string; name: string; email: string | null; phone: string | null;
  status: string | null; membership: string | null; isActive: boolean;
  startDate: string | null; lastContactAt: string | null; headshotUrl: string | null;
  portalStatus: string | null; callsAttended: number;
};

/**
 * One list from two sources.
 *
 * A Sales OS row is matched to a Helm member by explicit id first, then by
 * email, then by name — in that order, because each is weaker than the last and
 * matching two different people would be worse than showing one twice.
 * Sales-OS-only rows are included: someone can pay before Helm knows about them.
 */
export function mergeClients(helmMembers: HelmMember[], accounts: ClientAccount[]): MergedClient[] {
  const live = accounts.filter((account) => !account.archived);
  const byHelmId = new Map<string, ClientAccount>();
  const byEmail = new Map<string, ClientAccount>();
  const byName = new Map<string, ClientAccount>();
  for (const account of live) {
    if (account.helm_client_id) byHelmId.set(account.helm_client_id, account);
    if (normalize(account.email)) byEmail.set(normalize(account.email), account);
    if (normalize(account.name)) byName.set(normalize(account.name), account);
  }

  const claimed = new Set<string>();
  const merged: MergedClient[] = helmMembers.map((member) => {
    const account =
      byHelmId.get(member.id) ??
      (normalize(member.email) ? byEmail.get(normalize(member.email)) : undefined) ??
      byName.get(normalize(member.name));
    if (account) claimed.add(account.id);

    return {
      key: account?.id ?? `helm:${member.id}`,
      accountId: account?.id ?? null,
      helmId: member.id,
      name: account?.name || member.name,
      email: account?.email ?? member.email,
      phone: account?.phone ?? member.phone,
      program: account?.program ?? member.membership,
      status: account?.status ?? member.status,
      owner: account?.owner ?? "Andrew",
      dealValue: account?.deal_value ?? null,
      mrr: account?.mrr ?? null,
      startDate: account?.start_date ?? member.startDate,
      addedAt: account?.created_at ?? member.startDate,
      notes: account?.notes ?? null,
      whatsapp: account?.whatsapp ?? null,
      onboarding: account?.onboarding ?? {},
      helm: {
        membership: member.membership,
        isActive: member.isActive,
        lastContactAt: member.lastContactAt,
        portalStatus: member.portalStatus,
        callsAttended: member.callsAttended,
        headshotUrl: member.headshotUrl,
      },
      editable: Boolean(account),
    };
  });

  for (const account of live) {
    if (claimed.has(account.id)) continue;
    merged.push({
      key: account.id,
      accountId: account.id,
      helmId: account.helm_client_id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      program: account.program,
      status: account.status,
      owner: account.owner,
      dealValue: account.deal_value,
      mrr: account.mrr,
      startDate: account.start_date,
      addedAt: account.created_at,
      notes: account.notes,
      whatsapp: account.whatsapp,
      onboarding: account.onboarding ?? {},
      helm: null,
      editable: true,
    });
  }

  return merged;
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
