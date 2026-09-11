import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_STATUSES, OFF_BOARDED_STATUS, RUNBOOK, applyStep, isRunbookKey,
  nextRunbookStep, onboardingProgress, recentClients, sortByNewest,
} from "../lib/client-accounts.ts";
import { statusToHealth } from "../lib/client-roster.ts";
import { ROSTER_FIELD_COLUMN, toMergedClient } from "../lib/helm-clients.ts";

const NOW = new Date("2026-09-08T12:00:00Z");

/** One row of Helm's `clients` table, which is now the only client record. */
const row = (o = {}) => ({
  id: "h1", name: "Luis Alvarado", email: "luis@unlimitedleverage.com", phone: null,
  status: "Onboarding", membership: "BOARDROOM", is_active: true, phase: null,
  start_date: "2026-09-02", last_contact_at: null, headshot_url: null, notes: null,
  ai_next_action: null, deal_value: 12000, mrr: 1000, owner: null, source: "Stripe",
  whatsapp: null, onboarding: {}, created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z", ...o,
});

test("progress counts the runbook, not a percentage someone typed", () => {
  // Eight steps now: the Promise was added, because signing it is a real gate
  // and the app already knows when it happens.
  assert.deepEqual(onboardingProgress({}), { done: 0, total: RUNBOOK.length, pct: 0 });
  assert.equal(RUNBOOK.length, 8);
  assert.deepEqual(onboardingProgress({ payment: { done: true }, fam: { done: true } }).done, 2);
  const all = Object.fromEntries(RUNBOOK.map((s) => [s.key, { done: true }]));
  assert.equal(onboardingProgress(all).pct, 100);
});

test("the next step is the first one not done, in runbook order", () => {
  assert.equal(nextRunbookStep({}).key, "payment");
  assert.equal(nextRunbookStep({ payment: { done: true } }).key, "fam");
  const all = Object.fromEntries(RUNBOOK.map((s) => [s.key, { done: true }]));
  assert.equal(nextRunbookStep(all), null);
});

test("ticking a step stamps when, and unticking clears it", () => {
  const ticked = applyStep({}, "fam", { done: true }, NOW);
  assert.equal(ticked.fam.done, true);
  assert.equal(ticked.fam.at, NOW.toISOString());

  const unticked = applyStep(ticked, "fam", { done: false }, NOW);
  assert.equal(unticked.fam.done, false);
  assert.equal(unticked.fam.at, null, "a cleared step must not keep a date that implies it happened");
});

test("re-ticking an already-done step keeps the original date", () => {
  const first = applyStep({}, "fam", { done: true }, new Date("2026-09-03T10:00:00Z"));
  const again = applyStep(first, "fam", { note: "added by Jameson" }, NOW);
  assert.equal(again.fam.at, "2026-09-03T10:00:00.000Z");
  assert.equal(again.fam.note, "added by Jameson");
});

test("only real runbook keys are accepted", () => {
  assert.equal(isRunbookKey("fam"), true);
  assert.equal(isRunbookKey("whatever"), false);
  assert.equal(isRunbookKey(null), false);
});

test("a client is one row, and every one of them is editable", () => {
  // The old shape merged Helm's roster with a second Sales OS table, and a
  // client without a row on our side could be seen but not changed. There is
  // one row now, so "read-only client" no longer exists.
  const client = toMergedClient(row());
  assert.equal(client.editable, true);
  assert.equal(client.key, "h1", "the client's own id is the key we patch by");
  assert.equal(client.accountId, "h1");
  assert.equal(client.helmId, "h1");
});

test("the roster reads the fields it is going to write", () => {
  const client = toMergedClient(row());
  assert.equal(client.dealValue, 12000);
  assert.equal(client.mrr, 1000);
  assert.equal(client.program, "BOARDROOM", "program reads the membership column");
  assert.equal(client.status, "Onboarding");
  assert.equal(client.owner, "Andrew", "an unset owner falls back rather than showing blank");
});

test("a row with nothing filled in still renders", () => {
  const client = toMergedClient(row({ name: null, deal_value: null, mrr: null, onboarding: null }));
  assert.equal(client.name, "Unnamed client");
  assert.equal(client.dealValue, null);
  assert.deepEqual(client.onboarding, {}, "a null runbook must not crash the roster");
});

test("archiving is off-boarding, not deletion", () => {
  // Seventy-odd tables reference a client row. `archived` maps to is_active so
  // removing someone from the roster keeps their calls, notes and history.
  assert.equal(ROSTER_FIELD_COLUMN.archived, "is_active");
});

test("the roster can only write columns it names", () => {
  const columns = Object.values(ROSTER_FIELD_COLUMN);
  for (const forbidden of ["id", "created_at", "ai_brief", "ai_risk_score", "portal_bio", "promise_signature"]) {
    assert.ok(!columns.includes(forbidden), `${forbidden} must not be writable from the roster`);
  }
  assert.equal(ROSTER_FIELD_COLUMN.program, "membership");
});

test("sorting and the recent window still work on one source", () => {
  const clients = [
    toMergedClient(row({ id: "a", name: "Old", start_date: "2026-01-04" })),
    toMergedClient(row({ id: "b", name: "New", start_date: "2026-09-02" })),
  ];
  assert.deepEqual(sortByNewest(clients).map((c) => c.name), ["New", "Old"]);
  assert.deepEqual(recentClients(clients, 60, NOW).map((c) => c.name), ["New"]);
});

test("the status vocabulary is the one stored in the column", () => {
  // Helm's statuses carry their emoji, and Helm's own screens filter on the
  // exact strings. Writing a tidier "Off-Track" from Sales OS would create a
  // second vocabulary in one column and drop the client out of those filters.
  assert.deepEqual([...CLIENT_STATUSES], [
    "🆕 Not Started",
    "📆 Onboarding Booked",
    "🚀 On-Track",
    "🚊 Off-Track",
    "❌ At Risk",
    "👋 Off-Boarded",
  ]);
  assert.equal(OFF_BOARDED_STATUS, "👋 Off-Boarded");
  assert.ok(CLIENT_STATUSES.includes(OFF_BOARDED_STATUS));
});

test("every stored status still lands in a health bucket", () => {
  const expected = {
    "🆕 Not Started": "watch",
    "📆 Onboarding Booked": "good",
    "🚀 On-Track": "good",
    "🚊 Off-Track": "watch",
    "❌ At Risk": "risk",
    "👋 Off-Boarded": "idle",
  };
  for (const [status, bucket] of Object.entries(expected)) {
    assert.equal(statusToHealth(status), bucket, `${status} should read as ${bucket}`);
  }
});

test("every runbook step carries a word for the sheet column", () => {
  // The sheet header used to be a bare emoji, which told you nothing.
  for (const step of RUNBOOK) {
    assert.ok(step.short && step.short.length <= 8, `${step.key} needs a short column label`);
    assert.ok(step.emoji && step.label && step.detail, `${step.key} is missing display text`);
  }
  assert.equal(new Set(RUNBOOK.map((s) => s.short)).size, RUNBOOK.length, "column words must be distinct");
});
