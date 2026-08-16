import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CONTENT_CADENCE,
  CONTENT_FOCUS_AREAS,
  contentCadenceProgress,
  groupContentBySchedule,
  moveContentToScheduleGroup,
  scheduleGroupOf,
  sortContentSpreadsheetItems,
} from "../lib/content-spreadsheet.ts";
import { sanitizeContentPatch } from "../lib/content-item-validation.ts";
import { CATEGORIES, CONTENT_STATUSES, PLATFORMS } from "../lib/content-constants.ts";

const allowedPatchValues = {
  categories: CATEGORIES.map((entry) => entry.key),
  statuses: CONTENT_STATUSES.map((entry) => entry.key),
  platforms: PLATFORMS.map((entry) => entry.key),
};

const item = (overrides = {}) => ({
  id: "item-1",
  title: "Teach the offer ecosystem",
  category: "value",
  status: "scheduled",
  scheduled_date: "2026-08-16",
  platforms: ["instagram"],
  created_at: "2026-08-01T12:00:00.000Z",
  ...overrides,
});

const today = "2026-08-16";

test("renders the spreadsheet underneath Calendar instead of as a separate tab", () => {
  const page = readFileSync(new URL("../app/content/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /key:\s*"spreadsheet"/);
  assert.match(page, /tab === "calendar"[\s\S]{0,1600}<CalendarTab[\s\S]{0,1600}<ContentSpreadsheet/);
});

test("spreadsheet deletion requires an explicit confirmation", () => {
  const page = readFileSync(new URL("../app/content/page.tsx", import.meta.url), "utf8");
  const spreadsheet = readFileSync(new URL("../components/content-spreadsheet.tsx", import.meta.url), "utf8");
  assert.match(page, /<ContentSpreadsheet[\s\S]{0,800}onDelete=\{delItem\}/);
  assert.match(spreadsheet, /Delete this content\?/);
  assert.match(spreadsheet, /Yes, delete it/);
  assert.match(spreadsheet, /const deleted = await onDelete\(confirmItem\.id\)/);
});

test("classifies active content into overdue, today, upcoming, and unscheduled", () => {
  assert.equal(scheduleGroupOf(item({ scheduled_date: "2026-08-15" }), today), "overdue");
  assert.equal(scheduleGroupOf(item({ scheduled_date: today }), today), "today");
  assert.equal(scheduleGroupOf(item({ scheduled_date: "2026-08-17" }), today), "upcoming");
  assert.equal(scheduleGroupOf(item({ scheduled_date: null }), today), "unscheduled");
});

test("posted content is omitted from the working spreadsheet", () => {
  assert.equal(scheduleGroupOf(item({ status: "posted" }), today), null);

  const groups = groupContentBySchedule([
    item({ id: "open" }),
    item({ id: "posted", status: "posted" }),
  ], today);

  assert.deepEqual(groups.today.map((entry) => entry.id), ["open"]);
  assert.equal(groups.overdue.length + groups.upcoming.length + groups.unscheduled.length, 0);
});

test("sorts spreadsheet rows by date, category, then title", () => {
  const rows = [
    item({ id: "z", title: "Zulu", category: "value", scheduled_date: "2026-08-18" }),
    item({ id: "b", title: "Beta", category: "connection", scheduled_date: "2026-08-17" }),
    item({ id: "a", title: "Alpha", category: "connection", scheduled_date: "2026-08-17" }),
  ];

  assert.deepEqual(sortContentSpreadsheetItems(rows).map((entry) => entry.id), ["a", "b", "z"]);
});

test("dragging a row to a schedule section maps to a useful editable date", () => {
  assert.equal(moveContentToScheduleGroup("today", today), today);
  assert.equal(moveContentToScheduleGroup("upcoming", today), "2026-08-17");
  assert.equal(moveContentToScheduleGroup("overdue", today), "2026-08-15");
  assert.equal(moveContentToScheduleGroup("unscheduled", today), null);
});

test("tracks Andrew's weekly publishing rhythm and daily Instagram coverage", () => {
  const progress = contentCadenceProgress([
    item({ id: "ig-mon-reel", platforms: ["instagram"], scheduled_date: "2026-08-10" }),
    item({ id: "ig-mon-carousel", platforms: ["carousel"], scheduled_date: "2026-08-10" }),
    item({ id: "ig-tue-carousel", platforms: ["carousel"], scheduled_date: "2026-08-11" }),
    item({ id: "ig-static-post", platforms: ["instagram_post"], scheduled_date: "2026-08-12" }),
    item({ id: "youtube", platforms: ["youtube"], scheduled_date: "2026-08-12" }),
    item({ id: "email-1", platforms: ["email"], scheduled_date: "2026-08-10" }),
    item({ id: "email-2", platforms: ["email"], scheduled_date: "2026-08-12" }),
    item({ id: "email-3", platforms: ["email"], scheduled_date: "2026-08-14" }),
    item({ id: "facebook", platforms: ["facebook"], meta: { content_focus: "methodology" }, scheduled_date: "2026-08-15" }),
    item({ id: "facebook-announcement", platforms: ["facebook"], meta: { content_focus: "offer_launch" }, scheduled_date: "2026-08-15" }),
    item({ id: "next-week", platforms: ["youtube"], scheduled_date: "2026-08-17" }),
  ], today);

  assert.deepEqual(CONTENT_CADENCE.map((entry) => [entry.key, entry.weeklyTarget]), [
    ["youtube", 1], ["instagram", 7], ["email", 3], ["facebook", 1],
  ]);
  assert.deepEqual(Object.fromEntries(Object.entries(progress).map(([key, value]) => [key, value.count])), {
    youtube: 1,
    instagram: 2,
    email: 3,
    facebook: 1,
  });
  assert.deepEqual(CONTENT_FOCUS_AREAS.map((focus) => focus.label), ["Upcoming events", "AI + Claude updates", "Offer launches + CTA", "Core methodologies"]);
  const spreadsheet = readFileSync(new URL("../components/content-spreadsheet.tsx", import.meta.url), "utf8");
  assert.match(spreadsheet, /Weekly publishing rhythm/);
  assert.match(spreadsheet, /contentCadenceProgress\(items, today\)/);
});

test("content patch validation allows spreadsheet fields and strips mass-assignment fields", () => {
  const result = sanitizeContentPatch({
    title: "Updated title",
    scheduled_date: "2026-08-20",
    category: "proof",
    status: "drafted",
    created_at: "should-not-change",
    owner_id: "should-not-change",
  }, allowedPatchValues);

  assert.deepEqual(result.fields, {
    title: "Updated title",
    scheduled_date: "2026-08-20",
    category: "proof",
    status: "drafted",
  });
  assert.deepEqual(result.rejected, ["created_at", "owner_id"]);
});

test("content patch validation rejects invalid enum and date values", () => {
  assert.throws(() => sanitizeContentPatch({ category: "anything" }, allowedPatchValues), /category/i);
  assert.throws(() => sanitizeContentPatch({ status: "deleted" }, allowedPatchValues), /status/i);
  assert.throws(() => sanitizeContentPatch({ scheduled_date: "tomorrow" }, allowedPatchValues), /scheduled_date/i);
});
