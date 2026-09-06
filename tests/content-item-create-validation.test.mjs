import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { sanitizeContentCreate } from "../lib/content-item-validation.ts";

const allowed = {
  categories: ["connection", "value", "proof", "action", "question"],
  statuses: ["idea", "drafted", "scheduled", "posted"],
  platforms: ["instagram", "carousel", "youtube"],
};

test("content create accepts a consistent bounded Reel idea and preserves workflow metadata", () => {
  const result = sanitizeContentCreate({
    title: "My First Hire",
    category: "connection",
    status: "drafted",
    scheduled_date: null,
    platforms: ["instagram"],
    creative_type: "video",
    meta: { reel_stage: "shot", reel_workflow: "idea_board" },
  }, allowed);
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(result.fields.meta, { reel_stage: "shot", reel_workflow: "idea_board" });
});

test("content create rejects unsupported, incomplete, or database-hostile records", () => {
  assert.throws(() => sanitizeContentCreate({ title: "Idea", admin: true }, allowed), /unsupported fields: admin/i);
  assert.throws(() => sanitizeContentCreate({ category: "value", status: "idea", platforms: [] }, allowed), /title/i);
  assert.throws(() => sanitizeContentCreate({ title: "Idea", category: "growth", status: "idea", platforms: [] }, allowed), /category/i);
  assert.throws(() => sanitizeContentCreate({ title: "Bad\0title", category: "value", status: "idea", platforms: [] }, allowed), /title/i);
  assert.throws(() => sanitizeContentCreate({ title: "Idea", category: "value", status: "idea", platforms: [], creative_type: "movie" }, allowed), /creative_type/i);
  assert.throws(() => sanitizeContentCreate({ title: "Idea", category: "value", status: "idea", platforms: [], event_id: "not-an-id" }, allowed), /event_id/i);
});

test("content create rejects inconsistent Reel workflow stage and shared status", () => {
  assert.throws(() => sanitizeContentCreate({
    title: "My First Hire",
    category: "connection",
    status: "idea",
    platforms: ["instagram"],
    creative_type: "video",
    meta: { reel_stage: "shot", reel_workflow: "idea_board" },
  }, allowed), /stage.*status/i);
});

test("content route bounds JSON before parsing and inserts only sanitized fields", () => {
  const source = fs.readFileSync(new URL("../app/api/content/route.ts", import.meta.url), "utf8");
  assert.match(source, /readBoundedRequestBody/);
  assert.match(source, /sanitizeContentCreate/);
  assert.doesNotMatch(source, /\.insert\(body\)/);
});

test("all content mutations share the bounded JSON reader and protect Reel workflow fields", () => {
  const source = fs.readFileSync(new URL("../app/api/content/route.ts", import.meta.url), "utf8");
  assert.match(source, /async function readContentJsonObject/);
  assert.equal(source.match(/readContentJsonObject\(req\)/g)?.length, 3);
  assert.match(source, /Existing Reel idea-board records must use the Instagram Reel Ideas endpoint/);
  assert.match(source, /New Reel idea-board records must use the Instagram Reel Ideas endpoint/);
});


test("content create accepts only a valid optional deterministic UUID", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const valid = sanitizeContentCreate({ id, title: "Imported actual", category: "connection", status: "posted", platforms: ["youtube"] }, allowed);
  assert.equal(valid.fields.id, id);
  assert.throws(() => sanitizeContentCreate({ id: "not-a-uuid", title: "Imported actual", category: "connection", status: "posted", platforms: ["youtube"] }, allowed), /id must be a valid UUID/);
});
