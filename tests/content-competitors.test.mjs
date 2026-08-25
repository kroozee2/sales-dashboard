import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  DEFAULT_CONTENT_CREATORS,
  buildResearchLinks,
  isCompetitorPayloadWithinLimits,
  mergeCompetitorResearch,
  mergeEditableCompetitorResponse,
  normalizeCompetitorResearch,
  sanitizeEditableCompetitor,
  upsertCompetitorResearch,
} from "../lib/content-competitors.ts";

test("competitor workspace renders linked spreadsheet views with the requested columns", () => {
  const component = readFileSync(new URL("../components/competitor-research.tsx", import.meta.url), "utf8");
  assert.match(component, />Competitors</);
  assert.match(component, />Best content</);
  for (const heading of ["Name", "Followers", "Top-content avg views", "Instagram", "Notes"]) {
    assert.match(component, new RegExp(`>${heading}<`));
  }
  for (const heading of ["Creator", "Views / plays", "Title", "Hook", "Description", "Call to action", "Source"]) {
    assert.match(component, new RegExp(`>${heading}<`));
  }
  assert.match(component, /setView\("content"\)/);
  assert.match(component, /setContentCreatorId\(creator\.id\)/);
  assert.doesNotMatch(component, /onBlur=/);
  assert.match(component, /mutationLocks\.current\.has\(creator\.id\)/);
  assert.match(component, /savingIds\.has\(creator\.id\)/);
  assert.doesNotMatch(component, /\bsavingId\b/);
  assert.match(component, />Save row</);
  assert.match(component, /onModel\(creator,"reel",post\)/);
  assert.match(component, /onModel\(creator,"carousel",post\)/);
  const page = readFileSync(new URL("../app/instagram/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function modelCreator\(creator:ContentCompetitor,type:CreatorType,post\?/);
  assert.match(page, /setSourceUrl\(post\?\.url\|\|creator\.evidence\?\.\[0\]\?\.url\|\|""\)/);
});

test("unavailable or corrupt follower metadata never becomes a verified count", () => {
  for (const followers of [null, "", 1.5, "1000"]) {
    const creator = normalizeCompetitorResearch({...DEFAULT_CONTENT_CREATORS[0],followers});
    assert.equal(creator?.followers,undefined);
  }
  assert.equal(normalizeCompetitorResearch({...DEFAULT_CONTENT_CREATORS[0],followers:1000})?.followers,1000);
});

test("editable competitor input strips server-owned research and revision fields", () => {
  const creator = sanitizeEditableCompetitor({
    id: "custom-safe", name: "Safe Creator", focus: "Focus", whyFit: "Fit", pillars: ["One"],
    signaturePattern: "Pattern", andrewAdaptation: "Adapt", notes: "Notes", watchStatus: "active",
    researchedAt: "2026-08-20T12:00:00Z", sampledPostsCount: 20,
    evidence: [{ url: "https://www.instagram.com/p/fake/", likes: 999999 }], revision: "2026-08-20T12:00:00Z",
  });
  assert.ok(creator);
  assert.equal(creator.researchedAt, undefined);
  assert.equal(creator.sampledPostsCount, undefined);
  assert.equal(creator.evidence, undefined);
  assert.equal(creator.revision, undefined);
});

test("editable save responses preserve server-owned metrics and evidence in browser state", () => {
  const current = normalizeCompetitorResearch({
    ...DEFAULT_CONTENT_CREATORS[0], followers:1000, instagramHandle:"danhenry",
    evidence:[{url:"https://www.instagram.com/reel/ABC/",postedAt:null,type:"Video",captionExcerpt:"Hook",title:"Hook",hook:"Hook",description:"",cta:"",likes:1,comments:1,plays:100,views:90,score:1000}],
    revision:"2026-08-20T12:00:00Z",
  });
  const saved = sanitizeEditableCompetitor({...DEFAULT_CONTENT_CREATORS[0],notes:"Fresh note"});
  const merged = mergeEditableCompetitorResponse(current, {...saved,revision:"2026-08-21T12:00:00Z"});
  assert.equal(merged.followers,1000);
  assert.equal(merged.evidence?.length,1);
  assert.equal(merged.notes,"Fresh note");
  assert.equal(merged.revision,"2026-08-21T12:00:00Z");
});

test("saved competitor research preserves verified follower and content-breakdown fields", () => {
  const creator = normalizeCompetitorResearch({
    ...DEFAULT_CONTENT_CREATORS[0],
    instagramHandle: "danhenry",
    followers: 812345,
    evidence: [{
      url: "https://www.instagram.com/reel/ABC/",
      postedAt: "2026-08-20T12:00:00Z",
      type: "Video",
      captionExcerpt: "Hook\nDescription\nComment SCALE",
      title: "Hook",
      hook: "Hook",
      description: "Description",
      cta: "Comment SCALE",
      likes: 100,
      comments: 20,
      plays: 5000,
      views: 4800,
      score: 5020,
    }],
  });

  assert.equal(creator?.instagramHandle, "danhenry");
  assert.equal(creator?.followers, 812345);
  assert.deepEqual(
    Object.fromEntries(["title", "hook", "description", "cta"].map((key) => [key, creator?.evidence?.[0]?.[key]])),
    { title: "Hook", hook: "Hook", description: "Description", cta: "Comment SCALE" },
  );
});

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
