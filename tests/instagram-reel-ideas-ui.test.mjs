import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/instagram/page.tsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/instagram/reel-ideas/route.ts", import.meta.url), "utf8");

test("Instagram Calendar exposes a Notes-style Reel idea capture and four grouped lists", () => {
  assert.match(source, /Add a Reel idea/);
  assert.match(source, /Shoot date/);
  assert.match(source, /REEL_IDEA_TYPES\.map/);
  assert.match(source, /ReelIdeaList/);
});

test("Reel ideas expose distinct and accessible Idea, Shot, and Posted controls", () => {
  assert.match(source, />Idea</);
  assert.match(source, />Shot</);
  assert.match(source, />Posted</);
  assert.match(source, /aria-pressed=\{stage === choice\}/);
  assert.match(source, /patchReelIdea\(item, \{ stage \}\)/);
});

test("calendar day action chooses the clicked shoot date without creating a record", () => {
  assert.match(source, /setQuickShootDate\(dateStr\)/);
  assert.doesNotMatch(source, /onClick=\{\(\) => createDraftItem\(`New Instagram Content`/);
  assert.match(source, /aria-label=\{`Add a Reel idea for \$\{dateStr\}`\}/);
});

test("quick creation and row updates use immediate mutation locks against double taps", () => {
  assert.match(source, /addingIdeaRef\.current/);
  assert.match(source, /updatingIdsRef\.current\.has\(id\)/);
  assert.match(source, /updatingIdsRef\.current\.add\(id\)/);
});

test("new controls expose labels, pressed states, nearby alerts, and mobile-safe text", () => {
  assert.match(source, /htmlFor="reel-idea-title"/);
  assert.match(source, /id="reel-idea-title"/);
  assert.match(source, /aria-pressed=\{quickIdeaType === type\.key\}/);
  assert.match(source, /role="alert"/);
  assert.match(source, /break-words \[overflow-wrap:anywhere\]/);
  assert.match(source, /maxLength=\{500\}/);
  assert.match(source, /placeholder-zinc-400/);
});

test("Reel creates and updates use the dedicated idempotent revision-safe endpoint", () => {
  assert.match(source, /\/api\/instagram\/reel-ideas/);
  assert.match(source, /expected_updated_at/);
  assert.match(route, /deterministicReelIdeaId/);
  assert.match(route, /\.eq\("updated_at", expectedUpdatedAt\)/);
  assert.match(route, /buildReelStagePatch/);
});


test("content loading ignores stale responses that finish after newer loads or mutations", () => {
  assert.match(source, /contentLoadSeqRef/);
  assert.match(source, /const generation = \+\+contentLoadSeqRef\.current/);
  assert.match(source, /generation !== contentLoadSeqRef\.current/);
});
