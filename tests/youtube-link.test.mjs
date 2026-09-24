import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIDENT, buildVideoLink, itemDate, rankCandidates, readVideoLink,
  scoreCandidate, suggestLinks, titleSimilarity, videoFormat,
} from "../lib/youtube-link.ts";

const NOW = new Date("2026-09-24T12:00:00Z");

// The two real pipeline entries, and the real uploads they belong to.
const agents = {
  id: "item-agents", title: "How to Assemble Your AI Agents",
  format: "long_form", shootAt: null, scheduledDate: "2026-09-23", updatedAt: "2026-09-23",
};
const model = {
  id: "item-model", title: "The 7 Figure CEO Model",
  format: "long_form", shootAt: "2026-09-10T15:47:00.000Z", scheduledDate: null, updatedAt: "2026-09-10",
};
const hiring = {
  videoId: "7t_QqYBbLg8", title: "Stop Hiring Humans: Build Your AI Team Instead (In Less than 20 Minutes)",
  url: "https://www.youtube.com/watch?v=7t_QqYBbLg8", postedAt: "2026-09-23", views: 75,
};
const offer = {
  videoId: "jeb2X_-sMcc", title: "The Secret 4 Step Offer Model for Coaches to Turn AI Into Money",
  url: "https://www.youtube.com/watch?v=jeb2X_-sMcc", postedAt: "2026-09-10", views: 151,
};
const funnel = {
  videoId: "-k9p19MD1t8", title: "Launch Your 7-Figure Community Funnel In 24 Hours or Less",
  url: "https://www.youtube.com/watch?v=-k9p19MD1t8", postedAt: "2026-08-31", views: 146,
};
const aShort = {
  videoId: "2pm-D9c89AU", title: "Set Up AI Agents Like This",
  url: "https://www.youtube.com/shorts/2pm-D9c89AU", postedAt: "2026-09-23", views: 279,
};

test("a Short is told apart from a long-form upload by its URL", () => {
  assert.equal(videoFormat("https://www.youtube.com/shorts/abc"), "short");
  assert.equal(videoFormat("https://www.youtube.com/watch?v=abc"), "long_form");
  assert.equal(videoFormat(null), "long_form");
});

test("a long-form entry never matches a Short, however well it reads", () => {
  // "Set Up AI Agents Like This" shares more words with the item than the real
  // upload does, and was posted the same day. It is still the wrong video.
  assert.equal(scoreCandidate(agents, aShort), null);
});

test("the same day carries the match even when the title was rewritten", () => {
  const candidate = scoreCandidate(agents, hiring);
  assert.ok(candidate);
  assert.equal(candidate.sameDay, true);
  assert.ok(candidate.score >= CONFIDENT, `same-day match should be confident, got ${candidate.score}`);
  assert.ok(candidate.reasons.includes("published the same day"));
  assert.ok(candidate.reasons.includes("title was rewritten"),
    "it should say the title does not match rather than hide it");
});

test("shoot_at is used when there is no scheduled date", () => {
  assert.equal(itemDate(model), "2026-09-10");
  const candidate = scoreCandidate(model, offer);
  assert.equal(candidate.sameDay, true);
  assert.ok(candidate.score >= CONFIDENT);
});

test("a video from three weeks earlier does not win on wording alone", () => {
  const candidate = scoreCandidate(model, funnel);
  assert.ok(candidate.score < CONFIDENT, `should not be confident, got ${candidate.score}`);
});

test("both real items pick their real video", () => {
  const suggestions = suggestLinks([agents, model], [hiring, offer, funnel, aShort]);
  const byItem = Object.fromEntries(suggestions.map((s) => [s.item.id, s]));
  assert.equal(byItem["item-agents"].best.video.videoId, "7t_QqYBbLg8");
  assert.equal(byItem["item-model"].best.video.videoId, "jeb2X_-sMcc");
  assert.ok(byItem["item-agents"].confident);
  assert.ok(byItem["item-model"].confident);
});

test("two items cannot claim the same upload", () => {
  const twin = { ...model, id: "item-twin", title: "Another take on the model" };
  const suggestions = suggestLinks([model, twin], [offer]);
  const picked = suggestions.map((s) => s.best?.video.videoId ?? null);
  assert.equal(picked.filter((id) => id === "jeb2X_-sMcc").length, 1,
    "the second item must not be handed a video already taken");
});

test("a video already linked elsewhere is off the table", () => {
  const suggestions = suggestLinks([agents], [hiring], ["7t_QqYBbLg8"]);
  assert.equal(suggestions[0].best, null);
  assert.equal(suggestions[0].confident, false);
});

test("nothing is ever linked automatically, only suggested", () => {
  const suggestions = suggestLinks([agents], [hiring]);
  // The shape carries a suggestion and a confidence, never a saved link.
  assert.ok("best" in suggestions[0] && "confident" in suggestions[0]);
  assert.equal("link" in suggestions[0], false);
});

test("alternatives are offered, best first, and capped", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    videoId: `v${i}`, title: `Video ${i}`,
    url: `https://www.youtube.com/watch?v=v${i}`, postedAt: "2026-09-20", views: 1,
  }));
  const ranked = rankCandidates(agents, many);
  assert.ok(ranked.length <= 5, "a long list of near-misses is not helpful");
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i - 1].score >= ranked[i].score, "must be ordered best first");
  }
});

test("title similarity ignores filler words", () => {
  assert.equal(titleSimilarity("How to Build Your AI Team", "Build an AI Team"), 1,
    "how/to/your/an carry no meaning");
  assert.equal(titleSimilarity("Stop Hiring Humans", "The 7 Figure CEO Model"), 0);
});

test("an item with no date at all is not guessed at confidently", () => {
  const undated = { ...agents, shootAt: null, scheduledDate: null, updatedAt: null };
  const candidate = scoreCandidate(undated, hiring);
  assert.ok(candidate.score < CONFIDENT);
  assert.ok(candidate.reasons.includes("no date to compare"));
});

/* ── The link that gets written ────────────────────────────────────────── */

test("a confirmed link carries the URL and the published title", () => {
  const link = buildVideoLink(hiring, "suggested", NOW);
  assert.equal(link.video_id, "7t_QqYBbLg8");
  assert.equal(link.url, "https://www.youtube.com/watch?v=7t_QqYBbLg8");
  assert.equal(link.posted_title, hiring.title, "the published title, not the working one");
  assert.equal(link.posted_at, "2026-09-23");
  assert.equal(link.linked_by, "suggested");
});

test("a link without a real URL or id is refused", () => {
  assert.throws(() => buildVideoLink({ ...hiring, url: "No Recording" }, "manual", NOW), /URL/);
  assert.throws(() => buildVideoLink({ ...hiring, videoId: "" }, "manual", NOW), /video id/);
});

test("reading a link back survives junk", () => {
  assert.equal(readVideoLink(null), null);
  assert.equal(readVideoLink({}), null);
  assert.equal(readVideoLink({ youtube_link: "nope" }), null);
  assert.equal(readVideoLink({ youtube_link: { url: "x" } }), null, "an id is required");
  const round = readVideoLink({ youtube_link: buildVideoLink(hiring, "manual", NOW) });
  assert.equal(round.video_id, "7t_QqYBbLg8");
  assert.equal(round.linked_by, "manual");
});
