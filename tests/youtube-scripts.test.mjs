import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  copyableAssetText,
  formatScriptDate,
  formatScriptDateTime,
  getScriptRows,
  getYouTubePackage,
} from "../lib/youtube-scripts.ts";

const item = (overrides = {}) => ({
  id: "idea-123",
  title: "The original idea",
  scheduled_date: null,
  media_urls: [],
  notes: null,
  video_script: null,
  meta: {},
  ...overrides,
});

test("the YouTube page wires a top-level Scripts tab to shared content items", async () => {
  const source = await readFile(new URL("../app/youtube/page.tsx", import.meta.url), "utf8");
  assert.match(source, /type Tab = [^;]*"scripts"/);
  assert.match(source, /key: "scripts", label: "Scripts"/);
  assert.match(source, /tab === "scripts"[^\r\n]*<YouTubeScripts[^>]*items=\{items\}/);
  assert.equal((source.match(/fetch\("\/api\/youtube\/content"/g) ?? []).length, 3, "tab wiring must not add another content request");
  const component = await readFile(new URL("../components/youtube-scripts.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /fetch\(/, "Scripts receives the shared items instead of querying another store");
});

test("script rows include only current content item IDs with saved script/package data", () => {
  const rows = getScriptRows([
    item({ id: "script", video_script: "  Full script  ", meta: { video_stage: "recording" } }),
    item({ id: "package", title: "Packaged", meta: { youtube_package: { recommendedTitle: "Recommended" } } }),
    item({ id: "empty", video_script: "   ", meta: {} }),
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["script", "package"]);
  assert.equal(rows[0].script, "Full script");
  assert.equal(rows[0].stage, "recording");
  assert.equal(getScriptRows([item({ video_script: "Script", notes: "Bring up the live demo first." })])[0].notes, "Bring up the live demo first.");
  assert.equal(rows[1].title, "Recommended");
  assert.equal(rows[1].sourceTitle, "Packaged");
});

test("package helpers preserve only actually saved optional assets", () => {
  const pkg = getYouTubePackage(item({ meta: { youtube_package: {
    recommendedTitle: "  A strong title ", alternateTitles: ["Alt one", " ", 42],
    openingHook: "Hook", framework: "", thumbnailText: "CLICK THIS", thumbnailBrief: "Face and board",
    runOfShow: [{ time: "0:00", section: "Open", purpose: "Promise" }, { time: 2 }],
    seoDescription: "Search description", chapters: ["00:00 Start"], pinnedComment: "What will you build?",
    clipHooks: ["Clip me"], recordingChecklist: ["Mic on"],
  } } }));
  assert.equal(pkg?.recommendedTitle, "A strong title");
  assert.deepEqual(pkg?.alternateTitles, ["Alt one"]);
  assert.equal(pkg?.framework, null);
  assert.deepEqual(pkg?.runOfShow, [{ time: "0:00", section: "Open", purpose: "Promise" }]);
  assert.equal(pkg?.thumbnailText, "CLICK THIS");
  assert.equal(pkg?.thumbnailBrief, "Face and board");
  assert.equal(pkg?.seoDescription, "Search description");
  assert.deepEqual(pkg?.chapters, ["00:00 Start"]);
  assert.equal(pkg?.pinnedComment, "What will you build?");
  assert.deepEqual(pkg?.clipHooks, ["Clip me"]);
  assert.deepEqual(pkg?.recordingChecklist, ["Mic on"]);
});

test("row readiness and thumbnail status are truthful", () => {
  const [row] = getScriptRows([item({
    video_script: "Script",
    media_urls: [],
    meta: { youtube_package: { thumbnailBrief: "Face plus board" } },
  })]);
  assert.equal(row.scriptReadiness, "Script ready");
  assert.equal(row.thumbnailText, null);
  assert.equal(row.thumbnailStatus, "Brief ready");

  const [image] = getScriptRows([item({ video_script: "Script", meta: { thumbnail_url: "https://example.com/thumb.png" } })]);
  assert.equal(image.thumbnailStatus, "Image ready");
});

test("date helpers are human-readable and reject invalid or normalized dates", () => {
  assert.equal(formatScriptDate("2026-09-12"), "Sep 12, 2026");
  assert.match(formatScriptDateTime("2026-09-12T15:30:00Z"), /^Sep 12, 2026, /);
  assert.equal(formatScriptDate("2026-02-30"), "Unavailable");
  assert.equal(formatScriptDateTime("not-a-date"), "Unavailable");
  assert.equal(formatScriptDate(null), "Unavailable");
});


test("copyable production assets preserve useful structure", () => {
  assert.equal(copyableAssetText("Recommended title", "A useful title"), "A useful title");
  assert.equal(copyableAssetText("Chapters", ["00:00 Start", "01:00 Demo"]), "00:00 Start\n01:00 Demo");
  assert.equal(copyableAssetText("Run of show", [
    { time: "0:00", section: "Hook", purpose: "Earn attention" },
    { time: "0:30", section: "Demo", purpose: "Show the result" },
  ]), "0:00 | Hook | Earn attention\n0:30 | Demo | Show the result");
  assert.equal(copyableAssetText("Missing", null), null);
});

test("the drawer exposes one-click copy controls for package assets", async () => {
  const source = await readFile(new URL("../components/youtube-scripts.tsx", import.meta.url), "utf8");
  assert.match(source, /<Asset title="Recommended title"[^>]*onCopy=\{onCopy\}/);
  assert.match(source, /<Asset title="Thumbnail brief"[^>]*onCopy=\{onCopy\}/);
  assert.match(source, /<Asset title="SEO description"[^>]*onCopy=\{onCopy\}/);
  assert.match(source, /<Asset title="Board copy"[^>]*onCopy=\{onCopy\}/);
  assert.match(source, /<Asset title="Production notes"[^>]*onCopy=\{onCopy\}/);
  assert.match(source, /<ListAsset title="Recording checklist"[^>]*onCopy=\{onCopy\}/);
});


test("shoot timestamps require complete semantically valid RFC3339 values", () => {
  assert.equal(formatScriptDateTime("2026-09-12"), "Unavailable");
  assert.equal(formatScriptDateTime("2026-09-12T15:30:00"), "Unavailable");
  assert.equal(formatScriptDateTime("2026-09-12T25:30:00Z"), "Unavailable");
  assert.equal(formatScriptDateTime("2026-02-30T15:30:00Z"), "Unavailable");
  assert.match(formatScriptDateTime("2026-09-12T15:30:00-07:00"), /^Sep 12, 2026, /);
});

test("thumbnail readiness never treats generic media or watch links as an image", () => {
  for (const mediaUrl of ["not a url", "https://www.youtube.com/watch?v=abc123", "https://example.com/video.mp4"]) {
    const [row] = getScriptRows([item({ video_script: "Script", media_urls: [mediaUrl] })]);
    assert.equal(row.thumbnailStatus, "Unavailable");
  }
  const [verified] = getScriptRows([item({ video_script: "Script", meta: { thumbnail_url: "https://cdn.example.com/thumbnail.webp" } })]);
  assert.equal(verified.thumbnailStatus, "Image ready");
});

test("missing stored titles remain explicitly unavailable", () => {
  for (const title of ["   ", null, 42]) {
    const [row] = getScriptRows([item({ title, video_script: "Script" })]);
    assert.equal(row.sourceTitle, "Unavailable");
    assert.equal(row.title, "Unavailable");
  }
});
