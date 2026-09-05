import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CLIENT_TABS,
  bucketCalendarEvents,
  contactAgeDays,
  filterAndSortMembers,
  fetchClientsUpstream,
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

test("Clients workspace declares exactly Dashboard, Members, and Calendar tabs", () => {
  assert.deepEqual(CLIENT_TABS, ["Dashboard", "Members", "Calendar"]);
  const page = readFileSync(new URL("../app/clients/page.tsx", import.meta.url), "utf8");
  assert.match(page, /role="tablist"/);
  assert.match(page, /aria-selected=/);
  assert.match(page, /aria-labelledby=/);
  assert.match(page, /tabIndex=/);
  assert.match(page, /ArrowRight/);
  assert.match(page, /aria-pressed=/);
  assert.match(page, /Helm is the source of truth/i);
  assert.match(page, /Needs Attention/);
  assert.match(page, /Upcoming 7 Days/);
  assert.match(page, /AbortController/);
});

test("SalesOS proxy rejects malformed or oversized nested Helm payloads", () => {
  assert.equal(isClientsPayload(payload), true);
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
  const page = readFileSync(new URL("../app/clients/page.tsx", import.meta.url), "utf8");
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

test("Helm client links use the verified production origin and an encoded exact id", () => {
  assert.equal(helmClientUrl("https://helm-iota-five.vercel.app/", "client/a"), "https://helm-iota-five.vercel.app/clients/client%2Fa");
});

test("SalesOS proxy validates inclusive ranges and forwards the secret only as a bearer header", async () => {
  assert.deepEqual(validateClientRange(new URLSearchParams("from=2026-01-01&to=2026-05-04")), { from: "2026-01-01", to: "2026-05-04" });
  assert.equal(validateClientRange(new URLSearchParams("from=2026-01-01&to=2026-05-05")), null);
  assert.equal(validateClientRange(new URLSearchParams("from=2026-02-30&to=2026-03-01")), null);
  let observedUrl = "";
  let observedAuthorization = "";
  const result = await fetchClientsUpstream(
    { from: "2026-09-01", to: "2026-09-30" },
    { base: "https://helm.example", secret: "bridge-secret", fetchImpl: async (input, init) => {
      observedUrl = String(input);
      observedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json(payload);
    } },
  );
  assert.equal(result.ok, true);
  assert.equal(observedUrl, "https://helm.example/api/salesos/clients?from=2026-09-01&to=2026-09-30");
  assert.equal(observedAuthorization, "Bearer bridge-secret");
  assert.doesNotMatch(observedUrl, /bridge-secret/);
});

test("SalesOS proxy fails closed and never returns an upstream body", async () => {
  const result = await fetchClientsUpstream(
    { from: "2026-09-01", to: "2026-09-30" },
    { base: "https://helm.example", secret: "bridge-secret", fetchImpl: async () => new Response("database password: leaked", { status: 500 }) },
  );
  assert.deepEqual(result, { ok: false, status: 502 });
  assert.doesNotMatch(JSON.stringify(result), /password|leaked|bridge-secret/);
  assert.deepEqual(await fetchClientsUpstream({ from: "2026-09-01", to: "2026-09-30" }, {}), { ok: false, status: 503 });
});
