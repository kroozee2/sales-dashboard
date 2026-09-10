import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LIMITS, decodeCaptions, fitTags, parseVideoId, renderDescription,
  shapeSeoPackage, trimTranscript, usableChapters,
} from "../lib/youtube-seo.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("every link a person would actually paste resolves", () => {
  for (const input of [
    "https://www.youtube.com/watch?v=bRPjBO3VdEo",
    "https://youtu.be/bRPjBO3VdEo",
    "https://youtu.be/bRPjBO3VdEo?t=42",
    "https://www.youtube.com/shorts/bRPjBO3VdEo",
    "https://www.youtube.com/live/bRPjBO3VdEo",
    "https://www.youtube.com/embed/bRPjBO3VdEo",
    "youtube.com/watch?v=bRPjBO3VdEo&list=PL123",
    "bRPjBO3VdEo",
  ]) {
    assert.equal(parseVideoId(input), "bRPjBO3VdEo", `failed on ${input}`);
  }
});

test("a link that is not a video is refused rather than half-read", () => {
  for (const input of ["", "   ", "https://vimeo.com/12345", "https://www.youtube.com/@kroozee", "not a url"]) {
    assert.equal(parseVideoId(input), null, `should refuse ${input}`);
  }
});

test("captions arrive HTML-escaped and must not stay that way", () => {
  // Apify hands back "what&#39;s up", which otherwise reaches the model as
  // literal entities and comes back out inside the description.
  assert.equal(decodeCaptions("what&#39;s up &amp; welcome"), "what's up & welcome");
  assert.equal(decodeCaptions("a  \n b   c"), "a b c");
});

test("a long transcript keeps both ends", () => {
  // The opening sets up the promise and the close carries the call to action.
  // Truncating loses the ending entirely.
  const text = `START${"x".repeat(60_000)}FINISH`;
  const trimmed = trimTranscript(text, 1_000);
  assert.ok(trimmed.startsWith("START"));
  assert.ok(trimmed.endsWith("FINISH"));
  assert.ok(trimmed.length <= 1_000);
  assert.match(trimmed, /\[…\]/);
});

test("a short transcript is left alone", () => {
  assert.equal(trimTranscript("just this", 1_000), "just this");
});

test("tags are cut to YouTube's total budget, not per tag", () => {
  // YouTube caps tags at 500 characters in total and silently drops the rest.
  const tags = Array.from({ length: 40 }, (_, i) => `keyword number ${i} here`);
  const fitted = fitTags(tags);
  assert.ok(fitted.join(",").length <= LIMITS.tagsTotal);
  assert.ok(fitted.length < tags.length, "some had to go, and the cut is made where it can be seen");
});

test("chapters that YouTube would ignore are dropped, not pasted", () => {
  // They only render when the first is 0:00 and they run forward.
  const good = [{ time: "0:00", label: "Intro" }, { time: "2:30", label: "Middle" }, { time: "9:04", label: "End" }];
  assert.equal(usableChapters(good).length, 3);
  assert.deepEqual(usableChapters([{ time: "1:00", label: "Late start" }, ...good.slice(1)]), []);
  assert.deepEqual(usableChapters([{ time: "0:00", label: "a" }, { time: "5:00", label: "b" }, { time: "2:00", label: "c" }]), []);
  assert.deepEqual(usableChapters(good.slice(0, 2)), [], "two chapters is not a chapter list");
});

test("the package is bounded to what YouTube accepts", () => {
  const seo = shapeSeoPackage({
    title: "t".repeat(300),
    description: "d".repeat(9_000),
    alternateTitles: ["one", "two", "", null, "three"],
    tags: ["a", "b"],
    chapters: [{ time: "0:00", label: "Intro" }],
    pinnedComment: "hi", thumbnailText: "AI EMPLOYEE", shortsHooks: ["clip"],
  });
  assert.equal(seo.title.length, LIMITS.title);
  assert.equal(seo.description.length, LIMITS.description);
  assert.deepEqual(seo.alternateTitles, ["one", "two", "three"], "blanks are not titles");
  assert.deepEqual(seo.chapters, [], "one chapter is not a chapter list");
});

test("a package built from nothing does not throw", () => {
  const seo = shapeSeoPackage(null);
  assert.equal(seo.title, "");
  assert.deepEqual(seo.tags, []);
  assert.deepEqual(seo.chapters, []);
});

test("the description is rendered ready to paste", () => {
  const seo = shapeSeoPackage({
    description: "The body.",
    chapters: [{ time: "0:00", label: "Intro" }, { time: "1:00", label: "Two" }, { time: "2:00", label: "Three" }],
  });
  const rendered = renderDescription(seo);
  assert.match(rendered, /^The body\./);
  assert.match(rendered, /Chapters:\n0:00 Intro\n1:00 Two\n2:00 Three/);
});

// ---------------------------------------------------------------------------
// The route and the sheet
// ---------------------------------------------------------------------------

test("the transcript row is found by id, never by position", () => {
  // This actor returns rows out of input order. Index-mapping has already
  // caused misfiled transcripts in this codebase's history.
  const route = read("../app/api/youtube/seo/route.ts");
  assert.match(route, /rows\.find\(\(r\) => r\.videoId === videoId\)/);
  assert.doesNotMatch(route, /rows\[0\]/);
});

test("the route says which piece is unconfigured", () => {
  const route = read("../app/api/youtube/seo/route.ts");
  assert.match(route, /APIFY_TOKEN/);
  assert.match(route, /ANTHROPIC_API_KEY/);
  assert.match(route, /no captions/, "a video with no captions yet is a normal state, not a failure");
});

test("the sheet opens first, grouped by stage", () => {
  const page = read("../app/youtube/page.tsx");
  assert.match(page, /useState<"board" \| "sheet">\("sheet"\)/);
  const sheet = read("../components/youtube-sheet.tsx");
  assert.match(sheet, /YOUTUBE_STAGES\.map\(\(stage\) => \(\{ stage, items: rows\.filter/);
  assert.match(sheet, />Shot video link</);
});

test("YouTube Studio is one click from the page", () => {
  const sheet = read("../components/youtube-sheet.tsx");
  assert.match(sheet, /YouTube Studio/);
  assert.match(sheet, /studioHref/);
  assert.match(sheet, /studioUrl\(videoId\)/, "and one click from any row that has a video");
});
