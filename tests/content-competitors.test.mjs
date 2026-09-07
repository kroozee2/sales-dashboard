import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONTENT_CREATORS,
  buildResearchLinks,
  isCompetitorPayloadWithinLimits,
  mergeCompetitorResearch,
  normalizeCompetitorResearch,
  upsertCompetitorResearch,
} from "../lib/content-competitors.ts";

test("seeds Andrew's three requested creators plus four strategically matched models", () => {
  assert.deepEqual(
    DEFAULT_CONTENT_CREATORS.map((creator) => creator.name),
    [
      "Dan Henry",
      "Jon Whiting",
      "Dan Bolton",
      "Alex Hormozi",
      "Leila Hormozi",
      "Daniel Priestley",
      "Chris Do",
    ],
  );

  for (const creator of DEFAULT_CONTENT_CREATORS) {
    assert.ok(creator.whyFit.length > 40, `${creator.name} needs a useful fit explanation`);
    assert.ok(creator.pillars.length >= 3, `${creator.name} needs at least three pillars`);
    assert.ok(creator.signaturePattern.length > 20, `${creator.name} needs a pattern to model`);
    assert.ok(creator.andrewAdaptation.length > 30, `${creator.name} needs an Andrew-specific adaptation`);
  }
});

test("builds one-click research links without assuming an unverified social handle", () => {
  const links = buildResearchLinks("Jon Whiting");

  assert.match(links.youtube, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
  assert.match(links.instagram, /google\.com\/search\?q=/);
  assert.match(decodeURIComponent(links.instagram), /site:instagram\.com Jon Whiting/);
  assert.match(links.linkedin, /google\.com\/search\?q=/);
});

test("limits persisted research payload size", () => {
  assert.equal(isCompetitorPayloadWithinLimits(DEFAULT_CONTENT_CREATORS), true);
  assert.equal(isCompetitorPayloadWithinLimits(Array.from({ length: 51 }, () => DEFAULT_CONTENT_CREATORS[0])), false);
  assert.equal(isCompetitorPayloadWithinLimits([{ ...DEFAULT_CONTENT_CREATORS[0], notes: "x".repeat(200_001) }]), false);
});

test("drops unsafe website protocols from saved research", () => {
  const [creator] = mergeCompetitorResearch([{
    ...DEFAULT_CONTENT_CREATORS[0],
    websiteUrl: "javascript:alert(document.cookie)",
  }]);

  assert.equal(creator.websiteUrl, undefined);
});

test("merges saved research into defaults and keeps custom creators", () => {
  const merged = mergeCompetitorResearch([
    {
      ...DEFAULT_CONTENT_CREATORS[0],
      notes: "Study his direct-response hooks.",
      watchStatus: "active",
    },
    {
      id: "custom-morgan-housel",
      name: "Morgan Housel",
      focus: "Story-led business thinking",
      whyFit: "Useful model for making timeless business lessons feel human and memorable.",
      pillars: ["Behavior", "Business", "Stories"],
      signaturePattern: "Short story followed by a counterintuitive lesson.",
      andrewAdaptation: "Use client and founder moments to teach peaceful scaling principles.",
      notes: "",
      watchStatus: "watching",
      websiteUrl: "https://www.morganhousel.com",
    },
  ]);

  assert.equal(merged.length, DEFAULT_CONTENT_CREATORS.length + 1);
  assert.equal(merged.find((creator) => creator.id === "dan-henry")?.notes, "Study his direct-response hooks.");
  assert.equal(merged.find((creator) => creator.id === "dan-henry")?.watchStatus, "active");
  assert.ok(merged.some((creator) => creator.name === "Morgan Housel"));
  assert.equal(new Set(merged.map((creator) => creator.id)).size, merged.length);
});

test("upserts one creator without erasing concurrent custom research", () => {
  const custom = {
    ...DEFAULT_CONTENT_CREATORS[0],
    id: "custom-a",
    name: "Custom A",
  };
  const current = mergeCompetitorResearch([custom]);
  const updatedDan = { ...current.find((creator) => creator.id === "dan-henry"), notes: "New hook notes" };
  const next = upsertCompetitorResearch(current, updatedDan);

  assert.equal(next.find((creator) => creator.id === "dan-henry")?.notes, "New hook notes");
  assert.ok(next.some((creator) => creator.id === "custom-a"));
  assert.equal(next.filter((creator) => creator.id === "dan-henry").length, 1);
});

test("rejects an invalid single-creator write instead of reporting success", () => {
  assert.equal(normalizeCompetitorResearch({ name: "Missing id" }), null);
  assert.equal(normalizeCompetitorResearch({ id: "missing-name" }), null);
  assert.equal(normalizeCompetitorResearch(DEFAULT_CONTENT_CREATORS[0])?.id, "dan-henry");
});
