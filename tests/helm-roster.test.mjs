import assert from "node:assert/strict";
import test from "node:test";
import {
  attentionReasons, buildClientsPayload, daysSinceContact, isOffBoarded,
} from "../lib/helm-roster.ts";

const NOW = new Date("2026-09-09T12:00:00Z");
const days = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const row = (o = {}) => ({
  id: "c1", name: "Luis Alvarado", email: "luis@example.com", phone: null,
  status: "On-Track", membership: "BOARDROOM", is_active: true, phase: null,
  start_date: "2026-06-01", last_contact_at: days(2), headshot_url: null, notes: null,
  ai_next_action: null, deal_value: null, mrr: null, owner: null, source: null,
  whatsapp: null, onboarding: {}, created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z", ...o,
});

const build = (rows, portal = [], calls = [], tickets = 0) =>
  buildClientsPayload(rows, portal, calls, tickets, NOW);

test("the roster counts people we are actually serving", () => {
  // An off-boarded client is history. Counting them as active would overstate
  // the book every month, which is exactly the number this tile exists for.
  const payload = build([
    row({ id: "a" }),
    row({ id: "b", status: "Off-boarded" }),
    row({ id: "c", is_active: false }),
  ]);
  assert.equal(payload.dashboard.activeClients, 1);
});

test("each health tile counts its own bucket", () => {
  const payload = build([
    row({ id: "a", status: "Onboarding" }),
    row({ id: "b", status: "At Risk" }),
    row({ id: "c", status: "Off-Track" }),
    row({ id: "d", status: "On-Track" }),
  ]);
  const d = payload.dashboard;
  assert.equal(d.onboarding, 1);
  assert.equal(d.atRisk, 1);
  assert.equal(d.offTrack, 1);
  assert.equal(d.activeClients, 4);
});

test("nobody contacted counts as overdue, not as fine", () => {
  // A null last-contact used to sort as "no problem". Someone we have never
  // spoken to is the most overdue person on the list, not the least.
  const payload = build([
    row({ id: "a", last_contact_at: null }),
    row({ id: "b", last_contact_at: days(20) }),
    row({ id: "c", last_contact_at: days(3) }),
  ]);
  assert.equal(payload.dashboard.overdueContact, 2);
  assert.equal(daysSinceContact(null, NOW.getTime()), null);
  assert.equal(daysSinceContact(days(20), NOW.getTime()), 20);
});

test("attention lists a reason, and only lists people who have one", () => {
  const payload = build([
    row({ id: "fine", name: "Fine" }),
    row({ id: "risk", name: "Risky", status: "At Risk" }),
    row({ id: "quiet", name: "Quiet", last_contact_at: days(30) }),
  ]);
  const names = payload.dashboard.attention.map((a) => a.name);
  assert.ok(!names.includes("Fine"), "a list that includes everyone tells you nothing");
  assert.deepEqual(new Set(names), new Set(["Risky", "Quiet"]));
  const quiet = payload.dashboard.attention.find((a) => a.name === "Quiet");
  assert.deepEqual(quiet.reasons, ["30 days since last contact"]);
  assert.equal(quiet.daysSinceContact, 30);
});

test("portal state separates invited from actually logged in", () => {
  const payload = build(
    [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })],
    [{ client_id: "a", last_login_at: days(1) }, { client_id: "b", last_login_at: null }],
  );
  assert.equal(payload.dashboard.portalActive, 1);
  assert.equal(payload.dashboard.portalInvited, 1);
  assert.equal(payload.members.find((m) => m.id === "c").portalStatus, "not_invited");
});

test("upcoming counts the next seven days, not everything on the calendar", () => {
  const at = (n) => new Date(NOW.getTime() + n * 86400000);
  const call = (id, offset) => ({
    id, title: "Coaching call", client_id: "c1",
    call_date: at(offset).toISOString().slice(0, 10),
    starts_at: at(offset).toISOString(), is_group: false, status: null,
    attended: 1, attendee_name: null,
  });
  const payload = build([row()], [], [call("past", -3), call("soon", 2), call("later", 20)]);
  assert.equal(payload.dashboard.upcoming7Days, 1);
  assert.equal(payload.calendar.length, 3, "the calendar still shows the month");
});

test("a calendar event carries the client's real name, not just an id", () => {
  const payload = build([row({ id: "c1", name: "Luis Alvarado" })], [], [{
    id: "k1", title: "1:1", client_id: "c1", call_date: "2026-09-10",
    starts_at: null, is_group: false, status: null, attended: 1, attendee_name: null,
  }]);
  assert.equal(payload.calendar[0].clientName, "Luis Alvarado");
});

test("off-boarded is recognised however it is spelled", () => {
  for (const value of ["Off-boarded", "offboarded", "OFF-BOARD"]) {
    assert.equal(isOffBoarded(value), true, `${value} should read as off-boarded`);
  }
  assert.equal(isOffBoarded("On-Track"), false);
  assert.equal(isOffBoarded(null), false);
});

test("a client with nothing wrong has no reasons", () => {
  assert.deepEqual(attentionReasons(row(), NOW.getTime()), []);
});
