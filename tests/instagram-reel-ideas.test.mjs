import assert from "node:assert/strict";
import test from "node:test";

import {
  REEL_IDEA_TYPES,
  buildReelIdeaPayload,
  buildReelStagePatch,
  getReelStage,
  isReelIdeaBoardItem,
  normalizeReelTitle,
} from "../lib/instagram-reel-ideas.ts";
import { deterministicReelIdeaId } from "../lib/instagram-reel-id.ts";

test("reel idea capture offers Andrew's four Reel types", () => {
  assert.deepEqual(
    REEL_IDEA_TYPES.map(({ key, label }) => ({ key, label })),
    [
      { key: "connection", label: "Connection" },
      { key: "value", label: "Value" },
      { key: "proof", label: "Proof" },
      { key: "action", label: "Call to action" },
    ],
  );
});

test("a new Reel idea is unscheduled until Andrew chooses a shoot date", () => {
  assert.deepEqual(buildReelIdeaPayload("  My first hire  ", "connection", ""), {
    title: "My first hire",
    platforms: ["instagram"],
    creative_type: "video",
    category: "connection",
    status: "idea",
    scheduled_date: null,
    meta: {
      reel_stage: "idea",
      reel_workflow: "idea_board",
    },
  });
});

test("a chosen shoot date is preserved as a date-only calendar value", () => {
  assert.equal(buildReelIdeaPayload("Shoot this", "value", "2026-09-12").scheduled_date, "2026-09-12");
});

test("invalid, database-hostile, or empty Reel ideas are rejected", () => {
  assert.throws(() => buildReelIdeaPayload("   ", "value", null), /title/i);
  assert.throws(() => buildReelIdeaPayload("Idea\0bad", "value", null), /title/i);
  assert.throws(() => buildReelIdeaPayload("Idea", "question", null), /type/i);
  assert.throws(() => buildReelIdeaPayload("Idea", "proof", "2026-02-30"), /date/i);
  assert.throws(() => buildReelIdeaPayload("Idea", "proof", "0000-01-01"), /date/i);
});

test("Idea, Shot, and Posted stages map cleanly onto shared content statuses", () => {
  assert.deepEqual(buildReelStagePatch("idea", { note: "keep" }), {
    status: "idea",
    meta: { note: "keep", reel_stage: "idea", reel_workflow: "idea_board" },
  });
  assert.deepEqual(buildReelStagePatch("shot", { note: "keep" }), {
    status: "drafted",
    meta: { note: "keep", reel_stage: "shot", reel_workflow: "idea_board" },
  });
  assert.deepEqual(buildReelStagePatch("posted", { note: "keep" }), {
    status: "posted",
    meta: { note: "keep", reel_stage: "posted", reel_workflow: "idea_board" },
  });
});

test("only explicit Reel idea-board records appear in the Notes-style lists", () => {
  const base = buildReelIdeaPayload("An idea", "proof", null);
  assert.equal(isReelIdeaBoardItem(base), true);
  assert.equal(isReelIdeaBoardItem({ ...base, creative_type: "picture" }), false);
  assert.equal(isReelIdeaBoardItem({ ...base, meta: {} }), false);
});

test("legacy posted idea-board records still display as Posted", () => {
  assert.equal(getReelStage({ status: "posted", meta: { reel_workflow: "idea_board" } }), "posted");
  assert.equal(getReelStage({ status: "drafted", meta: { reel_workflow: "idea_board" } }), "idea");
});

test("normalized titles and deterministic ids make retries and cross-tab creates idempotent", () => {
  assert.equal(normalizeReelTitle("  My   FIRST\nHire "), "my first hire");
  assert.equal(
    deterministicReelIdeaId("My First Hire"),
    deterministicReelIdeaId("  my   first hire "),
  );
  assert.match(deterministicReelIdeaId("My First Hire"), /^[0-9a-f-]{36}$/);
  assert.notEqual(deterministicReelIdeaId("My First Hire"), deterministicReelIdeaId("Another idea"));
});
