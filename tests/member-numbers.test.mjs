import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_CASH, MEMBER_STAGES, buildMemberCash, cashTotals, currentPeriod, memberStage, money,
} from "../lib/member-numbers.ts";

const stage = (over = {}) => memberStage({
  status: "🚀 On-Track", isActive: true, portalStatus: "active", hasCashGoal: true, ...over,
});

/* ── Stage ─────────────────────────────────────────────────────────────── */

test("a definite status wins over anything derived", () => {
  assert.equal(stage({ status: "❌ At Risk" }), "at_risk");
  assert.equal(stage({ status: "🚊 Off-Track" }), "off_track");
  assert.equal(stage({ status: "👋 Off-Boarded" }), "off_boarded");
  assert.equal(stage({ status: "🚀 On-Track" }), "on_track");
});

test("an inactive member is off-boarded whatever the status says", () => {
  assert.equal(stage({ status: "🚀 On-Track", isActive: false }), "off_boarded");
});

test("onboarding splits on whether they have actually done anything", () => {
  const base = { status: "📆 Onboarding Booked" };
  // Never logged in, no numbers set: they have not started.
  assert.equal(stage({ ...base, portalStatus: "not_invited", hasCashGoal: false }), "not_started");
  assert.equal(stage({ ...base, portalStatus: "invited", hasCashGoal: false }), "not_started");
  // Either signal is enough to count as under way.
  assert.equal(stage({ ...base, portalStatus: "active", hasCashGoal: false }), "onboarding");
  assert.equal(stage({ ...base, portalStatus: "invited", hasCashGoal: true }), "onboarding");
});

test("an active member who was never invited and set nothing has not started", () => {
  assert.equal(stage({ status: "🚀 On-Track", portalStatus: "not_invited", hasCashGoal: false }), "not_started");
});

test("an invited member with no goals is still on track, not reset to not started", () => {
  // Being invited is something we did, not something they did — but it is not
  // enough on its own to drag an On-Track member backwards.
  assert.equal(stage({ status: "🚀 On-Track", portalStatus: "invited", hasCashGoal: false }), "on_track");
});

test("a missing status does not crash and lands somewhere sensible", () => {
  assert.equal(stage({ status: null, portalStatus: "active", hasCashGoal: true }), "on_track");
  assert.equal(stage({ status: null, portalStatus: "not_invited", hasCashGoal: false }), "not_started");
});

test("every stage the deriver can return has display metadata", () => {
  const keys = new Set(MEMBER_STAGES.map((s) => s.key));
  for (const s of ["not_started", "onboarding", "on_track", "off_track", "at_risk", "off_boarded"]) {
    assert.ok(keys.has(s), `${s} is missing from MEMBER_STAGES`);
  }
});

/* ── Cash ──────────────────────────────────────────────────────────────── */

const goals = [
  { client_id: "a", year: 2026, month: 8, goal: 10000 },
  { client_id: "a", year: 2026, month: 9, goal: 20000 },
  { client_id: "a", year: 2026, month: 10, goal: 30000 },
  { client_id: "b", year: 2026, month: 9, goal: 5000 },
  { client_id: "c", year: 2025, month: 9, goal: 99999 }, // another year
];

test("the yearly goal is the sum of the months they have set", () => {
  const cash = buildMemberCash(goals, [], 2026, 9);
  assert.equal(cash.get("a").yearGoal, 60000);
  assert.equal(cash.get("a").monthsSet, 3);
  assert.equal(cash.get("a").monthGoal, 20000);
});

test("goals from another year are not counted", () => {
  const cash = buildMemberCash(goals, [], 2026, 9);
  assert.equal(cash.has("c"), false);
});

test("a member with no goal for this month still has a yearly total", () => {
  const cash = buildMemberCash([{ client_id: "d", year: 2026, month: 3, goal: 7000 }], [], 2026, 9);
  assert.equal(cash.get("d").yearGoal, 7000);
  assert.equal(cash.get("d").monthGoal, null, "an unset month must not read as a goal");
});

test("an unset month and a zero month are different things", () => {
  const zero = buildMemberCash([{ client_id: "z", year: 2026, month: 9, goal: 0 }], [], 2026, 9);
  // A deliberate 0 is a number they entered; it must not vanish into null.
  assert.equal(zero.get("z").monthGoal, 0);
  const unset = buildMemberCash([], [], 2026, 9);
  assert.equal(unset.get("z"), undefined);
});

test("actuals come from the check-in for that month only", () => {
  const cash = buildMemberCash(goals, [
    { client_id: "a", month_date: "2026-09-01", cash_collected: 12000 },
    { client_id: "a", month_date: "2026-08-01", cash_collected: 99000 },
  ], 2026, 9);
  assert.equal(cash.get("a").monthActual, 12000);
});

test("two check-ins for one month do not double-count", () => {
  const cash = buildMemberCash(goals, [
    { client_id: "b", month_date: "2026-09-01", cash_collected: 3000 },
    { client_id: "b", month_date: "2026-09-30", cash_collected: 4500 },
  ], 2026, 9);
  assert.equal(cash.get("b").monthActual, 4500, "the later correction wins, not the sum");
});

test("a check-in from someone with no goals still shows their actual", () => {
  const cash = buildMemberCash([], [{ client_id: "e", month_date: "2026-09-14", cash_collected: 8000 }], 2026, 9);
  assert.equal(cash.get("e").monthActual, 8000);
  assert.equal(cash.get("e").yearGoal, null);
  assert.equal(cash.get("e").monthPct, null, "no goal means no percentage, not 0%");
});

test("percentage is actual against this month's goal", () => {
  const cash = buildMemberCash(goals, [{ client_id: "a", month_date: "2026-09-01", cash_collected: 10000 }], 2026, 9);
  assert.equal(cash.get("a").monthPct, 50);
});

test("beating the goal is allowed to read over 100, but is capped", () => {
  const cash = buildMemberCash(
    [{ client_id: "f", year: 2026, month: 9, goal: 100 }],
    [{ client_id: "f", month_date: "2026-09-01", cash_collected: 1_000_000 }], 2026, 9);
  assert.equal(cash.get("f").monthPct, 999);
});

test("string numbers out of the database are handled", () => {
  const cash = buildMemberCash(
    [{ client_id: "g", year: 2026, month: 9, goal: "2500" }],
    [{ client_id: "g", month_date: "2026-09-01", cash_collected: "1250" }], 2026, 9);
  assert.equal(cash.get("g").monthGoal, 2500);
  assert.equal(cash.get("g").monthActual, 1250);
  assert.equal(cash.get("g").monthPct, 50);
});

test("rows with no client, no goal or a nonsense month are skipped", () => {
  const cash = buildMemberCash([
    { client_id: null, year: 2026, month: 9, goal: 100 },
    { client_id: "h", year: 2026, month: null, goal: 100 },
    { client_id: "h", year: 2026, month: 13, goal: 100 },
    { client_id: "h", year: 2026, month: 9, goal: null },
  ], [], 2026, 9);
  assert.equal(cash.size, 0);
});

test("money reads at a glance and never lies about nothing", () => {
  assert.equal(money(null), "—");
  assert.equal(money(0), "$0");
  assert.equal(money(840), "$840");
  assert.equal(money(12500), "$12.5K");
  assert.equal(money(120000), "$120K");
  assert.equal(money(1_250_000), "$1.3M");
});

test("totals only count the members who have a number", () => {
  const totals = cashTotals([
    { ...EMPTY_CASH, yearGoal: 60000, monthGoal: 20000, monthActual: 10000 },
    { ...EMPTY_CASH, yearGoal: 5000, monthGoal: 5000, monthActual: null },
    { ...EMPTY_CASH },
  ]);
  assert.equal(totals.yearGoal, 65000);
  assert.equal(totals.monthGoal, 25000);
  assert.equal(totals.monthActual, 10000);
  assert.equal(totals.withGoal, 2);
  assert.equal(totals.withActual, 1, "a member who has not checked in is not counted as zero");
  assert.equal(totals.monthPct, 40);
});

test("the default period is this month, one-indexed", () => {
  assert.deepEqual(currentPeriod(new Date("2026-09-10T12:00:00Z")), { year: 2026, month: 9 });
  assert.deepEqual(currentPeriod(new Date("2026-01-31T12:00:00Z")), { year: 2026, month: 1 });
});
