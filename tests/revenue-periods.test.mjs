import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketIndex,
  fullPeriodLength,
  pctChange,
  periodWindow,
  previousWindow,
  projectTotal,
  weekStart,
} from "../lib/revenue-periods.ts";

// Wed 2026-09-17, 10:00 local — mid-month, mid-week, mid-quarter.
const NOW = new Date(2026, 8, 17, 10, 0, 0);
const at = (y, m, d, h = 12) => Math.floor(new Date(y, m, d, h).getTime() / 1000);

test("MTD covers day 1 through today, one bucket per day", () => {
  const w = periodWindow("mtd", NOW);
  assert.equal(w.labels.length, 17);
  assert.equal(w.labels[0], "Sep 1");
  assert.equal(w.labels[16], "Sep 17");
  assert.equal(w.edges.length, 18);
  assert.equal(w.gte, at(2026, 8, 1, 0));
});

test("a charge lands in the bucket for its own day", () => {
  const w = periodWindow("mtd", NOW);
  assert.equal(bucketIndex(w.edges, at(2026, 8, 1, 0)), 0);
  assert.equal(bucketIndex(w.edges, at(2026, 8, 1, 23)), 0);
  assert.equal(bucketIndex(w.edges, at(2026, 8, 2, 0)), 1);
  assert.equal(bucketIndex(w.edges, at(2026, 8, 17, 9)), 16);
});

test("charges outside the window are not charted", () => {
  const w = periodWindow("mtd", NOW);
  assert.equal(bucketIndex(w.edges, at(2026, 7, 31, 23)), -1);
  assert.equal(bucketIndex(w.edges, at(2026, 8, 18, 1)), -1);
});

test("WTD starts on Monday and runs through today", () => {
  const w = periodWindow("wtd", NOW);
  assert.equal(weekStart(NOW).getDate(), 14); // Mon Sep 14
  assert.equal(w.labels.length, 4); // Mon..Thu
  assert.match(w.labels[0], /^Mon/);
  assert.match(w.labels[3], /^Thu/);
});

test("QTD and YTD bucket by month up to the current one", () => {
  assert.deepEqual(periodWindow("qtd", NOW).labels, ["Jul", "Aug", "Sep"]);
  assert.deepEqual(periodWindow("ytd", NOW).labels, [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
  ]);
});

test("all time buckets by year and has no lower bound", () => {
  const w = periodWindow("alltime", NOW);
  assert.equal(w.gte, null);
  assert.equal(w.labels[0], "2020");
  assert.equal(w.labels[w.labels.length - 1], "2026");
});

test("the previous window is the same stretch, one period back", () => {
  const prev = previousWindow("mtd", NOW);
  assert.equal(prev.labels.length, 17);
  assert.equal(prev.labels[0], "Aug 1");
  assert.equal(prev.labels[16], "Aug 17");
  assert.equal(prev.lt, at(2026, 7, 18, 0));
});

test("a short previous month is clamped, not rolled into the next", () => {
  // Mar 31 vs February: compare through Feb 28, not into March.
  const prev = previousWindow("mtd", new Date(2026, 2, 31, 10));
  assert.equal(prev.labels.length, 28);
  assert.equal(prev.labels[27], "Feb 28");
  assert.equal(prev.lt, at(2026, 2, 1, 0));
});

test("previous windows step back a week, a quarter and a year", () => {
  assert.match(previousWindow("wtd", NOW).labels[0], /Sep 7/);
  assert.deepEqual(previousWindow("qtd", NOW).labels, ["Apr", "May", "Jun"]);
  const ytd = previousWindow("ytd", NOW);
  assert.equal(ytd.labels.length, 9);
  assert.equal(ytd.gte, at(2025, 0, 1, 0));
});

test("all time has nothing to compare against", () => {
  assert.equal(previousWindow("alltime", NOW), null);
});

test("percent change needs a base to divide by", () => {
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(50, 100), -50);
  assert.equal(pctChange(100, 0), null);
});

test("projection extrapolates from elapsed time and stops when complete", () => {
  assert.equal(projectTotal(1700, 17, 30), 3000);
  assert.equal(projectTotal(1700, 30, 30), null);
  assert.equal(projectTotal(0, 0, 30), null);
});

test("full period length knows how long the month actually is", () => {
  assert.equal(fullPeriodLength("mtd", NOW), 30); // September
  assert.equal(fullPeriodLength("mtd", new Date(2026, 1, 10)), 28);
  assert.equal(fullPeriodLength("wtd", NOW), 7);
  assert.equal(fullPeriodLength("alltime", NOW), 0);
});
