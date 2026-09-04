import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  aggregateYouTubeDashboard,
  isExpectedYouTubeProfile,
  normalizeYouTubeActorItem,
  normalizePostedYouTubeRow,
  normalizeYouTubePublishedAt,
  normalizeYouTubeRecoveryInput,
  parseYouTubeDurationSeconds,
  sanitizeYouTubeIdea,
  sortYouTubeVideos,
  withinYouTubeWindow,
} from "../lib/youtube.ts";
import { normalizeComposioYouTubeItem, normalizeFreshUtcTimestamp, normalizeStrictUtcTimestamp } from "../lib/composio-youtube.ts";

const video = (overrides = {}) => ({
  id: "video-1",
  title: "Build a peaceful growth engine",
  format: "long_form",
  publishedAt: "2026-08-01T12:00:00.000Z",
  durationSeconds: 720,
  thumbnailUrl: "https://i.ytimg.com/vi/video-1/maxresdefault.jpg",
  url: "https://www.youtube.com/watch?v=video-1",
  views: 100,
  likes: 10,
  comments: 2,
  periodViews: null,
  watchMinutes: null,
  averageViewDurationSeconds: null,
  averageViewPercentage: null,
  impressions: null,
  impressionsCtr: null,
  subscribersGained: null,
  ...overrides,
});

test("YouTube is a first-class Marketing page", () => {
  const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /href: "\/youtube", label: "YouTube"[^\n]+section: "Marketing"/);
  const content = sidebar.indexOf('{ href: "/content"');
  const instagram = sidebar.indexOf('{ href: "/instagram"');
  const youtube = sidebar.indexOf('{ href: "/youtube"');
  assert.ok(content < instagram && instagram < youtube, "Marketing should be Content, Instagram, YouTube");
  assert.equal(existsSync(new URL("../app/youtube/page.tsx", import.meta.url)), true);
});

test("YouTube hub exposes dashboard, long-form, Shorts, and creation workspaces", () => {
  const page = readFileSync(new URL("../app/youtube/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Dashboard/);
  assert.match(page, /Long-form/);
  assert.match(page, /Shorts/);
  assert.match(page, /Create/);
  assert.match(page, /<GraphicsStudio/);
  assert.match(page, /\/api\/youtube\/analytics/);
  assert.match(page, /\/api\/youtube\/content/);
});

test("performance sorting supports most recent and best performing", () => {
  const rows = [
    video({ id: "older-hit", publishedAt: "2026-06-01T00:00:00.000Z", views: 900, periodViews: 700 }),
    video({ id: "newer", publishedAt: "2026-08-20T00:00:00.000Z", views: 100, periodViews: 80 }),
    video({ id: "lifetime-hit", publishedAt: "2026-07-01T00:00:00.000Z", views: 1000, periodViews: null }),
  ];
  assert.deepEqual(sortYouTubeVideos(rows, "recent").map((row) => row.id), ["newer", "lifetime-hit", "older-hit"]);
  assert.deepEqual(sortYouTubeVideos(rows, "best").map((row) => row.id), ["lifetime-hit", "older-hit", "newer"]);
  const completePeriodRows = rows.map((row) => ({ ...row, periodViews: row.id === "older-hit" ? 700 : row.id === "newer" ? 80 : 10 }));
  assert.deepEqual(sortYouTubeVideos(completePeriodRows, "best").map((row) => row.id), ["older-hit", "newer", "lifetime-hit"]);
});

test("dashboard aggregates only available values and preserves private KPI unavailability", () => {
  const summary = aggregateYouTubeDashboard([
    video({ id: "a", views: 100, watchMinutes: 250, subscribersGained: 4 }),
    video({ id: "b", views: 50, watchMinutes: null, subscribersGained: null }),
  ]);
  assert.equal(summary.views, 150);
  assert.equal(summary.watchMinutes, 250);
  assert.equal(summary.subscribersGained, 4);
  assert.equal(summary.hasPrivateAnalytics, true);
  const publicOnly = aggregateYouTubeDashboard([video()]);
  assert.equal(publicOnly.watchMinutes, null);
  assert.equal(publicOnly.impressionsCtr, null);
  assert.equal(publicOnly.hasPrivateAnalytics, false);
});

test("the rolling YouTube window is exactly 365 days and formats stay explicit", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  const rows = [
    video({ id: "inside", publishedAt: "2025-09-05T00:00:00.000Z" }),
    video({ id: "outside", publishedAt: "2025-09-04T00:00:00.000Z" }),
  ];
  assert.deepEqual(withinYouTubeWindow(rows, now).map((row) => row.id), ["inside"]);
  assert.equal(normalizePostedYouTubeRow({ platform: "youtube", external_id: "abc12345", posted_at: "2026-08-01T00:00:00Z", media_type: "video" }), null);
});

test("YouTube ingestion preserves unavailable metrics instead of turning them into zero", () => {
  const row = normalizePostedYouTubeRow({ platform: "youtube", external_id: "abc12345", post_url: "https://youtube.com/watch?v=abc12345", text: "Test", posted_at: "2026-08-01T12:00:00Z", media_type: "long", period_views: 999, watch_minutes: 500, impressions: 1000, subscribers_gained: 20 });
  assert.ok(row);
  assert.equal(row.views, null);
  assert.equal(row.likes, null);
  assert.equal(row.comments, null);
  assert.equal(row.periodViews, null);
  assert.equal(row.watchMinutes, null);
  assert.equal(row.impressions, null);
  assert.equal(row.subscribersGained, null);
  const sources = readFileSync(new URL("../lib/posted-sources.ts", import.meta.url), "utf8");
  assert.match(sources, /publishedAfter = since365\(\)/);
  assert.match(sources, /maxVideosPerChannel: 500/);
  assert.doesNotMatch(sources, /durationSeconds[^\n]*<=\s*60/);
  assert.equal(normalizeYouTubePublishedAt("Apr 1, 2026")?.slice(0, 10), "2026-04-01");
  assert.equal(normalizeYouTubePublishedAt("not-a-date"), null);
  assert.equal(parseYouTubeDurationSeconds("12:34"), 754);
  assert.equal(parseYouTubeDurationSeconds("PT1H2M3S"), 3723);
  assert.equal(isExpectedYouTubeProfile("https://www.youtube.com/@andrewkroeze999"), true);
  assert.equal(isExpectedYouTubeProfile("https://www.youtube.com/channel/UCbMr7zg8Eqv7_M_B-RuIgCA"), true);
  assert.equal(isExpectedYouTubeProfile("https://www.youtube.com/@someoneelse"), false);
  assert.equal(isExpectedYouTubeProfile("https://evil.example/@andrewkroeze999"), false);
  assert.equal(isExpectedYouTubeProfile("https://www.youtube.com.evil.example/@andrewkroeze999"), false);
  assert.equal(isExpectedYouTubeProfile("https://youtube.com/foo/@andrewkroeze999"), false);
  assert.equal(isExpectedYouTubeProfile("ftp://youtube.com/@andrewkroeze999"), false);
  assert.equal(isExpectedYouTubeProfile("https://youtube.com:444/@andrewkroeze999"), false);
  assert.equal(isExpectedYouTubeProfile("https://user:pass@youtube.com/@andrewkroeze999"), false);
  assert.equal(isExpectedYouTubeProfile(undefined), false);
  const actorPayload = {
    status: "success",
    channelId: "UCbMr7zg8Eqv7_M_B-RuIgCA",
    channelHandle: "@andrewkroeze999",
    contentType: "video",
    videoId: "abc12345xyz",
    videoUrl: "https://www.youtube.com/watch?v=abc12345xyz",
    publishedDate: "Apr 1, 2026",
    title: "Documented actor row",
    viewCount: 123,
  };
  const actorRow = normalizeYouTubeActorItem(actorPayload);
  assert.equal(actorRow?.publishedAt.slice(0, 10), "2026-04-01");
  assert.equal(actorRow?.format, "long_form");
  assert.equal(actorRow?.views, 123);
  assert.throws(() => normalizeYouTubeActorItem({ ...actorPayload, channelId: "wrong" }), /account mismatch/);
  assert.throws(() => normalizeYouTubeActorItem({ ...actorPayload, status: undefined }), /not successful/);
  assert.throws(() => normalizeYouTubeActorItem({ ...actorPayload, status: "failed", videoId: "bad!" }), /not successful/);
  const startedAt = Date.parse("2026-09-05T00:00:10.000Z");
  const previousDayCutoff = new Date(startedAt - 366 * 86_400_000).toISOString().slice(0, 10);
  const recoveryInput = { channels: ["@andrewkroeze999"], contentType: "videos", includeVideoStats: true, maxVideosPerChannel: 500, publishedAfter: previousDayCutoff, sortBy: "newest" };
  assert.deepEqual(normalizeYouTubeRecoveryInput(recoveryInput, startedAt), { contentType: "videos", publishedAfter: previousDayCutoff });
  assert.equal(normalizeYouTubeRecoveryInput({ ...recoveryInput, channels: ["@andrewkroeze999", "UCbMr7zg8Eqv7_M_B-RuIgCA"] }, startedAt), null);
  assert.equal(normalizeYouTubeRecoveryInput({ ...recoveryInput, channels: [123] }, startedAt), null);
  assert.equal(normalizeYouTubeRecoveryInput({ ...recoveryInput, extra: true }, startedAt), null);
  const midday = Date.parse("2026-09-05T12:00:00.000Z");
  assert.equal(normalizeYouTubeRecoveryInput({ ...recoveryInput, publishedAfter: new Date(midday - 366 * 86_400_000).toISOString().slice(0, 10) }, midday), null);
});

test("Composio YouTube imports are public, exact-account, bounded, and explicit-format", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  const source = {
    id: "abc12345xyz",
    title: "Composio video",
    publishedAt: "2026-08-01T12:00:00Z",
    duration: "PT1M2S",
    views: "123",
    likes: undefined,
    comments: "4",
    thumbnailUrl: "https://i.ytimg.com/vi/abc12345xyz/hqdefault.jpg",
    format: "short",
    privacyStatus: "public",
    channelId: "UCbMr7zg8Eqv7_M_B-RuIgCA",
  };
  const row = normalizeComposioYouTubeItem(source, now);
  assert.equal(row.id, source.id);
  assert.equal(row.durationSeconds, 62);
  assert.equal(row.views, 123);
  assert.equal(row.likes, null);
  assert.equal(row.comments, 4);
  assert.equal(row.url, "https://www.youtube.com/shorts/abc12345xyz");
  assert.throws(() => normalizeComposioYouTubeItem({ ...source, channelId: "UCwrong" }, now), /account mismatch/);
  assert.throws(() => normalizeComposioYouTubeItem({ ...source, privacyStatus: "unlisted" }, now), /public/);
  assert.throws(() => normalizeComposioYouTubeItem({ ...source, format: "video" }, now), /format/);
  assert.throws(() => normalizeComposioYouTubeItem({ ...source, publishedAt: "2025-09-04T11:59:59Z" }, now), /365-day/);
  assert.throws(() => normalizeComposioYouTubeItem({ ...source, publishedAt: "2026-02-31T12:00:00Z" }, now), /publish date/);
  assert.throws(() => normalizeComposioYouTubeItem({ ...source, extra: true }, now), /Unsupported/);
  assert.equal(normalizeStrictUtcTimestamp("2026-02-31T12:00:00Z"), null);
  assert.equal(normalizeStrictUtcTimestamp("2026-02-28T12:00:00.123456Z"), "2026-02-28T12:00:00.123Z");
  assert.equal(normalizeFreshUtcTimestamp("2026-02-31T12:00:00Z", now), null);
  assert.equal(normalizeFreshUtcTimestamp("2026-08-01T12:00:00Z", now), null);
  assert.equal(normalizeFreshUtcTimestamp("2026-09-04T12:10:00Z", now), "2026-09-04T12:10:00.000Z");
});

test("YouTube ideas are normalized into shared Content records with structured video metadata", () => {
  const value = sanitizeYouTubeIdea({
    title: "  The calm CEO operating system  ",
    format: "long_form",
    targetDate: "2026-09-15",
    viewer: "Online business owners",
    promise: "Build a simpler weekly operating rhythm",
    primaryKeyword: "CEO operating system",
  });
  assert.equal(value.title, "The calm CEO operating system");
  assert.equal(value.category, "value");
  assert.equal(value.status, "idea");
  assert.deepEqual(value.platforms, ["youtube"]);
  assert.equal(value.creative_type, "video");
  assert.equal(value.scheduled_date, "2026-09-15");
  assert.deepEqual(value.meta, {
    video_hub: true,
    video_destination: "youtube",
    video_stage: "idea",
    youtube_format: "long_form",
    target_viewer: "Online business owners",
    promise: "Build a simpler weekly operating rhythm",
    primary_keyword: "CEO operating system",
    opening_hook: "",
  });
  assert.throws(() => sanitizeYouTubeIdea({ title: "", format: "long_form" }), /title/i);
  assert.throws(() => sanitizeYouTubeIdea({ title: "Idea", format: "podcast" }), /format/i);
  assert.equal(sanitizeYouTubeIdea({ title: "Idea", format: "long_form", openingHook: "" }).meta.opening_hook, "");
});

test("YouTube routes are protected, bounded, and keep credentials server-side", () => {
  const analytics = readFileSync(new URL("../app/api/youtube/analytics/route.ts", import.meta.url), "utf8");
  const content = readFileSync(new URL("../app/api/youtube/content/route.ts", import.meta.url), "utf8");
  const generate = readFileSync(new URL("../app/api/youtube/generate/route.ts", import.meta.url), "utf8");
  const startSync = readFileSync(new URL("../app/api/content/posted/sync-start/route.ts", import.meta.url), "utf8");
  const pollSync = readFileSync(new URL("../app/api/content/posted/sync-poll/route.ts", import.meta.url), "utf8");
  const composioImport = readFileSync(new URL("../app/api/youtube/composio-import/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(analytics, /NEXT_PUBLIC_YOUTUBE/);
  assert.match(analytics, /source|provenance/i);
  assert.match(content, /sanitizeYouTubeIdea/);
  assert.match(generate, /content-length|MAX_BODY_BYTES|readBounded/i);
  assert.doesNotMatch(generate, /NextResponse\.json\s*\(\s*\{[^}]*\b(?:apiKey|secret|token)\b/i);
  assert.doesNotMatch(generate, /return\s+(?:apiKey|secret|token)\b/i);
  assert.match(content, /expectedUpdatedAt/);
  assert.match(content, /\.eq\("updated_at", body\.expectedUpdatedAt\)/);
  assert.match(generate, /\.eq\("updated_at", input\.expectedUpdatedAt\)/);
  assert.match(startSync, /claimYouTubeSyncStart/);
  assert.match(startSync, /startYouTubeRun\(contentType, token\)/);
  assert.match(startSync, /runs\.some\(\(run\) => run\.contentType === contentType\)/);
  assert.match(pollSync, /getReservedYouTubeSyncRuns/);
  assert.match(content, /readBoundedRequestBody/);
  assert.match(generate, /readBoundedRequestBody/);
  assert.match(analytics, /No verified YouTube snapshot/);
  assert.match(analytics, /!Object\.hasOwn\(raw, "channelId"\)/);
  assert.match(analytics, /raw\?\.channelId === YOUTUBE_CHANNEL\.id/);
  assert.match(analytics, /raw\.channelHandle === YOUTUBE_CHANNEL\.handle/);
  assert.match(composioImport, /isHotLeadsAgent/);
  assert.match(composioImport, /readBoundedRequestBody/);
  assert.match(composioImport, /onConflict: "external_id"/);
  assert.match(composioImport, /15 \* 60_000/);
  assert.match(analytics, /raw\?\.provider === "composio" \? raw\.fetchedAt/);
  assert.match(analytics, /latestComposioSnapshot/);
  assert.match(analytics, /snapshot\.count === snapshot\.size/);
  assert.match(analytics, /typeof snapshotSize === "number"/);
  assert.doesNotMatch(analytics, /Number\(raw\?\.snapshotSize\)/);
  assert.match(analytics, /for \(const row of youtubeRows\)/);
  assert.match(analytics, /raw\?\.provider === "composio"/);
  assert.match(analytics, /current\.valid = current\.valid && validSize && current\.size === snapshotSize/);
  assert.match(analytics, /hasComposioRows = youtubeRows\.some/);
  assert.match(analytics, /hasComposioRows \? \[\] : channelRows/);
  assert.match(analytics, /Date\.now\(\) - 366 \* 86_400_000/);
  assert.match(analytics, /withinYouTubeWindow/);
  assert.match(composioImport, /snapshotSize: normalized\.length/);
  assert.doesNotMatch(composioImport, /APIFY_TOKEN/);
});
