import type { ActivityRow } from "@/lib/client-activity";
import type { MemberCash, MemberStage } from "@/lib/member-numbers";

export const CLIENT_TABS = ["Dashboard", "New", "Members", "Calendar"] as const;
export type ClientTab = (typeof CLIENT_TABS)[number];
export type MemberFilter = "All active" | "Onboarding" | "At Risk" | "Off-Track" | "Off-boarded";
export type MemberSort = "urgency" | "name" | "last-contact";
export type CalendarFilter = "All" | "1:1" | "Group";

export interface ClientMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  membership: string | null;
  isActive: boolean;
  phase: string | null;
  startDate: string | null;
  lastContactAt: string | null;
  headshotUrl: string | null;
  portalStatus: "not_invited" | "invited" | "active";
  portalLastLogin: string | null;
  callsAttended: number;
  lastCallAt: string | null;
  aiNextAction: string | null;
  /** Where they are in onboarding. Derived on read; see lib/member-numbers. */
  stage: MemberStage;
  /** The cash goals they set in the Mastermind Portal, and this month's actual. */
  cash: MemberCash;
}

export interface ClientAttention {
  id: string;
  name: string;
  status: string | null;
  membership: string | null;
  lastContactAt: string | null;
  daysSinceContact: number | null;
  reasons: string[];
  nextAction: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string | null;
  startsAt: string | null;
  callDate: string;
  isGroup: boolean;
  status: string | null;
  source: string | null;
}

/** The money picture that Helm's Dashboards draws. Absent when unavailable. */
export interface GrowthSummary {
  months: { key: string; label: string; cash: number; newRevenue: number; nps: number | null; checkIns: number }[];
  compliance: { submitted: number; expected: number; pct: number };
  recency: { label: string; count: number; tone: "good" | "watch" | "risk" }[];
  averageNps: number | null;
}

export interface ClientsPayload {
  generatedAt: string;
  growth?: GrowthSummary;
  dashboard: {
    activeClients: number;
    onboarding: number;
    atRisk: number;
    offTrack: number;
    overdueContact: number;
    portalActive: number;
    portalInvited: number;
    upcoming7Days: number;
    openSupport: number;
    attention: ClientAttention[];
  };
  members: ClientMember[];
  /** What clients did in the members app. Newest first. */
  activity?: ActivityRow[];
  calendar: CalendarEvent[];
}

function statusKey(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function statusMatches(member: ClientMember, filter: MemberFilter): boolean {
  const status = statusKey(member.status);
  if (filter === "All active") return member.isActive && !status.includes("offboarded");
  if (filter === "Off-boarded") return !member.isActive || status.includes("offboarded");
  if (filter === "Onboarding") return status.includes("onboarding") || status.includes("notstarted");
  if (filter === "At Risk") return status.includes("atrisk");
  return status.includes("offtrack");
}

export function contactAgeDays(member: Pick<ClientMember, "lastContactAt">, now = new Date()): number | null {
  if (!member.lastContactAt) return null;
  const timestamp = Date.parse(member.lastContactAt);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

export function filterAndSortMembers(
  members: ClientMember[],
  filter: MemberFilter,
  sort: MemberSort,
  query: string,
  now = new Date(),
): ClientMember[] {
  const needle = query.trim().toLowerCase();
  return members
    .filter((member) => statusMatches(member, filter))
    .filter((member) => !needle || [member.name, member.email, member.membership, member.status].some((value) => value?.toLowerCase().includes(needle)))
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "last-contact") {
        if (!a.lastContactAt) return !b.lastContactAt ? a.name.localeCompare(b.name) : 1;
        if (!b.lastContactAt) return -1;
        return b.lastContactAt.localeCompare(a.lastContactAt);
      }
      const aAge = contactAgeDays(a, now);
      const bAge = contactAgeDays(b, now);
      if (aAge === null && bAge !== null) return -1;
      if (bAge === null && aAge !== null) return 1;
      return (bAge ?? -1) - (aAge ?? -1) || a.name.localeCompare(b.name);
    });
}

export function bucketCalendarEvents(events: CalendarEvent[], filter: CalendarFilter): Map<string, CalendarEvent[]> {
  const buckets = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if ((filter === "1:1" && event.isGroup) || (filter === "Group" && !event.isGroup)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.callDate)) continue;
    const bucket = buckets.get(event.callDate) ?? [];
    bucket.push(event);
    buckets.set(event.callDate, bucket);
  }
  for (const bucket of buckets.values()) bucket.sort((a, b) => (a.startsAt ?? a.callDate).localeCompare(b.startsAt ?? b.callDate));
  return buckets;
}

export function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthRange(month: Date): { from: string; to: string } {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const from = new Date(first);
  from.setDate(first.getDate() - first.getDay());
  const to = new Date(last);
  to.setDate(last.getDate() + (6 - last.getDay()));
  return { from: localDate(from), to: localDate(to) };
}

export function calendarDays(month: Date): Date[] {
  const range = monthRange(month);
  const cursor = new Date(`${range.from}T12:00:00`);
  const end = new Date(`${range.to}T12:00:00`);
  const days: Date[] = [];
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function helmClientUrl(base: string, id: string): string {
  return `${base.replace(/\/$/, "")}/clients/${encodeURIComponent(id)}`;
}

const MAX_MEMBERS = 1_000;
const MAX_CALENDAR_EVENTS = 2_000;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...keys, ...optional]);
  const actual = Object.keys(value);
  // Every key must be one we know about, and every required key must be there.
  return actual.every((key) => allowed.has(key)) && keys.every((key) => key in value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function nullableText(value: unknown, max: number): value is string | null {
  return value === null || text(value, max);
}

const RFC3339_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function timestamp(value: unknown): value is string {
  if (!text(value, 64)) return false;
  const match = RFC3339_RE.exec(value);
  if (!match || !strictDate(match[1])) return false;
  const [, , hour, minute, second] = match;
  return Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 && Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || timestamp(value);
}

function nullableTimestampOrDate(value: unknown): value is string | null {
  return value === null || timestamp(value) || dateOnly(value);
}

function dateOnly(value: unknown): value is string {
  return typeof value === "string" && strictDate(value) !== null;
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100_000;
}

const MEMBER_STAGE_KEYS = ["not_started", "onboarding", "on_track", "off_track", "at_risk", "off_boarded"];

/** Money can be null (never set) or any finite number, including a deliberate 0. */
function nullableMoney(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isCash(value: unknown): value is MemberCash {
  if (!record(value) || !exactKeys(value, ["yearGoal", "monthsSet", "monthGoal", "monthActual", "monthPct"])) return false;
  return nullableMoney(value.yearGoal) && count(value.monthsSet)
    && nullableMoney(value.monthGoal) && nullableMoney(value.monthActual)
    && (value.monthPct === null || count(value.monthPct));
}

function isMember(value: unknown): value is ClientMember {
  if (!record(value) || !exactKeys(value, ["id", "name", "email", "phone", "status", "membership", "isActive", "phase", "startDate", "lastContactAt", "headshotUrl", "portalStatus", "portalLastLogin", "callsAttended", "lastCallAt", "aiNextAction", "stage", "cash"])) return false;
  return text(value.id, 200) && text(value.name, 300) && nullableText(value.email, 320) && nullableText(value.phone, 80)
    && nullableText(value.status, 120) && nullableText(value.membership, 200) && typeof value.isActive === "boolean"
    && nullableText(value.phase, 120) && (value.startDate === null || dateOnly(value.startDate))
    && nullableTimestamp(value.lastContactAt) && nullableText(value.headshotUrl, 2_000)
    && ["not_invited", "invited", "active"].includes(String(value.portalStatus))
    && nullableTimestamp(value.portalLastLogin) && count(value.callsAttended) && nullableTimestampOrDate(value.lastCallAt)
    && nullableText(value.aiNextAction, 2_000)
    && MEMBER_STAGE_KEYS.includes(String(value.stage))
    && isCash(value.cash);
}

function isAttention(value: unknown): value is ClientAttention {
  if (!record(value) || !exactKeys(value, ["id", "name", "status", "membership", "lastContactAt", "daysSinceContact", "reasons", "nextAction"])) return false;
  return text(value.id, 200) && text(value.name, 300) && nullableText(value.status, 120) && nullableText(value.membership, 200)
    && nullableTimestamp(value.lastContactAt) && (value.daysSinceContact === null || count(value.daysSinceContact))
    && Array.isArray(value.reasons) && value.reasons.length <= 8 && value.reasons.every((reason) => text(reason, 200))
    && nullableText(value.nextAction, 2_000);
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!record(value) || !exactKeys(value, ["id", "title", "clientId", "clientName", "startsAt", "callDate", "isGroup", "status", "source"])) return false;
  return text(value.id, 200) && text(value.title, 300) && nullableText(value.clientId, 200) && nullableText(value.clientName, 300)
    && nullableTimestamp(value.startsAt) && dateOnly(value.callDate) && typeof value.isGroup === "boolean"
    && nullableText(value.status, 120) && nullableText(value.source, 120);
}

function isActivity(value: unknown): value is ActivityRow {
  if (!record(value) || !exactKeys(value, ["id", "clientId", "clientName", "type", "summary", "at"])) return false;
  return text(value.id, 200) && (value.clientId === null || text(value.clientId, 200))
    && (value.clientName === null || text(value.clientName, 300))
    && text(value.type, 120) && (value.summary === null || text(value.summary, 2_000))
    && timestamp(value.at);
}

export function isClientsPayload(value: unknown): value is ClientsPayload {
  if (!record(value) || !exactKeys(value, ["generatedAt", "dashboard", "members", "calendar"], ["activity"]) || !timestamp(value.generatedAt)) return false;
  // Optional: a payload built before the feed existed is still valid.
  if (value.activity !== undefined) {
    if (!Array.isArray(value.activity) || value.activity.length > 400 || !value.activity.every(isActivity)) return false;
  }
  if (!record(value.dashboard) || !exactKeys(value.dashboard, ["activeClients", "onboarding", "atRisk", "offTrack", "overdueContact", "portalActive", "portalInvited", "upcoming7Days", "openSupport", "attention"])) return false;
  const dashboard = value.dashboard;
  if (![dashboard.activeClients, dashboard.onboarding, dashboard.atRisk, dashboard.offTrack, dashboard.overdueContact, dashboard.portalActive, dashboard.portalInvited, dashboard.upcoming7Days, dashboard.openSupport].every(count)) return false;
  if (!Array.isArray(dashboard.attention) || dashboard.attention.length > 12 || !dashboard.attention.every(isAttention)) return false;
  return Array.isArray(value.members) && value.members.length <= MAX_MEMBERS && value.members.every(isMember)
    && Array.isArray(value.calendar) && value.calendar.length <= MAX_CALENDAR_EVENTS && value.calendar.every(isCalendarEvent);
}


const STRICT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function strictDate(value: string): Date | null {
  if (!STRICT_DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function validateClientRange(params: URLSearchParams): { from: string; to: string } | null {
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return null;
  const fromDate = strictDate(from);
  const toDate = strictDate(to);
  if (!fromDate || !toDate) return null;
  const span = (toDate.getTime() - fromDate.getTime()) / DAY_MS;
  if (span < 0 || span > 123) return null;
  return { from, to };
}

export type ClientProxyResult =
  | { ok: true; payload: ClientsPayload }
  | { ok: false; status: 502 | 503 };

