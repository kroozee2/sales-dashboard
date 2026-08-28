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

test("Instagram opens on the calendar and keeps the 90-day spreadsheet underneath it", () => {
  const page = readFileSync(new URL("../app/instagram/page.tsx", import.meta.url), "utf8");
  assert.match(page, /useState<Tab>\("calendar"\)/);
  assert.match(page, /tab === "calendar"[\s\S]*InstagramPerformanceSpreadsheet/);
  assert.match(page, /Instagram Content Calendar[\s\S]*Analytics & Reel Retentions/);
});

test("performance history is a compact spreadsheet named from each hook or headline", () => {
  const spreadsheet = readFileSync(new URL("../components/instagram-performance-grid.tsx", import.meta.url), "utf8");
  assert.match(spreadsheet, /<table/);
  assert.match(spreadsheet, /Reel name/);
  assert.match(spreadsheet, /Views/);
  assert.match(spreadsheet, /Likes/);
  assert.match(spreadsheet, /Comments/);
  assert.match(spreadsheet, /Performance/);
  assert.match(spreadsheet, /Open ↗/);
  assert.doesNotMatch(spreadsheet, />Name \/ description</);
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
  assert.equal(
    extractInstagramHook('Comment "skool" for the guide 👇\n\nNew to Claude: Build Your Sales Dashboard'),
    "New to Claude: Build Your Sales Dashboard",
  );
  assert.equal(
    extractInstagramHook('Comment “skool” to get the AI Morning Brief Dashboard 👇'),
    "The AI Morning Brief Dashboard",
  );
  assert.equal(extractInstagramHook('Comment “skool” for the full guide 👇'), "Hook/headline unavailable");
  assert.equal(extractInstagramHook(""), "Hook/headline unavailable");
  assert.equal(extractInstagramHook(null), "Hook/headline unavailable");
});

test("rates videos by views and non-video posts by interactions with factual rank labels", () => {
  const rows = buildInstagramPerformanceBoard([
    post({ id: "v1", views: 4000, likes: 10, comments: 2 }),
    post({ id: "v2", views: 1000, likes: 50, comments: 10 }),
    post({ id: "c1", views: 0, likes: 100, comments: 20, media_type: "carousel" }),
    post({ id: "c2", views: 0, likes: 10, comments: 1, media_type: "carousel" }),
  ], NOW);

  assert.equal(rows.find((row) => row.id === "v1")?.performanceBasis, "views");
  assert.equal(rows.find((row) => row.id === "c1")?.performanceBasis, "interactions");
  assert.equal(rows.find((row) => row.id === "v1")?.performanceLabel, "#1 of 2");
  assert.equal(rows.find((row) => row.id === "c1")?.performanceLabel, "#1 of 2");
  assert.equal(instagramPerformanceLabel(1, 8), "#1 of 8");
  assert.equal(instagramPerformanceLabel(5, 8), "#5 of 8");
});

test("equal metrics receive equal factual ranks", () => {
  const rows = buildInstagramPerformanceBoard([
    post({ id: "a", views: 1000 }),
    post({ id: "b", views: 1000 }),
    post({ id: "c", views: 500 }),
  ], NOW);

  assert.equal(rows.find((row) => row.id === "a")?.performanceRank, 1);
  assert.equal(rows.find((row) => row.id === "b")?.performanceRank, 1);
  assert.equal(rows.find((row) => row.id === "c")?.performanceRank, 3);
});

test("keeps missing metrics unavailable instead of converting them to exact zeroes", () => {
  const [row] = buildInstagramPerformanceBoard([
    post({ views: null, likes: null, comments: undefined, media_type: "image" }),
  ], NOW);

  assert.equal(row.views, null);
  assert.equal(row.likes, null);
  assert.equal(row.comments, null);
  assert.equal(row.interactions, null);
  assert.equal(row.performanceBasis, "unavailable");
  assert.equal(row.performanceLabel, "Metrics unavailable");
});

test("calendar landing view is usable on mobile and reports loading and API errors truthfully", () => {
  const page = readFileSync(new URL("../app/instagram/page.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("../components/instagram-performance-grid.tsx", import.meta.url), "utf8");
  assert.match(page, /overflow-x-auto/);
  assert.match(page, /min-w-\[700px\]/);
  assert.match(page, /analyticsError/);
  assert.match(page, /loading=\{loading\}/);
  assert.match(grid, /Loading Instagram performance/);
  assert.match(grid, /Instagram performance is unavailable/);
});

test("manual sync persists run references and has no fixed polling-attempt cutoff", () => {
  const page = readFileSync(new URL("../app/instagram/page.tsx", import.meta.url), "utf8");
  assert.match(page, /instagram-sync-runs/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /localStorage\.removeItem/);
  assert.match(page, /while \(true\)/);
  assert.doesNotMatch(page, /attempt < 60/);
});
