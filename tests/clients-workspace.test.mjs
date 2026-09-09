import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CLIENT_TABS,
  bucketCalendarEvents,
  contactAgeDays,
  filterAndSortMembers,
  helmClientUrl,
  isClientsPayload,
  monthRange,
  validateClientRange,
} from "../lib/clients.ts";

const member = (overrides = {}) => ({
  id: "active", name: "Zoe", email: null, phone: null, status: "🚀 On-Track", membership: null,
  isActive: true, phase: null, startDate: null, lastContactAt: "2026-09-04T12:00:00Z",
  headshotUrl: null, portalStatus: "active", portalLastLogin: null, callsAttended: 0,
  lastCallAt: null, aiNextAction: null, ...overrides,
});

const members = [
  member(),
  member({ id: "risk", name: "Amy", status: "❌ At Risk", lastContactAt: "2026-08-01T12:00:00Z" }),
  member({ id: "new", name: "Ben", status: "📆 Onboarding Booked", lastContactAt: null }),
  member({ id: "track", name: "Dan", status: "🚊 Off-Track" }),
  member({ id: "off", name: "Cal", status: "👋 Off-Boarded", isActive: false, lastContactAt: null }),
];

const payload = {
  generatedAt: "2026-09-04T16:00:00.000Z",
  dashboard: { activeClients: 4, onboarding: 1, atRisk: 1, offTrack: 1, overdueContact: 1, portalActive: 1, portalInvited: 0, upcoming7Days: 0, openSupport: 0, attention: [] },
  members,
  calendar: [],
};

test("Clients workspace exposes Dashboard, New, Members and Calendar as separate sidebar routes", () => {
  assert.deepEqual(CLIENT_TABS, ["Dashboard", "New", "Members", "Calendar"]);
  const workspace = readFileSync(new URL("../app/clients/clients-workspace.tsx", import.meta.url), "utf8");
  const indexPage = readFileSync(new URL("../app/clients/page.tsx", import.meta.url), "utf8");
  for (const view of ["dashboard", "new", "members", "calendar"]) {
    const route = readFileSync(new URL(`../app/clients/${view}/page.tsx`, import.meta.url), "utf8");
    assert.match(route, new RegExp(`view="${view[0].toUpperCase()}${view.slice(1)}"`, "i"));
  }
  assert.match(indexPage, /redirect\("\/clients\/dashboard"\)/);
  assert.doesNotMatch(workspace, /role="tablist"/);
  assert.match(workspace, /Needs Attention/);
  assert.match(workspace, /Upcoming 7 Days/);
  assert.match(workspace, /AbortController/);
});

test("the workspace no longer claims to be read-only, and says what each side owns", () => {
  const workspace = readFileSync(new URL("../app/clients/clients-workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(workspace, /This workspace is read-only/i, "editing lands in our own table now");
  assert.match(workspace, /Helm owns fulfilment; Sales OS owns the deal/i);
  // Every write goes to our own endpoint; nothing here writes to Helm.
  assert.match(workspace, /\/api\/clients\/accounts/);
  assert.doesNotMatch(workspace, /method: "(POST|PATCH)"[^}]*\/api\/clients\?/);
});

test("SalesOS proxy rejects malformed or oversized nested Helm payloads", () => {
  assert.equal(isClientsPayload(payload), true);
  assert.equal(isClientsPayload({ ...payload, generatedAt: "2026-09-04T16:00:00.123456Z" }), true);
  assert.equal(isClientsPayload({ ...payload, generatedAt: "not-a-date" }), false);
  assert.equal(isClientsPayload({ ...payload, generatedAt: "2026-02-30T00:00:00Z" }), false);
  assert.equal(isClientsPayload({ ...payload, generatedAt: "2026-09-04" }), false);
  assert.equal(isClientsPayload({ ...payload, generatedAt: "2026-09-04T16:00:00" }), false);
  assert.equal(isClientsPayload({ ...payload, members: [null] }), false);
  assert.equal(isClientsPayload({ ...payload, calendar: [{ callDate: 7 }] }), false);
  assert.equal(isClientsPayload({ ...payload, dashboard: { ...payload.dashboard, activeClients: Number.NaN } }), false);
  assert.equal(isClientsPayload({ ...payload, members: Array.from({ length: 1001 }, () => member()) }), false);
});

test("month changes clear stale payloads before the next range loads", () => {
  const page = readFileSync(new URL("../app/clients/clients-workspace.tsx", import.meta.url), "utf8");
  assert.match(page, /setData\(null\);\s*setLoading\(true\)/);
  assert.match(page, /setRefreshKey/);
  assert.match(page, /nextRange\.from === range\.from/);
  assert.doesNotMatch(page, /error && !data/);
});

test("member filters recognize Helm emoji statuses and urgency keeps no-contact distinct from today", () => {
  const now = new Date("2026-09-04T16:00:00Z");
  assert.deepEqual(filterAndSortMembers([...members], "All active", "urgency", "", now).map((m) => m.id), ["new", "risk", "track", "active"]);
  assert.deepEqual(filterAndSortMembers([...members], "At Risk", "name", "", now).map((m) => m.id), ["risk"]);
  assert.deepEqual(filterAndSortMembers([...members], "Onboarding", "name", "", now).map((m) => m.id), ["new"]);
  assert.deepEqual(filterAndSortMembers([...members], "Off-Track", "name", "", now).map((m) => m.id), ["track"]);
  assert.deepEqual(filterAndSortMembers([...members], "Off-boarded", "name", "", now).map((m) => m.id), ["off"]);
  const contradictory = member({ id: "contradictory", status: "👋 Off-Boarded", isActive: true });
  assert.deepEqual(filterAndSortMembers([contradictory], "All active", "name", "", now), []);
  assert.deepEqual(filterAndSortMembers([contradictory], "Off-boarded", "name", "", now).map((m) => m.id), ["contradictory"]);
  assert.deepEqual(filterAndSortMembers([...members], "All active", "last-contact", "", now).map((m) => m.id), ["active", "track", "risk", "new"]);
  assert.equal(contactAgeDays(members[0], now), 0);
  assert.equal(contactAgeDays(members[2], now), null);
});

test("calendar bucketing uses real call dates, preserves unknown time, and calculates month ranges", () => {
  const events = [
    { id: "a", title: "A", callDate: "2026-09-01", startsAt: "2026-09-01T18:00:00Z", isGroup: false },
    { id: "b", title: "B", callDate: "2026-09-01", startsAt: null, isGroup: true },
    { id: "c", title: "C", callDate: "2026-09-02", startsAt: "2026-09-02T18:00:00Z", isGroup: false },
  ];
  assert.deepEqual(bucketCalendarEvents(events, "All").get("2026-09-01")?.map((e) => e.id), ["b", "a"]);
  assert.deepEqual(bucketCalendarEvents(events, "1:1").get("2026-09-01")?.map((e) => e.id), ["a"]);
  assert.deepEqual(bucketCalendarEvents(events, "Group").get("2026-09-01")?.map((e) => e.id), ["b"]);
  assert.deepEqual(monthRange(new Date(2026, 8, 1)), { from: "2026-08-30", to: "2026-10-03" });
});



