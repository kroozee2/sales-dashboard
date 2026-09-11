import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_KINDS, activityKind, daysBetween, groupByDay, lastActionByClient,
  since, summariseEngagement,
} from "../lib/client-activity.ts";

const NOW = new Date("2026-09-11T12:00:00Z");
const ago = (hours) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const row = (over = {}) => ({
  id: "a", clientId: "c1", clientName: "Zoe", type: "portal_login", summary: "📱 Logged in", at: ago(1), ...over,
});

test("a known type is named, an unknown one still shows", () => {
  assert.equal(activityKind("portal_login").label, "logged in");
  assert.equal(activityKind("promise_signed").label, "signed the Promise");
  assert.equal(activityKind("something_new").label, "did something");
  assert.equal(activityKind(null).label, "did something");
});

test("every catalogued type is unique and has a side", () => {
  const seen = new Set();
  for (const kind of ACTIVITY_KINDS) {
    assert.equal(seen.has(kind.type), false, `${kind.type} is listed twice`);
    seen.add(kind.type);
    assert.ok(["client", "team"].includes(kind.side));
  }
});

test("what we do to a client is never counted as the client doing something", () => {
  const rows = [
    row({ id: "1", type: "portal_invite" }),
    row({ id: "2", type: "password_reset_sent" }),
    row({ id: "3", type: "imessage" }),
    row({ id: "4", type: "email" }),
  ];
  const summary = summariseEngagement(rows, NOW);
  assert.equal(summary.actions, 0, "forty invites is not forty client actions");
  assert.equal(summary.activeClients, 0);
});

test("client actions are counted and bucketed", () => {
  const rows = [
    row({ id: "1", type: "portal_login" }),
    row({ id: "2", type: "ai_chat" }),
    row({ id: "3", type: "content_created" }),
    row({ id: "4", type: "task_done" }),
    row({ id: "5", type: "training_done" }),
  ];
  const s = summariseEngagement(rows, NOW);
  assert.equal(s.actions, 5);
  assert.deepEqual(s.byBucket, { using: 2, building: 1, progress: 2 });
});

test("active clients counts people, not actions", () => {
  const rows = [
    row({ id: "1", clientId: "c1" }), row({ id: "2", clientId: "c1" }),
    row({ id: "3", clientId: "c1" }), row({ id: "4", clientId: "c2" }),
  ];
  const s = summariseEngagement(rows, NOW);
  assert.equal(s.actions, 4);
  assert.equal(s.activeClients, 2);
});

test("anything older than the window is left out", () => {
  const rows = [row({ id: "1", at: ago(24 * 29) }), row({ id: "2", at: ago(24 * 45) })];
  assert.equal(summariseEngagement(rows, NOW, 30).actions, 1);
});

test("the sparkline has a point for every day, including the quiet ones", () => {
  const s = summariseEngagement([row({ at: ago(1) })], NOW, 30);
  assert.equal(s.perDay.length, 30);
  assert.equal(s.perDay.at(-1).day, "2026-09-11");
  assert.equal(s.perDay.at(-1).count, 1);
  assert.equal(s.perDay.filter((d) => d.count === 0).length, 29, "a quiet day is a zero, not a gap");
});

test("a row with an unparseable timestamp cannot break the rollup", () => {
  const s = summariseEngagement([row({ at: "not a date" }), row({ id: "2" })], NOW);
  assert.equal(s.actions, 1);
});

test("the last action per client ignores anything we did", () => {
  const rows = [
    row({ id: "1", clientId: "c1", type: "portal_login", at: ago(50) }),
    row({ id: "2", clientId: "c1", type: "portal_invite", at: ago(1) }),
  ];
  const last = lastActionByClient(rows);
  assert.equal(last.get("c1").id, "1", "an invite we sent is not them coming back");
});

test("the feed is newest first and cut into days", () => {
  const rows = [
    row({ id: "old", at: ago(50) }),
    row({ id: "now", at: ago(1) }),
    row({ id: "yest", at: ago(26) }),
  ];
  const days = groupByDay(rows, NOW);
  assert.deepEqual(days.map((d) => d.label), ["Today", "Yesterday", "Wed, Sep 9"]);
  assert.deepEqual(days[0].rows.map((r) => r.id), ["now"]);
});

test("several actions on one day stay together, newest first", () => {
  const days = groupByDay([row({ id: "b", at: ago(5) }), row({ id: "a", at: ago(2) })], NOW);
  assert.equal(days.length, 1);
  assert.deepEqual(days[0].rows.map((r) => r.id), ["a", "b"]);
});

test("the feed is capped so one busy week cannot render forever", () => {
  const many = Array.from({ length: 500 }, (_, i) => row({ id: String(i), at: ago(i % 40) }));
  const total = groupByDay(many, NOW, 60).reduce((n, d) => n + d.rows.length, 0);
  assert.equal(total, 60);
});

test("relative time reads at a glance", () => {
  assert.equal(since(ago(0), NOW), "now");
  assert.equal(since(ago(0.5), NOW), "30m");
  assert.equal(since(ago(5), NOW), "5h");
  assert.equal(since(ago(24 * 3), NOW), "3d");
  assert.equal(since(ago(24 * 60), NOW), "2mo");
});

test("days between handles a missing or broken date", () => {
  assert.equal(daysBetween(null, NOW), null);
  assert.equal(daysBetween("nonsense", NOW), null);
  assert.equal(daysBetween(ago(24 * 3), NOW), 3);
  assert.equal(daysBetween(new Date(NOW.getTime() + 86_400_000).toISOString(), NOW), 0, "the future is not negative days");
});
