import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESENTATIONS_SEED_ID,
  PRESENTATIONS_SEED_SLUG,
  createSeedPresentationsDocument,
  seedPresentationsDocument,
  slugifyPresentationId,
  uniquePresentationSlug,
  parsePresentationsDocument,
  updatePresentationsDocument,
} from "../lib/presentations.ts";

test("the presentations library starts with the complete 5C deck as a stable draft", () => {
  const document = createSeedPresentationsDocument();
  assert.equal(document.version, 1);
  assert.equal(document.presentations.length, 1);
  const deck = document.presentations[0];
  assert.equal(deck.id, PRESENTATIONS_SEED_ID);
  assert.equal(deck.slug, PRESENTATIONS_SEED_SLUG);
  assert.equal(deck.title, "The 5C AI Employee System");
  assert.equal(deck.subtitle, "Turn your expertise into an AI employee that runs one repeatable system in your business, without losing your voice or control.");
  assert.equal(deck.status, "draft");
  assert.equal(deck.slides.length, 22);
  assert.equal(deck.slides[0].title, "The 5C AI Employee System");
  assert.equal(deck.slides[19].title, "Closing");
  assert.equal(deck.slides[20].optional, true);
  assert.match(deck.slides[20].title, /Technology Is Interchangeable/);
  assert.match(deck.slides[16].on_screen_copy, /Engine:/);
  assert.match(deck.slides[1].exercise, /show of hands/);
  assert.match(deck.slides[17].speaker_notes, /four-minute review/);
  assert.match(deck.facilitator_notes, /Keep the presentation business-first/);
  assert.match(deck.facilitator_notes, /One-Page AI Employee Blueprint/);
});

// Post-implementation remediation coverage: the initial transformer left Markdown
// separators inside slide fields and omitted the run-of-show metadata.
test("the seeded deck preserves source metadata without leaking section separators into fields", () => {
  const deck = createSeedPresentationsDocument().presentations[0];
  assert.match(deck.facilitator_notes, /Recommended duration:\*\* 50 to 60 minutes/);
  assert.match(deck.facilitator_notes, /Opening and problem \| 7 minutes/);
  for (const slide of deck.slides) {
    for (const value of [slide.on_screen_copy, slide.speaker_notes, slide.visual_direction, slide.exercise]) {
      assert.doesNotMatch(value, /(?:^|\n)---(?:\n|$)/, `${slide.id} contains a section separator`);
    }
  }
});


test("seeding is idempotent and never overwrites an existing presentation", () => {
  const first = createSeedPresentationsDocument();
  first.presentations[0].title = "Owner edited title";
  first.presentations[0].revision = 9;
  const seeded = seedPresentationsDocument(first);
  assert.equal(seeded.presentations.length, 1);
  assert.equal(seeded.presentations[0].title, "Owner edited title");
  assert.equal(seeded.presentations[0].revision, 9);
  assert.deepEqual(seedPresentationsDocument(seeded), seeded);

  const occupied = createSeedPresentationsDocument();
  occupied.presentations = [{ ...occupied.presentations[0], id: "custom", title: "Existing deck" }];
  const preserved = seedPresentationsDocument(occupied);
  assert.equal(preserved.presentations.length, 1, "a slug collision is preserved rather than overwritten or duplicated");
  assert.equal(preserved.presentations[0].title, "Existing deck");
});


test("presentation slugs are stable, bounded, canonical, and collision safe", () => {
  assert.equal(slugifyPresentationId("  My Expert Deck!  "), "my-expert-deck");
  assert.equal(slugifyPresentationId("x".repeat(79) + " Y"), "x".repeat(79));
  const base = "x".repeat(80);
  assert.equal(uniquePresentationSlug(base, [base]), "x".repeat(78) + "-2");
  assert.equal(uniquePresentationSlug("deck", ["deck", "deck-2"]), "deck-3");
});


test("stored presentation documents enforce exact schema, canonical IDs, and content bounds", () => {
  const valid = createSeedPresentationsDocument();
  assert.equal(parsePresentationsDocument(JSON.stringify(valid)).presentations[0].slides.length, 22);

  const unknown = structuredClone(valid);
  unknown.presentations[0].slides[0].unexpected = true;
  assert.throws(() => parsePresentationsDocument(JSON.stringify(unknown)), /Unknown field/);

  const oversized = structuredClone(valid);
  oversized.presentations[0].slides[0].speaker_notes = "n".repeat(12_001);
  assert.throws(() => parsePresentationsDocument(JSON.stringify(oversized)), /speaker_notes exceeds 12000/);

  const duplicate = structuredClone(valid);
  duplicate.presentations[0].slides[1].id = duplicate.presentations[0].slides[0].id;
  assert.throws(() => parsePresentationsDocument(JSON.stringify(duplicate)), /duplicate slide IDs/);

  const noncanonical = structuredClone(valid);
  noncanonical.presentations[0].slug = "Not Canonical";
  assert.throws(() => parsePresentationsDocument(JSON.stringify(noncanonical)), /slug is invalid/);
});


test("saving an edited presentation preserves identity and advances both revisions monotonically", () => {
  const current = createSeedPresentationsDocument();
  const deck = current.presentations[0];
  const input = {
    action: "save",
    expected_document_revision: current.revision,
    expected_row_updated_at: "2030-01-01T00:00:00.999999Z",
    presentation: {
      id: deck.id, slug: deck.slug, title: "Edited deck", subtitle: deck.subtitle, audience: deck.audience,
      slides: deck.slides, facilitator_notes: deck.facilitator_notes,
    },
  };
  const next = updatePresentationsDocument(current, input, "2020-01-01T00:00:00.000Z", input.expected_row_updated_at);
  assert.equal(next.presentations[0].id, deck.id);
  assert.equal(next.presentations[0].slug, deck.slug);
  assert.equal(next.presentations[0].title, "Edited deck");
  assert.equal(next.presentations[0].revision, 2);
  assert.ok(next.revision > "2030-01-01T00:00:00.999Z");
  assert.equal(parsePresentationsDocument(JSON.stringify(next)).presentations[0].title, "Edited deck");
});


test("deploy freezes an audience-only snapshot and later saves do not mutate it", () => {
  const current = createSeedPresentationsDocument();
  const deck = current.presentations[0];
  const draft = { id: deck.id, slug: deck.slug, title: deck.title, subtitle: deck.subtitle, audience: deck.audience, slides: deck.slides, facilitator_notes: deck.facilitator_notes };
  const deployed = updatePresentationsDocument(current, { action: "deploy", expected_document_revision: current.revision, expected_row_updated_at: null, presentation: draft }, "2026-09-12T01:00:00.000Z", null);
  const snapshot = deployed.presentations[0].deployed_snapshot;
  assert.equal(deployed.presentations[0].status, "deployed");
  assert.ok(snapshot);
  assert.equal(snapshot.revision, 2);
  assert.equal("speaker_notes" in snapshot.slides[0], false);
  assert.equal("visual_direction" in snapshot.slides[0], false);
  assert.equal("exercise" in snapshot.slides[0], false);
  assert.doesNotMatch(JSON.stringify(snapshot), /Today is not about collecting more AI tools/);
  assert.doesNotMatch(JSON.stringify(snapshot), /founder in the center of a business/);

  const edited = { ...draft, title: "New draft title", slides: structuredClone(draft.slides) };
  edited.slides[0].on_screen_copy = "Changed after deployment";
  const saved = updatePresentationsDocument(deployed, { action: "save", expected_document_revision: deployed.revision, expected_row_updated_at: deployed.updated_at, presentation: edited }, "2026-09-12T02:00:00.000Z", deployed.updated_at);
  assert.equal(saved.presentations[0].status, "draft");
  assert.equal(saved.presentations[0].deployed_snapshot.title, deck.title);
  assert.notEqual(saved.presentations[0].deployed_snapshot.slides[0].on_screen_copy, "Changed after deployment");
});
