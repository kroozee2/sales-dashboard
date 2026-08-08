import assert from "node:assert/strict";
import test from "node:test";

import {
  GRAPHIC_FORMATS,
  buildGraphicPrompt,
  getGraphicFormat,
} from "../lib/graphic-generation.ts";

test("offers YouTube and all required Instagram graphic formats with exact aspect ratios", () => {
  assert.deepEqual(
    GRAPHIC_FORMATS.map(({ key, label, dimensions }) => ({ key, label, dimensions })),
    [
      { key: "youtube_thumbnail", label: "YouTube Thumbnail", dimensions: "16:9 · 1280×720" },
      { key: "instagram_square", label: "Instagram Square", dimensions: "1:1 · 1080×1080" },
      { key: "instagram_portrait", label: "Instagram Portrait", dimensions: "4:5 · 1080×1350" },
      { key: "instagram_story", label: "Story / Reel Cover", dimensions: "9:16 · 1080×1920" },
    ],
  );
});

test("falls back to YouTube when an unknown format is requested", () => {
  assert.equal(getGraphicFormat("not-real").key, "youtube_thumbnail");
});

test("builds the direct Gemini prompt used by the Skool graphics creator", () => {
  const prompt = buildGraphicPrompt({
    description: 'Text: "AI BUILT MY BUSINESS". My face on the right.',
    formatKey: "youtube_thumbnail",
    hasReference: true,
    facePhotoCount: 2,
  });

  assert.match(prompt, /1280×720px/);
  assert.match(prompt, /DESCRIPTION FROM USER:\nText: "AI BUILT MY BUSINESS"/);
  assert.match(prompt, /Match the aesthetic, mood, and quality level of the reference image/);
  assert.match(prompt, /2 face photos provided above must appear in the graphic/);
  assert.match(prompt, /Text must be 100% legible/);
  assert.doesNotMatch(prompt, /Claude|image brief|black \+ gold/i);
});

test("does not claim a reference or face photo when neither was supplied", () => {
  const prompt = buildGraphicPrompt({
    description: "A clean Instagram quote graphic",
    formatKey: "instagram_square",
    hasReference: false,
    facePhotoCount: 0,
  });

  assert.match(prompt, /1080×1080px/);
  assert.match(prompt, /Professional, polished, premium graphic design quality/);
  assert.doesNotMatch(prompt, /provided above must appear/);
  assert.doesNotMatch(prompt, /Match the aesthetic/);
});
