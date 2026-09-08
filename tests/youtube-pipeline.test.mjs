import assert from "node:assert/strict";
import test from "node:test";
import {
  PIPELINE_STEPS, buildPipeline, nextStep, readiness, readinessScore, stageOf,
} from "../lib/youtube.ts";

const item = (overrides = {}) => ({
  id: "1", title: "A video", scheduled_date: null, media_urls: [], video_script: null,
  meta: { video_stage: "idea" }, ...overrides,
});

test("readiness is read off the record, not ticked by hand", () => {
  assert.deepEqual(readiness(item()), { angle: false, script: false, thumbnail: false, shoot: false });

  const full = item({
    meta: { video_stage: "recording", target_viewer: "Coaches at $20k", promise: "Fill the calendar", shoot_at: "2026-09-12T15:00:00Z" },
    video_script: "Hook...",
    media_urls: ["https://example.com/thumb.png"],
  });
  assert.deepEqual(readiness(full), { angle: true, script: true, thumbnail: true, shoot: true });
});

test("an angle needs both halves — who it's for and what they get", () => {
  assert.equal(readiness(item({ meta: { target_viewer: "Coaches" } })).angle, false);
  assert.equal(readiness(item({ meta: { promise: "More calls" } })).angle, false);
  assert.equal(readiness(item({ meta: { target_viewer: "Coaches", promise: "More calls" } })).angle, true);
});

test("a generated package counts as a script even before the text is copied out", () => {
  assert.equal(readiness(item({ meta: { youtube_package: { recommendedTitle: "x" } } })).script, true);
  assert.equal(readiness(item({ video_script: "   " })).script, false, "whitespace is not a script");
});

test("the score is the share of steps done, and next step is the first gap", () => {
  const half = item({ meta: { target_viewer: "Coaches", promise: "More calls" }, video_script: "Hook" });
  assert.equal(readinessScore(half), 0.5);
  assert.equal(nextStep(half), "thumbnail");
  assert.equal(nextStep(item()), "angle");

  const done = item({
    meta: { target_viewer: "a", promise: "b", shoot_at: "2026-09-12T15:00:00Z" },
    video_script: "s", media_urls: ["https://example.com/t.png"],
  });
  assert.equal(readinessScore(done), 1);
  assert.equal(nextStep(done), null, "nothing left to do before filming");
});

test("every step is represented once", () => {
  assert.deepEqual(PIPELINE_STEPS.map((s) => s.key), ["angle", "script", "thumbnail", "shoot"]);
});

test("an unknown or missing stage reads as an idea rather than vanishing", () => {
  assert.equal(stageOf(item({ meta: {} })), "idea");
  assert.equal(stageOf(item({ meta: { video_stage: "nonsense" } })), "idea");
  assert.equal(stageOf(item({ meta: { video_stage: "editing" } })), "editing");
});

test("the board has a lane per stage of thinking, and published leaves it", () => {
  const items = [
    item({ id: "i", meta: { video_stage: "idea" } }),
    item({ id: "p", meta: { video_stage: "planning" } }),
    item({ id: "r", meta: { video_stage: "recording" } }),
    item({ id: "e", meta: { video_stage: "editing" } }),
    item({ id: "d", meta: { video_stage: "ready" } }),
    item({ id: "x", meta: { video_stage: "published" } }),
  ];
  const board = buildPipeline(items);
  assert.deepEqual(board.lanes.map((l) => l.key), ["ideas", "scripting", "shoot", "editing", "publish"]);
  assert.deepEqual(board.lanes.map((l) => l.items.map((i) => i.id)), [["i"], ["p"], ["r"], ["e"], ["d"]]);
  assert.deepEqual(board.published.map((i) => i.id), ["x"]);
  assert.equal(board.liveCount, 5);
});

test("inside a lane, the closest to shootable is on top", () => {
  const bare = item({ id: "bare" });
  const nearlyThere = item({ id: "ready", meta: { video_stage: "idea", target_viewer: "a", promise: "b" }, video_script: "s" });
  const board = buildPipeline([bare, nearlyThere]);
  assert.deepEqual(board.lanes[0].items.map((i) => i.id), ["ready", "bare"]);
});

test("equally ready ideas fall back to the soonest target date", () => {
  const late = item({ id: "late", scheduled_date: "2026-12-01" });
  const soon = item({ id: "soon", scheduled_date: "2026-09-20" });
  const undated = item({ id: "undated" });
  const board = buildPipeline([late, undated, soon]);
  assert.deepEqual(board.lanes[0].items.map((i) => i.id), ["soon", "late", "undated"]);
});

test("the shoot list is everything with a time, soonest first", () => {
  const items = [
    item({ id: "later", meta: { video_stage: "recording", shoot_at: "2026-09-20T10:00:00Z" } }),
    item({ id: "sooner", meta: { video_stage: "idea", shoot_at: "2026-09-11T10:00:00Z" } }),
    item({ id: "none", meta: { video_stage: "idea" } }),
    item({ id: "gone", meta: { video_stage: "published", shoot_at: "2026-09-01T10:00:00Z" } }),
  ];
  const board = buildPipeline(items);
  assert.deepEqual(board.booked.map((i) => i.id), ["sooner", "later"], "published work is off the shoot list");
});
