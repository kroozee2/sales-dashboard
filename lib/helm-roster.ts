// The clients dashboard and calendar, built from Helm's database.
//
// These numbers used to arrive over an HTTP proxy that Sales OS could only GET.
// The proxy was never configured in production, so the whole Clients section
// showed "Client data connection is not configured" and every client read as
// read-only. They are computed here instead, from the same rows the roster
// edits, so the tiles and the list can never disagree.

import type { CalendarEvent, ClientsPayload } from "@/lib/clients";
import { shapeCheckIns, type CheckInRecord } from "./client-detail.ts";
import {
  averageNps, checkInCompliance, contactRecency, monthlySeries,
  type Compliance, type MonthPoint, type RecencyBand,
} from "./client-dashboard.ts";
import { toMergedClient, type HelmClientRow } from "./helm-clients.ts";
import {
  EMPTY_CASH, buildMemberCash, memberStage,
  type CashGoalRow, type MemberStage,
} from "./member-numbers.ts";

export type PortalRow = { client_id: string | null; last_login_at: string | null };
export type CheckInRow = Record<string, unknown> & { client_id?: string | null };

/** The money picture, which is what Helm's Dashboards is for. */
export type GrowthPayload = {
  months: MonthPoint[];
  compliance: Compliance;
  recency: RecencyBand[];
  averageNps: number | null;
};
export type CallRow = {
  id: string; title: string | null; client_id: string | null; call_date: string | null;
  starts_at: string | null; is_group: boolean | null; status: string | null;
  attended: number | null; attendee_name: string | null;
};

const DAY = 86_400_000;
const OVERDUE_DAYS = 14;

const has = (value: string | null, ...needles: string[]) => {
  const key = (value ?? "").toLowerCase();
  return needles.some((needle) => key.includes(needle));
};

export const isOnboarding = (status: string | null) => has(status, "onboard", "not started");
export const isAtRisk = (status: string | null) => has(status, "risk");
export const isOffTrack = (status: string | null) => has(status, "off-track", "off track");
export const isOffBoarded = (status: string | null) => has(status, "off-board", "offboard");

/** Days since anyone spoke to them, or null when nobody ever has. */
export function daysSinceContact(at: string | null, now: number): number | null {
  if (!at) return null;
  const when = Date.parse(at);
  return Number.isNaN(when) ? null : Math.floor((now - when) / DAY);
}

/**
 * Why a client needs attention, in the words you would use out loud. A client
 * with no reason is not listed: an attention list that includes everyone tells
 * you nothing.
 */
export function attentionReasons(row: HelmClientRow, now: number): string[] {
  const reasons: string[] = [];
  if (isAtRisk(row.status)) reasons.push("Marked at risk");
  if (isOffTrack(row.status)) reasons.push("Off-track");
  const gap = daysSinceContact(row.last_contact_at, now);
  if (gap === null) reasons.push("No contact ever logged");
  else if (gap >= OVERDUE_DAYS) reasons.push(`${gap} days since last contact`);
  return reasons;
}

/** Cash, revenue, NPS and discipline, from the check-ins the clients filed. */
export function buildGrowth(
  rows: HelmClientRow[],
  checkInRows: CheckInRow[],
  now = new Date(),
): GrowthPayload {
  const stamp = now.getTime();
  const live = rows.filter((row) => row.is_active !== false && !isOffBoarded(row.status));

  const rawByClient = new Map<string, CheckInRow[]>();
  for (const row of checkInRows) {
    const id = typeof row.client_id === "string" ? row.client_id : null;
    if (!id) continue;
    rawByClient.set(id, [...(rawByClient.get(id) ?? []), row]);
  }
  const byClient = new Map<string, CheckInRecord[]>(
    [...rawByClient].map(([id, list]) => [id, shapeCheckIns(list)]),
  );

  const activeIds = live.map((row) => row.id);
  return {
    months: monthlySeries(shapeCheckIns(checkInRows), 12, now),
    compliance: checkInCompliance(activeIds, byClient, now),
    recency: contactRecency(live.map((row) => daysSinceContact(row.last_contact_at, stamp))),
    averageNps: averageNps(byClient, activeIds),
  };
}

export function buildClientsPayload(
  rows: HelmClientRow[],
  portal: PortalRow[],
  calls: CallRow[],
  openTickets: number,
  now = new Date(),
  /**
   * The numbers members set for themselves in the Mastermind Portal. Optional
   * so a Helm-only caller keeps working; members simply carry no cash then.
   */
  cashGoals: CashGoalRow[] = [],
  checkIns: CheckInRow[] = [],
): ClientsPayload {
  const stamp = now.getTime();
  // Off-boarded clients are history, not roster. Every count below is of people
  // we are actually serving right now.
  const live = rows.filter((row) => row.is_active !== false && !isOffBoarded(row.status));

  const portalByClient = new Map<string, PortalRow>();
  for (const account of portal) if (account.client_id) portalByClient.set(account.client_id, account);

  // This calendar month, from the same clock the rest of the payload uses.
  const cashByClient = buildMemberCash(cashGoals, checkIns, now.getFullYear(), now.getMonth() + 1);

  const nameById = new Map(rows.map((row) => [row.id, row.name ?? "Client"]));

  const calendar: CalendarEvent[] = calls
    .filter((call) => call.call_date)
    .map((call) => ({
      id: `helm-call:${call.id}`,
      title: call.title ?? (call.is_group ? "Group call" : "1:1 call"),
      clientId: call.client_id,
      clientName: call.client_id ? nameById.get(call.client_id) ?? call.attendee_name : call.attendee_name,
      startsAt: call.starts_at,
      callDate: String(call.call_date).slice(0, 10),
      isGroup: call.is_group === true,
      status: call.status,
      source: "helm",
    }));

  const attention = live
    .map((row) => ({ row, reasons: attentionReasons(row, stamp) }))
    .filter((entry) => entry.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length || (a.row.name ?? "").localeCompare(b.row.name ?? ""))
    .slice(0, 12)
    .map(({ row, reasons }) => ({
      id: row.id,
      name: row.name ?? "Client",
      status: row.status,
      membership: row.membership,
      lastContactAt: row.last_contact_at,
      daysSinceContact: daysSinceContact(row.last_contact_at, stamp),
      reasons,
      nextAction: row.ai_next_action,
    }));

  const upcoming7Days = calendar.filter((event) => {
    const when = event.startsAt ? Date.parse(event.startsAt) : Date.parse(`${event.callDate}T12:00:00Z`);
    return !Number.isNaN(when) && when >= stamp && when <= stamp + 7 * DAY;
  }).length;

  const portalStates = live.map((row) => portalByClient.get(row.id));

  return {
    generatedAt: now.toISOString(),
    dashboard: {
      activeClients: live.length,
      onboarding: live.filter((row) => isOnboarding(row.status)).length,
      atRisk: live.filter((row) => isAtRisk(row.status)).length,
      offTrack: live.filter((row) => isOffTrack(row.status)).length,
      overdueContact: live.filter((row) => {
        const gap = daysSinceContact(row.last_contact_at, stamp);
        return gap === null || gap >= OVERDUE_DAYS;
      }).length,
      portalActive: portalStates.filter((account) => account?.last_login_at).length,
      portalInvited: portalStates.filter((account) => account && !account.last_login_at).length,
      upcoming7Days,
      openSupport: openTickets,
      attention,
    },
    members: rows.map((row) => {
      const account = portalByClient.get(row.id);
      const client = toMergedClient(row);
      const cash = cashByClient.get(row.id) ?? EMPTY_CASH;
      const portalStatus = !account ? "not_invited" : account.last_login_at ? "active" : "invited";
      const stage: MemberStage = memberStage({ status: row.status, isActive: row.is_active ?? false });
      return {
        id: row.id,
        name: client.name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        membership: row.membership,
        isActive: row.is_active ?? false,
        phase: row.phase,
        startDate: row.start_date,
        lastContactAt: row.last_contact_at,
        headshotUrl: row.headshot_url,
        portalStatus,
        stage,
        cash,
        portalLastLogin: account?.last_login_at ?? null,
        callsAttended: calls.filter((call) => call.client_id === row.id && (call.attended ?? 0) > 0).length,
        lastCallAt: null,
        aiNextAction: row.ai_next_action,
      };
    }),
    calendar,
  };
}
