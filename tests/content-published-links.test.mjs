import test from "node:test";
import assert from "node:assert/strict";
import { publishedSourcesOf } from "../lib/content-published-sources.ts";

const source = (overrides = {}) => ({
  platform: "instagram",
  external_id: "ig-1",
  url: "https://www.instagram.com/p/abc",
  published_at: "2026-08-01T16:00:00Z",
  source: "composio_instagram",
  ...overrides,
});

test("publishedSourcesOf fails the complete array closed when any member is malformed", () => {
  const valid = source();
  for (const malformed of [null, "bad", { ...source(), unexpected: true }, { platform: "instagram" }, { ...source(), url: "javascript:alert(1)" }]) {
    assert.deepEqual(publishedSourcesOf({ published_sources: [valid, malformed] }), []);
  }
});

test("publishedSourcesOf returns safe complete deduplicated source links", () => {
  const facebook = { platform: "facebook", external_id: "fb-1", url: "https://facebook.com/post/1", published_at: "2026-08-01T16:00:00Z", source: "apify_facebook" };
  const email = { platform: "email", external_id: "ghl-1", url: "https://firebasestorage.googleapis.com/email/ghl-1", published_at: "2026-08-02T16:00:00Z", source: "ghl_broadcast" };
  assert.deepEqual(publishedSourcesOf({ published_sources: [facebook, facebook, email] }), [facebook, email]);
});

test("publishedSourcesOf rejects an oversized source list", () => {
  const published_sources = Array.from({ length: 21 }, (_, index) => ({ platform: "facebook", external_id: `fb-${index}`, url: `https://facebook.com/post/${index}`, published_at: "2026-08-01T16:00:00Z", source: "apify_facebook" }));
  assert.deepEqual(publishedSourcesOf({ published_sources }), []);
});

test("publishedSourcesOf trims fields and keeps collision-safe identity tuples", () => {
  const published_sources = [
    { platform: "facebook", external_id: " a:b ", url: "https://facebook.com/post/one", published_at: "2026-08-01T16:00:00Z", source: " apify_facebook " },
    { platform: "facebook", external_id: "a", url: "https://facebook.com/post/two", published_at: "2026-08-01T16:00:00Z", source: "apify_facebook" },
  ];
  assert.deepEqual(publishedSourcesOf({ published_sources }).map(({ external_id, source }) => ({ external_id, source })), [
    { external_id: "a:b", source: "apify_facebook" },
    { external_id: "a", source: "apify_facebook" },
  ]);

  assert.deepEqual(publishedSourcesOf({ published_sources: [source(), source({ external_id: "   " })] }), []);
});


test("rejects impossible UTC calendar dates but accepts a real leap day", () => {
  assert.deepEqual(publishedSourcesOf({ published_sources: [source({ published_at: "2026-02-31T16:00:00Z" })] }), []);
  assert.deepEqual(publishedSourcesOf({ published_sources: [source({ published_at: "2025-02-29T16:00:00Z" })] }), []);
  assert.equal(publishedSourcesOf({ published_sources: [source({ published_at: "2028-02-29T16:00:00Z" })] }).length, 1);
});

test("rejects padded URLs, controls, credentials, non-default ports, and oversized source arrays", () => {
  assert.deepEqual(publishedSourcesOf({ published_sources: [source({ url: "  https://www.instagram.com/p/abc  " })] }), []);
  assert.deepEqual(publishedSourcesOf({ published_sources: [source({ platform: "youtube", external_id: "dQw4w9WgXcQ", url: " https://www.youtube.com/watch?v=dQw4w9WgXcQ " })] }), []);
  for (const url of ["https://www.instagram.com/p/a\nb", "\nhttps://www.instagram.com/p/abc", "https://www.instagram.com/p/abc\t", "https://www.instagram.com/p/abc\u0085", "https:\\www.instagram.com/p/abc", "https://www。instagram。com/p/abc", "https://user@www.instagram.com/p/abc", "https://www.instagram.com:8443/p/abc"]) {
    assert.deepEqual(publishedSourcesOf({ published_sources: [source({ url })] }), []);
  }
  assert.deepEqual(publishedSourcesOf({ published_sources: Array.from({ length: 21 }, (_, index) => source({ external_id: String(index), url: `https://www.instagram.com/p/${index}` })) }), []);
});


test("rejects YouTube source identities that disagree with the direct URL", () => {
  assert.deepEqual(publishedSourcesOf({ published_sources: [source({
    platform: "youtube",
    external_id: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=different-id",
  })] }), []);
});


test("rejects source records with unknown fields", () => {
  assert.deepEqual(publishedSourcesOf({ published_sources: [source({ unexpected: true })] }), []);
});

test("rejects one canonical URL claimed by different external identities", () => {
  const first = source({ external_id: "ig-1", url: "https://www.instagram.com/p/same" });
  const second = source({ external_id: "ig-2", url: "https://www.instagram.com/p/same" });
  assert.deepEqual(publishedSourcesOf({ published_sources: [first, second] }), []);
});


test("rejects one external identity mapped to different canonical URLs", () => {
  const first = source({ external_id: "ig-same", url: "https://www.instagram.com/p/one" });
  const second = source({ external_id: "ig-same", url: "https://www.instagram.com/p/two" });
  assert.deepEqual(publishedSourcesOf({ published_sources: [first, second] }), []);
});


test("rejects ambiguous or noncanonical YouTube identity paths", () => {
  for (const url of [
    "https://youtu.be/dQw4w9WgXcQ/extra",
    "https://youtu.be//dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ//",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ/extra",
    "https://www.youtube.com/shorts//dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ/extra",
    "https://www.youtube.com/embed//dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=oHg5SJYRHA0",
    "https://www.youtube.com/watch?%76=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9Wg%58cQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&",
    "https://www.youtube.com/watch?&v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&&",
    "https://%79outube.com/watch?v=dQw4w9WgXcQ",
    "https://www.%79outube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/x/../watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/%2e/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ#",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ?",
    "https://youtu.be/dQw4w9Wg%58cQ",
    "https://www.youtube.com/watch?v=dQw4w9Wg%58cQ",
  ]) {
    assert.deepEqual(publishedSourcesOf({ published_sources: [source({ platform: "youtube", external_id: "dQw4w9WgXcQ", url })] }), []);
  }
});


test("rejects raw controls in non-URL source identity fields", () => {
  for (const candidate of [
    source({ external_id: "ig-1\n" }),
    source({ source: "composio_instagram\t" }),
    source({ external_id: "ig-1\u0085" }),
  ]) {
    assert.deepEqual(publishedSourcesOf({ published_sources: [candidate] }), []);
  }
});

test("rejects duplicate YouTube v parameters even when one value is blank", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=",
    "https://www.youtube.com/watch?v=&v=dQw4w9WgXcQ",
  ]) {
    assert.deepEqual(publishedSourcesOf({ published_sources: [source({ platform: "youtube", external_id: "dQw4w9WgXcQ", url })] }), []);
  }
});


test("requires exact 11-character YouTube video IDs", () => {
  for (const external_id of ["x", "abcdefghijkl"]) {
    assert.deepEqual(publishedSourcesOf({ published_sources: [source({ platform: "youtube", external_id, url: `https://www.youtube.com/watch?v=${external_id}` })] }), []);
  }
});


test("rejects duplicate source identities with conflicting publication metadata", () => {
  const valid = source();
  for (const conflicting of [source({ source: "other_source" }), source({ published_at: "2026-08-02T16:00:00Z" })]) {
    assert.deepEqual(publishedSourcesOf({ published_sources: [valid, conflicting] }), []);
  }
});
