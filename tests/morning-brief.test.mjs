import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createBriefFromInput,
  mergeBrief,
  parseBriefDocument,
  toggleChecklistItem,
} from "../lib/morning-brief.ts";

const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/morning-brief/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/morning-briefs/route.ts", import.meta.url), "utf8");

const input = {
  date: "2026-08-21",
  title: "Morning Brief, Friday, August 21",
  summary: "Three decisions need Andrew's attention.",
  content: "## Morning Brief\n\nFull briefing body.",
  checklist: [
    { title: "Resolve the sponsorship balance", section: "Your 3 Wins Today" },
    { title: "Review the Supabase warning", section: "Risk" },
  ],
};

test("valid morning briefs become bounded versioned records", () => {
  const brief = createBriefFromInput(input, "2026-08-21T13:30:00.000Z", () => "fixed-id");
  assert.equal(brief.id, "2026-08-21");
  assert.equal(brief.checklist.length, 2);
  assert.equal(brief.checklist[0].done, false);
  assert.equal(brief.checklist[0].id, "fixed-id");
  assert.equal(parseBriefDocument(JSON.stringify({ version: 1, briefs: [brief] })).briefs[0].date, input.date);
  assert.throws(() => createBriefFromInput({ ...input, unknown: true }), /unknown/i);
  assert.throws(() => createBriefFromInput({ ...input, content: "x".repeat(30_001) }), /content/i);
});

test("a same-day refresh preserves completed checklist items by exact normalized title", () => {
  const first = createBriefFromInput(input, "2026-08-21T13:30:00.000Z", (() => { let i = 0; return () => `id-${++i}`; })());
  const checked = toggleChecklistItem(first, first.checklist[0].id, true, first.revision, "2026-08-21T14:00:00.000Z", () => "rev-2");
  const refreshed = createBriefFromInput({ ...input, summary: "Updated summary" }, "2026-08-21T14:30:00.000Z", (() => { let i = 9; return () => `id-${++i}`; })());
  const merged = mergeBrief(checked, refreshed);
  assert.equal(merged.summary, "Updated summary");
  assert.equal(merged.checklist[0].done, true);
  assert.equal(merged.checklist[0].completed_at, "2026-08-21T14:00:00.000Z");
  assert.equal(merged.checklist[1].done, false);
});

test("checklist updates reject stale revisions and unknown item ids", () => {
  const brief = createBriefFromInput(input, "2026-08-21T13:30:00.000Z", (() => { let i = 0; return () => `id-${++i}`; })());
  assert.throws(() => toggleChecklistItem(brief, brief.checklist[0].id, true, "stale"), /stale/i);
  assert.throws(() => toggleChecklistItem(brief, "missing", true, brief.revision), /not found/i);
});

test("Morning Brief is a first-class Command tab with a saved checklist UI", () => {
  assert.match(sidebar, /href: "\/morning-brief", label: "Morning Brief"[^\n]+section: "Command"/);
  assert.match(page, /Morning Brief/);
  assert.match(page, /\/api\/morning-briefs/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /completed_at/);
  assert.match(route, /MORNING_BRIEFS_KEY/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});
