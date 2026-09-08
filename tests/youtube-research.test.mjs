import assert from "node:assert/strict";
import test from "node:test";
import {
  channelSummary,
  daysSince,
  looksLikeShort,
  median,
  parseDuration,
  pickOutliers,
  scoreChannel,
  velocity,
} from "../lib/youtube-research.ts";

const NOW = new Date("2026-09-08T12:00:00Z");

const video = (overrides = {}) => ({
  video_id: "a", title: "A video", url: null, thumbnail_url: null,
  view_count: 1000, likes: 10, published_at: "2026-08-09T12:00:00Z", is_short: false,
  ...overrides,
});

const channel = { id: "c1", handle: "x", name: "Samin Yasar", channel_url: "", subscribers: null, total_views: null, video_count: null, description: null, why_watch: null, last_synced_at: null, last_sync_error: null };

test("median handles even and odd counts, and nothing at all", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
});

test("a video's age is in whole days and never zero", () => {
  assert.equal(daysSince("2026-08-09T12:00:00Z", NOW), 30);
  assert.equal(daysSince("2026-09-08T09:00:00Z", NOW), 1, "published today still counts as a day");
  assert.equal(daysSince(null, NOW), null);
  assert.equal(daysSince("not a date", NOW), null);
});

test("velocity compares old and new videos on the same footing", () => {
  const old = video({ view_count: 30000, published_at: "2025-09-08T12:00:00Z" });
  const fresh = video({ view_count: 3000, published_at: "2026-09-05T12:00:00Z" });
  const oldRate = velocity(old, NOW);
  const freshRate = velocity(fresh, NOW);
  assert.ok(freshRate > oldRate, "1,000/day beats 82/day even though the total is smaller");
  assert.equal(velocity(video({ view_count: null }), NOW), null);
});

test("a video is scored against its own channel's normal", () => {
  const videos = [
    video({ video_id: "1", view_count: 1000 }),
    video({ video_id: "2", view_count: 1000 }),
    video({ video_id: "3", view_count: 4000 }),
  ];
  const scored = scoreChannel(channel, videos, NOW);
  assert.equal(scored.find((v) => v.video_id === "3").multiple, 4);
  assert.equal(scored.find((v) => v.video_id === "1").multiple, 1);
  assert.equal(scored[0].competitorName, "Samin Yasar");
});

test("Shorts are judged against Shorts, not against long-form", () => {
  const videos = [
    video({ video_id: "l1", view_count: 1000, is_short: false }),
    video({ video_id: "l2", view_count: 1000, is_short: false }),
    video({ video_id: "s1", view_count: 50000, is_short: true }),
    video({ video_id: "s2", view_count: 50000, is_short: true }),
  ];
  const scored = scoreChannel(channel, videos, NOW);
  // Every Short is at its own median, so none of them is an outlier.
  assert.equal(scored.find((v) => v.video_id === "s1").multiple, 1);
  assert.equal(scored.find((v) => v.video_id === "l1").multiple, 1);
});

test("a channel with no views yet reports no multiple rather than a fake one", () => {
  const scored = scoreChannel(channel, [video({ view_count: null })], NOW);
  assert.equal(scored[0].multiple, null);
  assert.equal(scored[0].viewsPerDay, null);
});

test("outliers are the ones beating their channel, biggest first", () => {
  // Median of 1000 / 1000 / 2000 / 5000 / 1000 is 1000, so the bar is 1500.
  const videos = [
    video({ video_id: "1", view_count: 1000 }),
    video({ video_id: "2", view_count: 1000 }),
    video({ video_id: "3", view_count: 5000 }),
    video({ video_id: "4", view_count: 2000 }),
    video({ video_id: "5", view_count: 1000 }),
  ];
  const picked = pickOutliers(scoreChannel(channel, videos, NOW));
  assert.deepEqual(picked.map((v) => v.video_id), ["3", "4"], "5x then 2x; the ones at their normal are left out");
  assert.equal(picked[0].multiple, 5);
});

test("a flat channel falls back to its best videos instead of showing nothing", () => {
  const videos = [
    video({ video_id: "1", view_count: 1000 }),
    video({ video_id: "2", view_count: 1000 }),
    video({ video_id: "3", view_count: 1000 }),
  ];
  const picked = pickOutliers(scoreChannel(channel, videos, NOW));
  assert.equal(picked.length, 3, "nothing clears the bar, so show the best of what there is");
});

test("the channel summary describes the channel's own normal", () => {
  const videos = [
    video({ video_id: "1", view_count: 1000, published_at: "2026-07-09T12:00:00Z" }),
    video({ video_id: "2", view_count: 3000, published_at: "2026-08-08T12:00:00Z" }),
    video({ video_id: "3", view_count: 50000, is_short: true, published_at: "2026-09-07T12:00:00Z" }),
  ];
  const s = channelSummary(videos, NOW);
  assert.equal(s.tracked, 3);
  assert.equal(s.longCount, 2);
  assert.equal(s.shortCount, 1);
  assert.equal(s.medianLongViews, 2000);
  assert.equal(s.medianShortViews, 50000);
  assert.equal(s.lastPublishedDays, 1);
  assert.ok(s.uploadsPerMonth > 1 && s.uploadsPerMonth < 3);
});

test("a single upload gives no cadence rather than a made-up one", () => {
  assert.equal(channelSummary([video()], NOW).uploadsPerMonth, null);
  assert.equal(channelSummary([], NOW).lastPublishedDays, null);
});

test("Shorts are recognised by url, type or length", () => {
  assert.equal(looksLikeShort({ url: "https://www.youtube.com/shorts/abc" }), true);
  assert.equal(looksLikeShort({ type: "shorts" }), true);
  assert.equal(looksLikeShort({ duration: "0:45" }), true);
  assert.equal(looksLikeShort({ duration: "12:30" }), false);
  assert.equal(looksLikeShort({ url: "https://www.youtube.com/watch?v=abc" }), false);
});

test("durations parse from either clock format", () => {
  assert.equal(parseDuration("0:45"), 45);
  assert.equal(parseDuration("12:30"), 750);
  assert.equal(parseDuration("1:02:03"), 3723);
  assert.equal(parseDuration("nonsense"), null);
});
