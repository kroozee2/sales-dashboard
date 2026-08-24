import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createBriefFromInput,
  mergeBrief,
  parseBriefDocument,
  toggleChecklistItem,
} from "../lib/morning-brief.ts";
import { organizeMorningBrief } from "../lib/morning-brief-view.ts";

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

test("the assistant workspace keeps outreach first and calendar calls second", () => {
  const sections = organizeMorningBrief(`## Your 3 Wins Today
1. Finish the offer.

## Schedule + Preparation
**9:00 AM, Client call:** Review the plan.

## Important Inbox
- Alex needs a reply.

## Replies Ready for Approval
**Alex, WhatsApp**
Draft: “Checking in.”

## 3. Sales Calls
### Future Sales Calls
- Call Jordan tomorrow.

## Clients + Client Actions
- Send Maria the implementation plan.

## Suggested Game Plan
- Protect the first focus block.`);

  assert.deepEqual(sections.map((section) => section.id), ["morning-setter", "calls-today", "sales", "clients", "priorities", "details"]);
  assert.match(sections[0].content, /Alex needs a reply/);
  assert.match(sections[0].content, /Checking in/);
  assert.match(sections[1].content, /9:00 AM, Client call/);
  assert.match(sections[2].content, /Jordan/);
  assert.match(sections[3].content, /Maria/);
  assert.match(sections[4].content, /Finish the offer/);
  assert.match(sections[5].content, /Protect the first focus block/);
});

test("the redesigned page exposes past and future sales calls as a dedicated workspace", () => {
  assert.match(page, /Morning Setter/);
  assert.match(page, /2\. Calls Today/);
  assert.match(page, /3\. Sales Calls/);
  assert.match(page, /Past Sales Calls/);
  assert.match(page, /Future Sales Calls/);
  assert.match(page, /4\. Client Success/);
  assert.match(page, /\/api\/home\?period=month/);
});
