import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildInstagramPerformanceBoard,
  extractInstagramHook,
  instagramPerformanceLabel,
} from "../lib/instagram-performance.ts";

const NOW = new Date("2026-08-28T19:00:00.000Z");

const post = (overrides = {}) => ({
  id: "post-1",
  platform: "instagram",
  post_url: "https://www.instagram.com/p/example/",
  text: "This is the hook\n\nThis is the rest of the description.",
  posted_at: "2026-08-20T12:00:00.000Z",
  likes: 25,
  comments: 5,
  views: 1000,
  media_type: "video",
  ...overrides,
});

test("Instagram opens on the calendar and keeps the 90-day board underneath it", () => {
  const page = readFileSync(new URL("../app/instagram/page.tsx", import.meta.url), "utf8");
  assert.match(page, /useState<Tab>\("calendar"\)/);
  assert.match(page, /tab === "calendar"[\s\S]*InstagramPerformanceGrid/);
  assert.match(page, /Instagram Content Calendar[\s\S]*Analytics & Reel Retentions/);
});

test("the analytics API returns the complete rolling 90-day Instagram dataset", () => {
  const route = readFileSync(new URL("../app/api/instagram/analytics/route.ts", import.meta.url), "utf8");
  assert.match(route, /\.gte\("posted_at", cutoff90Days\)/);
  assert.match(route, /dbPosts:\s*igPosts/);
  assert.doesNotMatch(route, /dbPosts:\s*igPosts\.slice/);
});

test("builds newest-first rows and excludes stale or non-Instagram content", () => {
  const rows = buildInstagramPerformanceBoard([
    post({ id: "new", posted_at: "2026-08-28T18:00:00.000Z" }),
    post({ id: "older", posted_at: "2026-06-01T12:00:00.000Z" }),
    post({ id: "stale", posted_at: "2026-05-29T12:00:00.000Z" }),
    post({ id: "facebook", platform: "facebook" }),
  ], NOW);

  assert.deepEqual(rows.map((row) => row.id), ["new", "older"]);
});

test("keeps exact views, comments, likes, URL, hook, and description", () => {
  const [row] = buildInstagramPerformanceBoard([post()], NOW);

  assert.equal(row.views, 1000);
  assert.equal(row.comments, 5);
  assert.equal(row.likes, 25);
  assert.equal(row.postUrl, "https://www.instagram.com/p/example/");
  assert.equal(row.hook, "This is the hook");
  assert.equal(row.description, "This is the hook\n\nThis is the rest of the description.");
  assert.equal(row.name, "This is the hook");
  assert.equal(row.engagementRate, 3);
});

test("extracts a useful first-line hook without inventing one", () => {
  assert.equal(extractInstagramHook("\n\nA specific opening line.\nMore copy"), "A specific opening line.");
  assert.equal(extractInstagramHook(""), "Hook unavailable");
  assert.equal(extractInstagramHook(null), "Hook unavailable");
});

test("rates videos by views and non-video posts by interactions", () => {
  const rows = buildInstagramPerformanceBoard([
    post({ id: "v1", views: 4000, likes: 10, comments: 2 }),
    post({ id: "v2", views: 1000, likes: 50, comments: 10 }),
    post({ id: "c1", views: 0, likes: 100, comments: 20, media_type: "carousel" }),
    post({ id: "c2", views: 0, likes: 10, comments: 1, media_type: "carousel" }),
  ], NOW);

  assert.equal(rows.find((row) => row.id === "v1")?.performanceBasis, "views");
  assert.equal(rows.find((row) => row.id === "c1")?.performanceBasis, "interactions");
  assert.equal(rows.find((row) => row.id === "v1")?.performanceLabel, "Top performer");
  assert.equal(rows.find((row) => row.id === "c1")?.performanceLabel, "Top performer");
  assert.equal(instagramPerformanceLabel(1, 8), "Top performer");
  assert.equal(instagramPerformanceLabel(2, 8), "Top 25%");
  assert.equal(instagramPerformanceLabel(5, 8), "Below average");
});
