import assert from "node:assert/strict";
import test from "node:test";
import {
  coverage, groupByMonth, isConversionEvent, monthLabel, spots, undated,
} from "../lib/events-board.ts";

const NOW = new Date("2026-09-10T12:00:00Z");
const ev = (o = {}) => ({
  id: Math.random().toString(36).slice(2), title: "Event", event_type: "free_webinar",
  start_date: "2026-09-08", end_date: null, price: null, spots_goal: null, signups: 0,
  page_url: null, location: null, notes: null, ...o,
});

test("a conversion event is one that asks for money", () => {
  // A free webinar builds the audience; these convert it, and that is the thing
  // being counted one a month.
  assert.equal(isConversionEvent(ev({ event_type: "paid_webinar" })), true);
  assert.equal(isConversionEvent(ev({ event_type: "paid_trial" })), true);
  assert.equal(isConversionEvent(ev({ event_type: "in_person" })), true);
  assert.equal(isConversionEvent(ev({ event_type: "free_webinar" })), false);
  assert.equal(isConversionEvent(ev({ event_type: "jv_workshop" })), false);
});

test("a priced event counts however it is typed", () => {
  // The price is the stronger signal about what an event is actually for.
  assert.equal(isConversionEvent(ev({ event_type: "free_webinar", price: 97 })), true);
  assert.equal(isConversionEvent(ev({ event_type: "free_webinar", price: 0 })), false);
});

test("events group by the month they actually happen", () => {
  const groups = groupByMonth([
    ev({ title: "Masterclass", start_date: "2026-09-08" }),
    ev({ title: "Mastermind", start_date: "2026-09-18" }),
    ev({ title: "Trial", start_date: "2026-10-05" }),
  ], { now: NOW });
  const sep = groups.find((g) => g.key === "2026-09");
  assert.deepEqual(sep.events.map((e) => e.title), ["Masterclass", "Mastermind"], "in date order within the month");
  assert.equal(groups.find((g) => g.key === "2026-10").events.length, 1);
});

test("a month with no events still gets a row", () => {
  // The empty month is the point. A board that lists only what exists cannot
  // show you the gap you are trying to close.
  const groups = groupByMonth([ev({ start_date: "2026-09-08" })], { back: 1, ahead: 2, now: NOW });
  assert.deepEqual(groups.map((g) => g.key), ["2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.equal(groups.find((g) => g.key === "2026-11").events.length, 0);
});

test("a dated event outside the window still gets a row", () => {
  const groups = groupByMonth([ev({ title: "Far off", start_date: "2027-06-01" })], { back: 0, ahead: 1, now: NOW });
  assert.ok(groups.some((g) => g.key === "2027-06"), "real work must not vanish off the board");
});

test("a month is covered once it has one thing that converts", () => {
  const groups = groupByMonth([
    ev({ start_date: "2026-09-08", event_type: "free_webinar" }),
    ev({ start_date: "2026-10-05", event_type: "paid_trial" }),
  ], { back: 0, ahead: 1, now: NOW });
  assert.equal(groups.find((g) => g.key === "2026-09").covered, false, "a free webinar is not the month's conversion event");
  assert.equal(groups.find((g) => g.key === "2026-10").covered, true);
});

test("months are marked past, current or ahead", () => {
  const groups = groupByMonth([], { back: 1, ahead: 1, now: NOW });
  assert.equal(groups.find((g) => g.key === "2026-08").isPast, true);
  assert.equal(groups.find((g) => g.key === "2026-09").isCurrent, true);
  assert.equal(groups.find((g) => g.key === "2026-10").isPast, false);
});

test("gaps name only the months you can still fix", () => {
  // A missed month is the record. Listing it as a gap is noise you cannot act on.
  const groups = groupByMonth([ev({ start_date: "2026-10-05", event_type: "paid_trial" })], { back: 2, ahead: 2, now: NOW });
  const c = coverage(groups);
  assert.ok(!c.gaps.includes("July 2026"), "past months are not gaps");
  assert.ok(c.gaps.includes("November 2026"));
  assert.ok(!c.gaps.includes("October 2026"), "October has its conversion event");
});

test("spots never overrun the goal", () => {
  assert.deepEqual(spots(ev({ spots_goal: 20, signups: 5 })), { has: true, goal: 20, filled: 5, remaining: 15, pct: 25, full: false });
  const over = spots(ev({ spots_goal: 20, signups: 25 }));
  assert.equal(over.pct, 100, "a 125% bar is not a bar");
  assert.equal(over.remaining, 0);
  assert.equal(over.full, true);
  assert.equal(spots(ev({ spots_goal: null })).has, false, "no goal is not a goal of zero");
  assert.equal(spots(ev({ spots_goal: 20, signups: -3 })).filled, 0);
});

test("undated events are kept where they can be seen", () => {
  const list = [ev({ title: "Someday", start_date: null }), ev({ title: "Dated" })];
  assert.deepEqual(undated(list).map((e) => e.title), ["Someday"]);
  assert.equal(groupByMonth(list, { now: NOW }).flatMap((g) => g.events).length, 1,
    "an undated event has no month, so it must be listed separately rather than dropped");
});

test("month labels read as a person would say them", () => {
  assert.equal(monthLabel("2026-09"), "September 2026");
  assert.equal(monthLabel("2026-12"), "December 2026");
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
const route = readFileSync(new URL("../app/api/content/events/route.ts", import.meta.url), "utf8");
const board = readFileSync(new URL("../components/events-board.tsx", import.meta.url), "utf8");

test("the route writes only columns it names", () => {
  // It used to spread the request body straight into the update, so any key a
  // caller invented reached the table — `id` and `created_at` included.
  assert.match(route, /const EDITABLE = new Set\(/);
  assert.doesNotMatch(route, /const \{ id, \.\.\.fields \} = await req\.json\(\)/);
  for (const field of ["title", "event_type", "start_date", "price", "spots_goal", "signups", "page_url"]) {
    assert.match(route, new RegExp(`"${field}"`), `${field} should be editable`);
  }
  assert.doesNotMatch(route, /"created_at"/, "the row's own timestamps are not the board's to set");
});

test("a negative headcount is refused rather than stored", () => {
  assert.match(route, /must be a number that is not negative/);
});

test("the board is a spreadsheet grouped by month", () => {
  assert.match(board, /<table/);
  assert.match(board, />When</);
  assert.match(board, />Converts</);
  assert.match(board, />Spots left</);
  assert.match(board, /groupByMonth/);
});

test("the seat tracker survived the rewrite", () => {
  // Andrew asked for this one by name: it is the thing he reads on the tab.
  assert.match(board, /left`}/);
  assert.match(board, /Full/);
  assert.match(board, /style=\{\{ width: `\$\{seat\.pct\}%` \}\}/);
});

test("every editable cell says what it is for a screen reader", () => {
  for (const label of ["Date for", "Event title", "Type for", "Price for", "Signups for", "Seat goal for", "Signup link for"]) {
    assert.ok(board.includes(label), `missing aria-label: ${label}`);
  }
});
