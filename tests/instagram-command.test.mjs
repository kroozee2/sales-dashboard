import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aggregateInstagramMetrics,
  buildInstagramRecommendations,
  normalizeInstagramProfileUrl,
  normalizeInstagramPostUrl,
  strictDate,
  isInstagramContentPlatform,
  syncEligibility,
  INSTAGRAM_CREDIT_GUARD,
  parseGeneratedCarousel,
  parseGeneratedReel,
  mapCompetitorEvidence,
  extractCompetitorProfileStats,
  averageCompetitorViews,
  competitorPostMetric,
} from "../lib/instagram-command.ts";

test("Instagram calendar includes canonical IG keys without creative-type contamination", () => {
  assert.equal(isInstagramContentPlatform(["instagram"]), true);
  assert.equal(isInstagramContentPlatform(["instagram_post"]), true);
  assert.equal(isInstagramContentPlatform(["carousel"]), true);
  assert.equal(isInstagramContentPlatform(["facebook"]), false);
  assert.equal(isInstagramContentPlatform(undefined), false);
});

test("equivalent Instagram post URLs canonicalize to one paid-analysis cache identity", () => {
  const canonical = "https://www.instagram.com/p/ABC/";
  assert.equal(normalizeInstagramPostUrl("https://instagram.com/p/ABC"), canonical);
  assert.equal(normalizeInstagramPostUrl("https://www.instagram.com/p/ABC/?utm_source=test"), canonical);
  assert.equal(normalizeInstagramPostUrl("https://www.instagram.com/p/ABC/extra"), null);
});

const rows = [
  { external_id:"1", posted_at:"2026-08-19T12:00:00Z", media_type:"video", views:1000, likes:100, comments:20, shares:5, text:"one", post_url:"https://www.instagram.com/reel/one/" },
  { external_id:"2", posted_at:"2026-08-18T12:00:00Z", media_type:"carousel", views:0, likes:80, comments:10, shares:10, text:"two", post_url:"https://www.instagram.com/p/two/" },
  { external_id:"3", posted_at:"2026-05-01T12:00:00Z", media_type:"video", views:9999, likes:999, comments:99, shares:99, text:"old", post_url:"https://www.instagram.com/reel/old/" },
];

test("dashboard aggregates only the selected real-data window", () => {
  const result = aggregateInstagramMetrics(rows, 30, new Date("2026-08-20T12:00:00Z"));
  assert.equal(result.posts, 2);
  assert.equal(result.views, 1000);
  assert.equal(result.likes, 180);
  assert.equal(result.comments, 30);
  assert.equal(result.shares, 15);
  assert.equal(result.averageViews, 1000);
  assert.equal(result.engagementRate, 12.5);
  assert.deepEqual(result.formatMix, { reels: 1, carousels: 1, images: 0 });
  assert.equal(result.topPosts[0].external_id, "1");
});

test("recommendations are deterministic and never invent metrics", () => {
  const metrics = aggregateInstagramMetrics(rows, 30, new Date("2026-08-20T12:00:00Z"));
  const first = buildInstagramRecommendations(metrics);
  assert.deepEqual(first, buildInstagramRecommendations(metrics));
  assert.ok(first.every((x) => !/followers|reach|saves/i.test(x)));
});

test("profile URL normalization accepts profiles and rejects post URLs", () => {
  assert.equal(normalizeInstagramProfileUrl("@justyn.ai"), "https://www.instagram.com/justyn.ai/");
  assert.equal(normalizeInstagramProfileUrl("https://instagram.com/justyn.ai?x=1"), "https://www.instagram.com/justyn.ai/");
  assert.equal(normalizeInstagramProfileUrl("https://instagram.com/p/abc"), null);
  assert.equal(normalizeInstagramProfileUrl("https://evil.example/justyn.ai"), null);
  assert.equal(normalizeInstagramPostUrl("https://instagram.com/reel/abc?utm_source=x"), "https://www.instagram.com/reel/abc/");
  assert.equal(normalizeInstagramPostUrl("javascript:alert(1)"), null);
  assert.equal(normalizeInstagramPostUrl("https://evil.example/reel/abc"), null);
});

test("credit guard enforces the 24 hour and 7 day cooldowns", () => {
  assert.deepEqual(INSTAGRAM_CREDIT_GUARD, { profileCooldownHours:24, competitorCacheDays:7, maxSamplePosts:20, maxEvidencePosts:8 });
  const now = new Date("2026-08-20T12:00:00Z");
  assert.equal(syncEligibility("2026-08-20T00:00:00Z", "profile", now).eligible, false);
  assert.equal(syncEligibility("2026-08-18T00:00:00Z", "profile", now).eligible, true);
  assert.equal(syncEligibility("2026-08-15T00:00:00Z", "competitor", now).eligible, false);
  assert.equal(syncEligibility("2026-08-10T00:00:00Z", "competitor", now).eligible, true);
});

test("strict dates reject impossible calendar dates", () => {
  assert.equal(strictDate("2026-02-28"), "2026-02-28");
  assert.equal(strictDate("2026-02-31"), null);
  assert.equal(strictDate("20-02-01"), null);
});

test("competitor evidence stays compact, ranks deterministically, and keeps plays/views separate", () => {
  const evidence = mapCompetitorEvidence([
    { id:"a", url:"https://www.instagram.com/p/a/", caption:"Stop chasing more leads.\nBuild a better conversion system instead.\nComment SYSTEM and I'll send the map.", likesCount:10, commentsCount:2, videoPlayCount:500, videoViewCount:300, type:"Video" },
    { id:"b", url:"https://www.instagram.com/p/b/", caption:"B", likesCount:100, commentsCount:30, videoPlayCount:0, videoViewCount:0, type:"Sidecar" },
  ]);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].url, "https://www.instagram.com/p/a/");
  assert.equal(evidence[0].plays, 500);
  assert.equal(evidence[0].views, 300);
  assert.equal(evidence[0].title, "Stop chasing more leads.");
  assert.equal(evidence[0].hook, "Stop chasing more leads.");
  assert.equal(evidence[0].description, "Build a better conversion system instead.");
  assert.equal(evidence[0].cta, "Comment SYSTEM and I'll send the map.");
});

test("competitor evidence canonicalizes provider post URLs before persistence", () => {
  const [post] = mapCompetitorEvidence([{url:"https://instagram.com/reel/ABC?utm_source=test",caption:"Hook",videoViewCount:100}]);
  assert.equal(post.url,"https://www.instagram.com/reel/ABC/");
});

test("content breakdown separates a single-line hook, description, and CTA without AI invention", () => {
  const [post] = mapCompetitorEvidence([{
    url:"https://www.instagram.com/reel/single/",
    caption:"Stop guessing what to post. Use your sales calls as research. Comment CONTENT and I'll send the framework.",
    videoViewCount:900,
  }]);
  assert.equal(post.hook,"Stop guessing what to post.");
  assert.equal(post.description,"Use your sales calls as research.");
  assert.equal(post.cta,"Comment CONTENT and I'll send the framework.");
});

test("competitor refresh binds follower count to the requested profile without inventing zero", () => {
  assert.deepEqual(extractCompetitorProfileStats([
    { ownerUsername: "model.creator", ownerFollowersCount: 125400 },
    { ownerUsername: "model.creator", ownerFollowersCount: 125400 },
  ], "model.creator"), { handle: "model.creator", followers: 125400 });
  assert.deepEqual(extractCompetitorProfileStats([
    { ownerUsername: "wrong.creator", ownerFollowersCount: 999999 },
    { ownerUsername: "model.creator", ownerFollowersCount: null },
  ], "model.creator"), { handle: "model.creator", followers: null });
  assert.deepEqual(extractCompetitorProfileStats([{ caption: "no profile metadata" }], "model.creator"), { handle: null, followers: null });
});

test("competitor performance keeps views and plays distinct", () => {
  assert.deepEqual(competitorPostMetric({views:300,plays:500}), {value:300,label:"views"});
  assert.deepEqual(competitorPostMetric({views:0,plays:500}), {value:500,label:"plays"});
  assert.deepEqual(competitorPostMetric({views:0,plays:0}), {value:null,label:"unavailable"});
  assert.equal(averageCompetitorViews([{views:300,plays:500},{views:0,plays:900}]),300);
  assert.equal(averageCompetitorViews([{views:0,plays:900}]),null);
});

test("CTA-only captions retain the sourced call to action", () => {
  const [post] = mapCompetitorEvidence([{url:"https://www.instagram.com/reel/cta/",caption:"Comment GUIDE below.",videoViewCount:100}]);
  assert.equal(post.cta,"Comment GUIDE below.");
});

test("long captions retain a sourced CTA beyond the stored excerpt", () => {
  const caption=`Hook. ${"Useful context. ".repeat(40)}Comment GUIDE below.`;
  const [post] = mapCompetitorEvidence([{url:"https://www.instagram.com/reel/long/",caption,videoViewCount:100}]);
  assert.equal(post.captionExcerpt.length,500);
  assert.equal(post.cta,"Comment GUIDE below.");
});

test("competitor refresh persists verified profile stats with ranked evidence", () => {
  const route = readFileSync(new URL("../app/api/instagram/competitors/refresh/route.ts", import.meta.url), "utf8");
  assert.match(route, /extractCompetitorProfileStats\(posts,\s*expectedHandle\)/);
  assert.match(route, /EVIDENCE_PREFIX.*creatorId/);
  assert.match(route, /normalizeInstagramProfileUrl\(snapshotProfileUrl\)/);
  assert.match(route, /instagramHandle:\s*profileStats\.handle/);
  assert.match(route, /followers:\s*profileStats\.followers/);
});

test("generated creator output enforces exact bounded reel and carousel contracts", () => {
  const cta = "Comment REELS and I'll send you the free training";
  const reel = parseGeneratedReel(`HOOK: Stop guessing\nSCRIPT:\nSay this exactly.\nCAPTION:\nShort caption. ${cta}`, cta);
  assert.equal(reel?.hook, "Stop guessing");
  assert.equal(reel?.script, "Say this exactly.");
  const slides = Array.from({ length: 7 }, (_, index) => `Slide ${index + 1} — Heading ${index + 1}\nBody ${index + 1}`).join("\n\n");
  const carousel = parseGeneratedCarousel(`${slides}\n\nCAPTION:\nCaption here. ${cta}`, cta);
  assert.equal(carousel?.slides.length, 7);
  assert.equal(carousel?.caption, `Caption here.\n\n${cta}`);
  assert.equal(parseGeneratedCarousel("Slide 1 — Hook\nBody\n\nCAPTION:\nCaption", cta), null);
  assert.equal(parseGeneratedReel(`HOOK: ${"word ".repeat(13)}\nSCRIPT:\nScript\nCAPTION:\nCaption ${cta}`, cta), null);
  const boundedCaption = parseGeneratedReel(`HOOK: Fine\nSCRIPT:\nScript\nCAPTION:\n${"long caption words ".repeat(30)} ${cta}`, cta);
  assert.equal(Boolean(boundedCaption && boundedCaption.caption.length <= 300 && boundedCaption.caption.endsWith(cta)), true);
  const normalizedPunctuation = parseGeneratedReel(`HOOK: Fine\nSCRIPT:\nScript\nCAPTION:\nCaption. Comment REELS and I’ll send you the free training.\n#reels`, cta);
  assert.equal(normalizedPunctuation?.caption.endsWith(cta), true);
  const markdownReel = parseGeneratedReel(`\`\`\`text\n**HOOK:** Fine\n**SCRIPT:**\nScript\n**CAPTION:**\nCaption ${cta}\n\`\`\``, cta);
  assert.equal(markdownReel?.hook, "Fine");
  assert.equal(parseGeneratedReel(`HOOK: Fine\n\nSCRIPT:\nScript\n\nCAPTION:\n${cta}`, cta)?.script, "Script");
  assert.equal(parseGeneratedReel(`HOOK: Fine\n\n---\n\nSCRIPT:\nScript\n\nCAPTION:\n${cta}`, cta)?.script, "Script");
  assert.equal(parseGeneratedReel(`    ---\nHOOK: Fine\nSCRIPT:\nScript\nCAPTION:\n${cta}`, cta), null);
  assert.equal(parseGeneratedReel(`\`\`\`text\n    ---\nHOOK: Fine\nSCRIPT:\nScript\nCAPTION:\n${cta}\n\`\`\``, cta), null);
  assert.equal(parseGeneratedReel(`HOOK: Fine\nOUTSIDE PROSE\nSCRIPT:\nScript\nCAPTION:\n${cta}`, cta), null);
  const markdownSlides = Array.from({ length: 7 }, (_, index) => `**Slide ${index + 1} — Heading ${index + 1}**\nBody ${index + 1}`).join("\n\n");
  assert.equal(parseGeneratedCarousel(`${markdownSlides}\n\n**CAPTION:**\n${cta}`, cta)?.slides.length, 7);
  assert.equal(parseGeneratedReel(`\`\`\`text\nHOOK: Fine\nSCRIPT:\nValid script\n\`\`\`\nOUTSIDE PROSE\nCAPTION:\n${cta}\n\`\`\``, cta), null);
  assert.equal(parseGeneratedCarousel(`\`\`\`markdown\n${slides}\n\`\`\`\nOUTSIDE PROSE\nCAPTION:\n${cta}\n\`\`\``, cta), null);
  assert.equal(parseGeneratedReel(`\`\`\`text\nHOOK: Fine\nSCRIPT:\nValid script\n   \`\`\`\nOUTSIDE PROSE\nCAPTION:\n${cta}\n\`\`\``, cta), null);
  assert.equal(parseGeneratedReel(`\`\`\`text\nHOOK: Fine\nSCRIPT:\nValid script\n\`\`\`\`\nOUTSIDE PROSE\nCAPTION:\n${cta}\n\`\`\``, cta), null);
  assert.equal(parseGeneratedCarousel(`\`\`\`markdown\n${slides}\n   \`\`\`\nOUTSIDE PROSE\nCAPTION:\n${cta}\n\`\`\``, cta), null);
  assert.equal(parseGeneratedReel(`Leading junk\nHOOK: Fine\nSCRIPT:\nScript\nCAPTION:\n${cta}`, cta), null);
  assert.equal(parseGeneratedReel("HOOK: Fine\nSCRIPT:\nScript\nCAPTION:\nNo CTA", cta), null);
  const duplicateSlides = Array.from({ length: 7 }, (_, index) => `Slide ${index === 2 ? 2 : index + 1} — Heading\nBody`).join("\n\n");
  assert.equal(parseGeneratedCarousel(`${duplicateSlides}\n\nCAPTION:\n${cta}`, cta), null);
  assert.equal(parseGeneratedCarousel(`${slides}\n\nCAPTION:\nNo CTA`, cta), null);
});
