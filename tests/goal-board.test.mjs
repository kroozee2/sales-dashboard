import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoalBoard,
  daysUntil,
  elapsedFraction,
  goalStatus,
  isoDaysFromNow,
  monthLabel,
  projectedTotal,
  sectionProgress,
  sortByUrgency,
} from "../lib/goal-board.ts";

// Wed 2026-09-16 at midnight — exactly 15 of September's 30 days gone, so
// "on pace" is exactly half the target and the boundaries are unambiguous.
const NOW = new Date(2026, 8, 16, 0, 0, 0);

const goal = (overrides = {}) => ({
  target_amount: 100,
  period: "monthly",
  target_date: null,
  created_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

test("elapsed fraction tracks the goal's own window", () => {
  assert.equal(elapsedFraction(goal(), NOW), 0.5);
  assert.equal(elapsedFraction(goal({ period: "annual" }), NOW).toFixed(2), "0.71");
  assert.ok(elapsedFraction(goal({ period: "quarterly" }), NOW) > 0.8);
  assert.equal(elapsedFraction(goal({ period: "one_time", target_date: null }), NOW), null);
});

test("a one-time goal is measured against its own date, not the month", () => {
  const g = goal({ period: "one_time", target_date: "2026-09-21", created_at: "2026-09-11T12:00:00" });
  const f = elapsedFraction(g, NOW);
  assert.ok(f > 0.4 && f < 0.6, `half way from Sep 11 to Sep 21, got ${f}`);
});

test("status is progress measured against time, not against zero", () => {
  // Half way through the month.
  assert.equal(goalStatus(goal(), 60, NOW), "ontrack");   // ahead of pace
  assert.equal(goalStatus(goal(), 50, NOW), "ontrack");   // exactly on pace
  assert.equal(goalStatus(goal(), 45, NOW), "atrisk");    // within 15% of pace
  assert.equal(goalStatus(goal(), 20, NOW), "behind");
  assert.equal(goalStatus(goal(), 100, NOW), "achieved");
  assert.equal(goalStatus(goal(), 250, NOW), "achieved"); // overshooting still counts
});

test("a date that has passed without the number is behind, whatever the pace says", () => {
  assert.equal(goalStatus(goal({ target_date: "2026-09-01" }), 99, NOW), "behind");
  // ...unless it actually landed.
  assert.equal(goalStatus(goal({ target_date: "2026-09-01" }), 100, NOW), "achieved");
});

test("a goal with no measurable window is not called behind", () => {
  assert.equal(goalStatus(goal({ period: "one_time", target_date: null }), 0, NOW), "ontrack");
});

test("projection extrapolates from pace and holds off while it's too early", () => {
  assert.ok(Math.abs(projectedTotal(goal(), 50, NOW) - 100) < 4);
  const dayOne = new Date(2026, 8, 1, 0, 10);
  assert.equal(projectedTotal(goal(), 0, dayOne), null);
});

test("days until goes negative once the date is past", () => {
  assert.equal(daysUntil("2026-09-16", NOW), 0);
  assert.equal(daysUntil("2026-09-20", NOW), 4);
  assert.equal(daysUntil("2026-09-10", NOW), -6);
});

test("the board puts past due first, then this week, then months, then ongoing", () => {
  const goals = [
    { id: "later", ...goal({ target_date: "2026-11-30" }) },
    { id: "ongoing", ...goal({ target_date: null }) },
    { id: "missed", ...goal({ target_date: "2026-08-31" }) },
    { id: "week", ...goal({ target_date: "2026-09-19" }) },
    { id: "won", ...goal({ target_date: "2026-09-19" }) },
  ];
  const statusOf = (g) => (g.id === "won" ? "achieved" : "behind");
  const board = buildGoalBoard(goals, statusOf, "2026-09-16", "2026-09-23");

  assert.deepEqual(board.sections.map((s) => s.key), ["missed", "week", "m-2026-11", "ongoing"]);
  assert.equal(board.sections[2].label, "November 2026");
  assert.deepEqual(board.achievedItems.map((g) => g.id), ["won"]);
  assert.deepEqual(board.counts, { behind: 1, week: 1, open: 4, achieved: 1 });
});

test("achieved goals leave the flow entirely", () => {
  const goals = [{ id: "a", ...goal({ target_date: "2026-08-01" }) }];
  const board = buildGoalBoard(goals, () => "achieved", "2026-09-16", "2026-09-23");
  assert.deepEqual(board.sections, []);
  assert.equal(board.achievedItems.length, 1);
  assert.equal(board.counts.open, 0);
});

test("within a section, the most at-risk goal is on top", () => {
  const items = [
    { id: "ok", d: "2026-09-30" },
    { id: "bad", d: "2026-09-29" },
    { id: "risky", d: "2026-09-28" },
  ];
  const status = { ok: "ontrack", bad: "behind", risky: "atrisk" };
  const sorted = sortByUrgency(items, (i) => status[i.id], (i) => i.d);
  assert.deepEqual(sorted.map((i) => i.id), ["bad", "risky", "ok"]);
});

test("equally urgent goals fall back to soonest due, blanks last", () => {
  const items = [{ id: "none", d: null }, { id: "late", d: "2026-12-01" }, { id: "soon", d: "2026-09-20" }];
  const sorted = sortByUrgency(items, () => "ontrack", (i) => i.d);
  assert.deepEqual(sorted.map((i) => i.id), ["soon", "late", "none"]);
});

test("section progress averages completion rather than summing across units", () => {
  // $80K of $100K next to 1 of 4 tickets: 80% and 25% average to 52.5%.
  const items = [{ c: 80000, t: 100000 }, { c: 1, t: 4 }];
  const { pct, complete } = sectionProgress(items, (i) => i.c, (i) => i.t);
  assert.equal(pct.toFixed(1), "52.5");
  assert.equal(complete, 0);
});

test("section progress counts what has landed and never exceeds 100", () => {
  const items = [{ c: 200, t: 100 }, { c: 100, t: 100 }];
  const { pct, complete } = sectionProgress(items, (i) => i.c, (i) => i.t);
  assert.equal(pct, 100);
  assert.equal(complete, 2);
  assert.deepEqual(sectionProgress([], (i) => i.c, (i) => i.t), { pct: 0, complete: 0 });
});

test("a goal with no target does not fake progress", () => {
  const { pct } = sectionProgress([{ c: 500, t: 0 }], (i) => i.c, (i) => i.t);
  assert.equal(pct, 0);
});

test("month labels and relative dates read as written", () => {
  assert.equal(monthLabel("2026-11-01"), "November 2026");
  assert.equal(monthLabel(null), "No date yet");
  assert.equal(isoDaysFromNow(7, NOW), "2026-09-23");
  assert.equal(isoDaysFromNow(0, NOW), "2026-09-16");
});

test("a level goal is read against its number, not against the clock", () => {
  const mrr = goal({ track_mode: "level", target_amount: 35000 });
  // Day 1 of the month, already holding 90% — a running total would call this
  // wildly ahead; a level is simply on track.
  const dayOne = new Date(2026, 8, 1, 9);
  assert.equal(goalStatus(mrr, 32000, dayOne), "ontrack");
  assert.equal(goalStatus(mrr, 25000, dayOne), "atrisk");
  assert.equal(goalStatus(mrr, 10000, dayOne), "behind");
  assert.equal(goalStatus(mrr, 35000, dayOne), "achieved");
});

test("a level is never projected forward", () => {
  assert.equal(projectedTotal(goal({ track_mode: "level" }), 22197, NOW), null);
  assert.ok(projectedTotal(goal({ track_mode: "accumulates" }), 50, NOW) !== null);
});
