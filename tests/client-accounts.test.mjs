import assert from "node:assert/strict";
import test from "node:test";
import {
  RUNBOOK, applyStep, isRunbookKey, mergeClients, nextRunbookStep,
  onboardingProgress, recentClients, sortByNewest,
} from "../lib/client-accounts.ts";

const NOW = new Date("2026-09-08T12:00:00Z");

const account = (o = {}) => ({
  id: "a1", helm_client_id: null, name: "Luis Alvarado", email: "luis@unlimitedleverage.com",
  phone: null, program: "7-Figure CEO", deal_value: 12000, mrr: 1000, start_date: "2026-09-02",
  status: "Onboarding", owner: "Andrew", source: "Stripe", whatsapp: null, notes: null,
  onboarding: {}, archived: false, created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T00:00:00Z", ...o,
});

const member = (o = {}) => ({
  id: "h1", name: "Luis Alvarado", email: "luis@unlimitedleverage.com", phone: null,
  status: "On-Track", membership: "BOARDROOM", isActive: true, startDate: "2026-09-02",
  lastContactAt: null, headshotUrl: null, portalStatus: "invited", callsAttended: 0, ...o,
});

test("progress counts the runbook, not a percentage someone typed", () => {
  assert.deepEqual(onboardingProgress({}), { done: 0, total: 7, pct: 0 });
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

test("a Sales OS row makes a Helm member editable", () => {
  const [merged] = mergeClients([member()], [account()]);
  assert.equal(merged.editable, true);
  assert.equal(merged.accountId, "a1");
  assert.equal(merged.helmId, "h1");
  assert.equal(merged.dealValue, 12000, "our number, not Helm's");
  assert.equal(merged.helm.membership, "BOARDROOM", "Helm's fields still come through");
});

test("a Helm member with no row of ours is shown, and marked not editable", () => {
  const [merged] = mergeClients([member({ email: "someone@else.com", name: "Other Person" })], []);
  assert.equal(merged.editable, false);
  assert.equal(merged.accountId, null);
  assert.equal(merged.key, "helm:h1");
});

test("someone who paid before Helm knows about them still appears", () => {
  const merged = mergeClients([], [account()]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].editable, true);
  assert.equal(merged[0].helm, null);
});

test("matching prefers an explicit id, then email, then name", () => {
  const byId = mergeClients([member()], [account({ helm_client_id: "h1", email: "different@x.com", name: "Different" })]);
  assert.equal(byId[0].accountId, "a1", "the id wins even when nothing else matches");

  const byEmail = mergeClients([member()], [account({ name: "L. Alvarado" })]);
  assert.equal(byEmail[0].accountId, "a1");

  const byName = mergeClients([member({ email: null })], [account({ email: null })]);
  assert.equal(byName[0].accountId, "a1");
});

test("one Sales OS row is never listed twice", () => {
  const merged = mergeClients([member()], [account()]);
  assert.equal(merged.length, 1, "matched, so it must not also appear as a standalone row");
});

test("an archived row neither matches nor appears", () => {
  const merged = mergeClients([member()], [account({ archived: true })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].editable, false, "the archived row must not make this member editable");
});

test("newest first, by start date, with unknown dates last", () => {
  const clients = mergeClients([], [
    account({ id: "old", name: "Old", email: "old@x.com", start_date: "2026-01-01" }),
    account({ id: "new", name: "New", email: "new@x.com", start_date: "2026-09-02" }),
    account({ id: "none", name: "None", email: "none@x.com", start_date: null, created_at: null }),
  ]);
  assert.deepEqual(sortByNewest(clients).map((c) => c.name), ["New", "Old", "None"]);
});

test("recent means started inside the window, and nothing else", () => {
  const clients = mergeClients([], [
    account({ id: "1", name: "This week", email: "a@x.com", start_date: "2026-09-02" }),
    account({ id: "2", name: "Last year", email: "b@x.com", start_date: "2025-09-02" }),
  ]);
  assert.deepEqual(recentClients(clients, 60, NOW).map((c) => c.name), ["This week"]);
  assert.equal(recentClients(clients, 5, NOW).length, 0, "six days out is outside a five-day window");
});
