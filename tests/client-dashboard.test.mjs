import assert from "node:assert/strict";
import test from "node:test";
import {
  averageNps, checkInCompliance, contactRecency, monthlySeries, peak,
} from "../lib/client-dashboard.ts";
import { shapeCheckIns } from "../lib/client-detail.ts";

const NOW = new Date("2026-09-09T12:00:00Z");
const row = (o) => ({ id: Math.random().toString(36).slice(2), ...o });

test("months are keyed from the date, not from what someone typed", () => {
  // "Aug 2026", "August 2026" and "august 2026" are one month. Keyed on the
  // label they were three bars.
  const points = monthlySeries(shapeCheckIns([
    row({ month_date: "2026-08-01", month_label: "Aug 2026", cash_collected: 1000 }),
    row({ month_date: "2026-08-14", month_label: "August 2026", cash_collected: 2000 }),
    row({ month_date: "2026-08-30", month_label: "august 2026", cash_collected: 500 }),
  ]), 12, NOW);
  assert.equal(points.length, 1);
  assert.equal(points[0].cash, 3500);
  assert.equal(points[0].checkIns, 3);
});

test("a month nobody has lived through is not a collapse", () => {
  // Check-ins get filed ahead. A zero bar on the right-hand edge reads as the
  // business falling off a cliff.
  const points = monthlySeries(shapeCheckIns([
    row({ month_date: "2026-08-01", cash_collected: 40000 }),
    row({ month_date: "2026-12-01", cash_collected: 0 }),
  ]), 12, NOW);
  assert.deepEqual(points.map((p) => p.key), ["2026-08"]);
});

test("the current month counts, future ones do not", () => {
  const points = monthlySeries(shapeCheckIns([
    row({ month_date: "2026-09-01", cash_collected: 12000 }),
    row({ month_date: "2026-10-01", cash_collected: 99000 }),
  ]), 12, NOW);
  assert.deepEqual(points.map((p) => p.key), ["2026-09"]);
});

test("months read oldest to newest and only the window is kept", () => {
  const rows = Array.from({ length: 18 }, (_, i) =>
    row({ month_date: `2025-${String((i % 12) + 1).padStart(2, "0")}-01`, cash_collected: 100 }));
  const points = monthlySeries(shapeCheckIns(rows), 6, NOW);
  assert.equal(points.length, 6);
  assert.ok(points[0].key < points[5].key, "left to right is old to new");
});

test("a missing cash figure is not a zero", () => {
  const points = monthlySeries(shapeCheckIns([
    row({ month_date: "2026-08-01", cash_collected: null, new_revenue: 5000 }),
  ]), 12, NOW);
  assert.equal(points[0].cash, 0, "nothing to add is nothing added");
  assert.equal(points[0].newRevenue, 5000);
});

test("NPS is a mean of the scores in that month, ignoring blanks", () => {
  const points = monthlySeries(shapeCheckIns([
    row({ month_date: "2026-08-01", nps: 10 }),
    row({ month_date: "2026-08-02", nps: 8 }),
    row({ month_date: "2026-08-03", nps: null }),
  ]), 12, NOW);
  assert.equal(points[0].nps, 9);
});

test("the chart scales to the tallest bar in view", () => {
  const points = monthlySeries(shapeCheckIns([
    row({ month_date: "2026-07-01", cash_collected: 1000 }),
    row({ month_date: "2026-08-01", cash_collected: 9000 }),
  ]), 12, NOW);
  assert.equal(peak(points, (p) => p.cash), 9000);
  assert.equal(peak([], (p) => p.cash), 0, "an empty chart must not divide by zero");
});

test("compliance is of the clients who were actually asked", () => {
  // Measured against everyone ever, a growing roster looks like collapsing
  // discipline.
  const rows = new Map([
    ["a", shapeCheckIns([row({ month_date: "2026-09-01" })])],
    ["b", shapeCheckIns([row({ month_date: "2026-08-01" })])],
  ]);
  assert.deepEqual(checkInCompliance(["a", "b"], rows, NOW), { submitted: 1, expected: 2, pct: 50 });
  assert.deepEqual(checkInCompliance([], rows, NOW), { submitted: 0, expected: 0, pct: 0 });
});

test("contact recency separates never from merely overdue", () => {
  const bands = contactRecency([1, 3, 9, 20, 40, null, null]);
  assert.deepEqual(bands.map((b) => [b.label, b.count]), [
    ["This week", 2], ["1–2 weeks", 1], ["14+ days", 2], ["Never", 2],
  ]);
});

test("average NPS uses each client's most recent scored month", () => {
  const rows = new Map([
    ["a", shapeCheckIns([row({ month_date: "2026-09-01", nps: 6 }), row({ month_date: "2026-01-01", nps: 10 })])],
    ["b", shapeCheckIns([row({ month_date: "2026-09-01", nps: null }), row({ month_date: "2026-08-01", nps: 8 })])],
    ["c", shapeCheckIns([row({ month_date: "2026-09-01" })])],
  ]);
  assert.equal(averageNps(rows, ["a", "b", "c"]), 7, "6 and 8; the unscored client does not drag it to zero");
  assert.equal(averageNps(new Map(), ["a"]), null);
});
