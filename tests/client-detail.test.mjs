import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DETAIL_TABS, latestMonth, shapeCalls, shapeCashGoals, shapeCheckIns, shapeNotes,
  shapeProjects, shapeProof, shapeTodos, tabCounts,
} from "../lib/client-detail.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("clicking a client opens the detail view, not just the runbook", () => {
  // The Members list was rebuilt on Helm's shape, but opening a client still
  // showed onboarding and nothing else, so anything real meant opening Helm.
  const workspace = read("../app/clients/clients-workspace.tsx");
  assert.match(workspace, /<ClientDetailDrawer/);
  assert.doesNotMatch(workspace, /<RunbookDrawer/);
  assert.match(workspace, /key=\{openClient\.key\}/, "remount per client so it starts in its loading state");
});

test("the sections are the ones with data behind them", () => {
  assert.deepEqual(DETAIL_TABS.map((t) => t.id),
    ["overview", "calls", "todos", "checkins", "goals", "projects", "proof", "onboarding"]);
});

test("calls read newest first and undated ones sink", () => {
  const calls = shapeCalls([
    { id: "a", call_date: "2026-06-01", title: "Old" },
    { id: "b", call_date: null, title: "Undated" },
    { id: "c", call_date: "2026-09-01", title: "New" },
  ]);
  assert.deepEqual(calls.map((c) => c.title), ["New", "Old", "Undated"]);
});

test("open to-dos come before finished ones", () => {
  // A done list is history. An open list is what you are here to act on.
  const todos = shapeTodos([
    { id: "a", title: "Done thing", done: true, due_date: "2026-09-01" },
    { id: "b", title: "Open thing", done: false, due_date: "2026-09-20" },
    { id: "c", title: "Urgent thing", done: false, due_date: "2026-09-02" },
  ]);
  assert.deepEqual(todos.map((t) => t.title), ["Urgent thing", "Open thing", "Done thing"]);
});

test("projects lead with what they are focused on", () => {
  const projects = shapeProjects([
    { id: "a", name: "Finished", done: true },
    { id: "b", name: "Someday", done: false, is_focus: false },
    { id: "c", name: "Right now", done: false, is_focus: true },
  ]);
  assert.deepEqual(projects.map((p) => p.name), ["Right now", "Someday", "Finished"]);
});

test("proof and testimonials read as one list", () => {
  // Two tables in Helm, one question to a reader: what has this client shown?
  const items = shapeProof(
    [{ id: "p1", headline: "Doubled revenue", one_liner: "From $20k to $40k months", created_at: "2026-08-01T00:00:00Z" }],
    [{ id: "t1", content: "Best decision I made", date: "2026-09-01" }],
  );
  assert.deepEqual(items.map((i) => i.kind), ["testimonial", "proof"]);
  assert.equal(items[1].headline, "Doubled revenue");
});

test("pinned notes stay on top", () => {
  const notes = shapeNotes([
    { id: "a", body: "Recent", created_at: "2026-09-08T00:00:00Z", pinned: false },
    { id: "b", body: "Pinned", created_at: "2026-01-01T00:00:00Z", pinned: true },
    { id: "c", body: "   ", created_at: "2026-09-09T00:00:00Z" },
  ]);
  assert.deepEqual(notes.map((n) => n.body), ["Pinned", "Recent"], "an empty note is not a note");
});

test("money that is missing stays missing", () => {
  // A null cash figure and a zero are different facts about a month.
  const [row] = shapeCheckIns([{ id: "a", month_date: "2026-08-01", cash_collected: null, new_revenue: 0 }]);
  assert.equal(row.cashCollected, null);
  assert.equal(row.newRevenue, 0);
});

test("cash goals read newest month first", () => {
  const goals = shapeCashGoals([
    { id: "a", year: 2026, month: 3, goal: "1000" },
    { id: "b", year: 2026, month: 9, goal: 5000 },
    { id: "c", year: 2025, month: 12, goal: 500 },
  ]);
  assert.deepEqual(goals.map((g) => `${g.year}-${g.month}`), ["2026-9", "2026-3", "2025-12"]);
  assert.equal(goals[1].goal, 1000, "a numeric string is still a number");
});

test("the latest month is the latest month with money in it", () => {
  const rows = shapeCheckIns([
    { id: "a", month_date: "2026-09-01", cash_collected: null, new_revenue: null },
    { id: "b", month_date: "2026-08-01", cash_collected: 12000 },
  ]);
  assert.equal(latestMonth(rows).cashCollected, 12000);
  assert.equal(latestMonth([]), null);
});

test("tab counts show open work, not everything ever done", () => {
  const counts = tabCounts({
    calls: [{}, {}], todos: [{ done: true }, { done: false }], checkIns: [],
    cashGoals: [], projects: [{ done: true }], proof: [{}], tickets: [], notes: [],
  });
  assert.equal(counts.calls, 2);
  assert.equal(counts.todos, 1, "a finished to-do is not a to-do");
  assert.equal(counts.projects, 0);
  assert.equal(counts.checkins, 0);
});

test("the detail route refuses anything that is not a client id", () => {
  const route = read("../app/api/clients/[id]/route.ts");
  assert.match(route, /const UUID = /);
  assert.match(route, /Not a client id/);
  assert.match(route, /\.eq\("client_id", id\)/, "every table is scoped to this one client");
});

test("one round trip, not eight", () => {
  const route = read("../app/api/clients/[id]/route.ts");
  assert.match(route, /await Promise\.all\(\[/);
});

test("an empty testimonial row is not proof", () => {
  // 820 of the 898 testimonial rows carry no text and no media. Showing them
  // would fill the tab with hundreds of blank cards.
  const items = shapeProof([], [
    { id: "a", content: "This changed my business", date: "2026-09-01" },
    { id: "b", content: null, media_url: null, date: "2026-09-02" },
    { id: "c", content: "   ", date: "2026-09-03" },
    { id: "d", content: null, media_url: "https://example.com/v.mp4", date: "2026-09-04" },
  ]);
  assert.equal(items.length, 2, "only rows with something to show");
  assert.deepEqual(items.map((i) => i.id), ["testimonial:d", "testimonial:a"]);
});

test("the header never reports money for a month that has not happened", () => {
  // Check-ins get filed ahead of time, so the newest row can be in the future.
  const rows = shapeCheckIns([
    { id: "future", month_date: "2026-12-01", month_label: "December 2026", cash_collected: 0 },
    { id: "real", month_date: "2026-08-01", month_label: "August 2026", cash_collected: 18000 },
  ]);
  const now = new Date("2026-09-09T12:00:00Z");
  assert.equal(latestMonth(rows, now).monthLabel, "August 2026");
  assert.equal(latestMonth(rows, now).cashCollected, 18000);
});
