import assert from "node:assert/strict";
import test from "node:test";

import { bookedSalesCalls, callViewState, findLeadForCall, leadStageForCall, leadUpdatesForCall, persistLeadUpdateWithCas } from "../lib/sales-call-leads.ts";
import * as salesCallLeads from "../lib/sales-call-leads.ts";

const NOW = new Date("2026-09-06T12:00:00.000Z");
const call = (overrides = {}) => ({
  id: "call-1",
  name: "Alex Example",
  email: "alex@example.com",
  phone: "+1 (555) 111-2222",
  call_type: "📞 Sales Call",
  call_date: "2026-09-07T15:00:00.000Z",
  confirmed: "✅ Confirmed",
  result: null,
  showed: null,
  ...overrides,
});

test("booked Sales Calls contains only confirmed future sales calls without a completed outcome", () => {
  const visible = bookedSalesCalls([
    call(),
    call({ id: "unconfirmed", confirmed: null }),
    call({ id: "past", call_date: "2026-09-05T15:00:00.000Z" }),
    call({ id: "client", call_type: "🧑‍💼 Client Call" }),
    call({ id: "complete", result: "📣 Follow Up", showed: true }),
  ], NOW);

  assert.deepEqual(visible.map((row) => row.id), ["call-1"]);
  assert.equal(leadStageForCall(call(), NOW), "📞 Call Booked");
});

test("recorded attended outcomes advance only to supported lead stages", () => {
  assert.equal(leadStageForCall(call({ result: "📣 Follow Up", showed: true }), NOW), "🔥 Hot Prospect");
  assert.equal(leadStageForCall(call({ result: "✅ Sale", showed: true }), NOW), "🔗 Pay Link Sent");
  assert.notEqual(leadStageForCall(call({ result: "✅ Sale", showed: true }), NOW), "🏦 Payment Received");

  for (const unsupported of [
    call({ result: "📣 Follow Up", showed: null }),
    call({ result: "📣 Follow Up", showed: false }),
    call({ result: "👻 No Show", showed: false }),
    call({ result: "❌ Did Not Close", showed: true }),
    call({ result: "➖ Other", showed: true }),
  ]) {
    assert.equal(leadStageForCall(unsupported, NOW), null);
  }
});

test("lead matching uses exact email, then normalized phone, then exact name", async () => {
  const calls = [];
  const emailLead = { id: "email", full_name: "Different", email: " ALEX@example.com ", phone: null };
  const lookup = {
    byEmail: async (value) => (calls.push(`email:${value}`), [emailLead]),
    byPhone: async (value) => (calls.push(`phone:${value}`), [{ id: "phone", phone: "+1 555 111 2222" }]),
    byName: async (value) => (calls.push(`name:${value}`), [{ id: "name", full_name: "Alex Example" }]),
  };

  assert.deepEqual(await findLeadForCall(call(), lookup), { status: "matched", method: "email", lead: emailLead });
  assert.deepEqual(calls, ["email:alex@example.com"]);

  calls.length = 0;
  lookup.byEmail = async (value) => (calls.push(`email:${value}`), []);
  assert.equal((await findLeadForCall(call(), lookup)).method, "phone");
  assert.deepEqual(calls, ["email:alex@example.com", "phone:5551112222"]);

  calls.length = 0;
  lookup.byPhone = async (value) => (calls.push(`phone:${value}`), []);
  assert.equal((await findLeadForCall(call(), lookup)).method, "name");
  assert.deepEqual(calls, ["email:alex@example.com", "phone:5551112222", "name:Alex Example"]);
});

test("lead matching fails closed on duplicates at the highest available identity", async () => {
  let phoneQueried = false;
  const duplicate = { id: "one", email: "alex@example.com" };
  const result = await findLeadForCall(call(), {
    byEmail: async () => [duplicate, { ...duplicate, id: "two" }],
    byPhone: async () => (phoneQueried = true, []),
    byName: async () => [],
  });

  assert.deepEqual(result, { status: "ambiguous", method: "email", count: 2 });
  assert.equal(phoneQueried, false);
});

test("lead updates are forward-only and do not duplicate notes when an outcome PATCH is replayed", () => {
  const lead = { id: "lead-1", prospect_stage: "📞 Call Booked", notes: "Existing note" };
  const followUp = call({ result: "📣 Follow Up", showed: true, call_date: "2026-09-06T11:00:00.000Z" });
  const first = leadUpdatesForCall(call({ call_date: followUp.call_date }), followUp, lead, NOW);
  assert.equal(first?.prospect_stage, "🔥 Hot Prospect");
  assert.match(first?.notes ?? "", /Sales call: 📣 Follow Up/);
  assert.match(first?.notes ?? "", /Existing note/);

  const replay = leadUpdatesForCall(followUp, followUp, { ...lead, ...first }, NOW);
  assert.equal(replay, null);

  const neutral = leadUpdatesForCall(followUp, call({ ...followUp, result: "➖ Other" }), { ...lead, ...first }, NOW);
  assert.equal(neutral?.prospect_stage, undefined);
  assert.match(neutral?.notes ?? "", /Sales call: ➖ Other/);

  const paid = leadUpdatesForCall(call(), call({ result: "✅ Sale", showed: true }), { ...lead, prospect_stage: "🏦 Payment Received" }, NOW);
  assert.equal(paid?.prospect_stage, undefined);
});


test("a neutral move-off without attendance does not claim that the call happened", () => {
  const lead = { id: "lead-1", prospect_stage: "📞 Call Booked", notes: "Existing note" };
  const previous = call();
  const movedOff = call({ result: "➖ Other", showed: null });
  assert.equal(leadUpdatesForCall(previous, movedOff, lead, NOW), null);
});


test("move-off marker is reversible without changing completed call evidence", () => {
  const completed = call({ call_date: "2026-09-05T15:00:00.000Z", result: "✅ Sale", showed: true, success: true });
  const moved = { ...completed, booked_view_moved_off: true };
  assert.equal(callViewState(moved, NOW), "moved-off");
  assert.equal(moved.result, completed.result);
  assert.equal(moved.showed, completed.showed);
  assert.equal(moved.success, completed.success);
  assert.equal(callViewState({ ...moved, booked_view_moved_off: false }, NOW), "completed");
});

test("past and completed calls are history, not falsely offered as booked calls", () => {
  assert.equal(callViewState(call({ call_date: "2026-09-05T15:00:00.000Z" }), NOW), "past");
  assert.equal(callViewState(call({ result: "📣 Follow Up", showed: true }), NOW), "completed");
  assert.equal(callViewState(call(), NOW), "booked");
});

test("unknown existing lead stages fail closed instead of being demoted", () => {
  const update = leadUpdatesForCall(null, call(), { id: "lead-1", prospect_stage: "Custom Won", notes: null }, NOW);
  assert.equal(update, null);
});


test("note idempotency survives a stale call read by recognizing durable call outcome markers", () => {
  const lead = { id: "lead-1", prospect_stage: "📞 Call Booked", notes: "Existing note" };
  const before = call({ call_date: "2026-09-06T11:00:00.000Z" });
  const after = call({ call_date: before.call_date, result: "📣 Follow Up", showed: true });
  const first = leadUpdatesForCall(before, after, lead, NOW);
  assert.ok(first?.notes);
  const replayFromAnotherInstance = leadUpdatesForCall(before, after, { ...lead, prospect_stage: "🔥 Hot Prospect", notes: first.notes }, NOW);
  assert.equal(replayFromAnotherInstance, null);
});



test("same-outcome retry reconciles a missing durable lead marker after a partial commit", () => {
  const committed = call({ result: "📣 Follow Up", showed: true, call_date: "2026-09-06T11:00:00.000Z" });
  const leadAfterFailedSync = { id: "lead-1", prospect_stage: "📞 Call Booked", notes: "Existing note" };
  const retry = leadUpdatesForCall(committed, committed, leadAfterFailedSync, NOW);
  assert.equal(retry?.prospect_stage, "🔥 Hot Prospect");
  assert.match(retry?.notes ?? "", /Sales call: 📣 Follow Up/);
  assert.equal((retry?.notes?.match(/sales-call:call-1/g) ?? []).length, 1);
});

test("database compare-and-set preserves notes from concurrent calls and replay is durable", async () => {
  let stored = { id: "lead-1", prospect_stage: "📞 Call Booked", notes: "Existing" };
  const load = async () => ({ ...stored });
  const cas = async (expected, updates) => {
    await new Promise((resolve) => setImmediate(resolve));
    if (stored.notes !== expected.notes || stored.prospect_stage !== expected.prospect_stage) return null;
    stored = { ...stored, ...updates }; return { ...stored };
  };
  const beforeA = call({ id: "call-a", call_date: "2026-09-06T10:00:00Z" });
  const afterA = { ...beforeA, result: "📣 Follow Up", showed: true };
  const beforeB = call({ id: "call-b", call_date: "2026-09-06T11:00:00Z" });
  const afterB = { ...beforeB, result: "✅ Sale", showed: true };
  await Promise.all([persistLeadUpdateWithCas(beforeA, afterA, load, cas, NOW), persistLeadUpdateWithCas(beforeB, afterB, load, cas, NOW)]);
  assert.match(stored.notes, /sales-call:call-a/);
  assert.match(stored.notes, /sales-call:call-b/);
  const beforeReplay = stored.notes;
  assert.equal((await persistLeadUpdateWithCas(beforeA, afterA, load, cas, NOW)).status, "unchanged");
  assert.equal(stored.notes, beforeReplay);
});


test("row keyboard activation ignores nested controls to avoid double-open", () => {
  assert.equal(typeof salesCallLeads.shouldOpenSalesCallRow, "function");
  const row = {};
  assert.equal(salesCallLeads.shouldOpenSalesCallRow({ key: "Enter", target: row, currentTarget: row }), true);
  assert.equal(salesCallLeads.shouldOpenSalesCallRow({ key: " ", target: row, currentTarget: row }), true);
  assert.equal(salesCallLeads.shouldOpenSalesCallRow({ key: "Enter", target: {}, currentTarget: row }), false);
  assert.equal(salesCallLeads.shouldOpenSalesCallRow({ key: " ", target: {}, currentTarget: row }), false);
});
