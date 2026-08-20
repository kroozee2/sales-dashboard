import test from "node:test";
import assert from "node:assert/strict";
import { datasetItems, readBoundedText, runActorSync, startRun, runStatus } from "../lib/apify-http.ts";

test("Apify helpers send tokens in authorization headers, never query strings", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("actor-runs")) return new Response(JSON.stringify({ data: { status: "SUCCEEDED" } }));
    return new Response(JSON.stringify({ data: { id: "run", defaultDatasetId: "data" } }));
  };
  try {
    await startRun("actor", { x: 1 }, "secret-token");
    await runStatus("run", "secret-token");
  } finally { globalThis.fetch = original; }
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url.includes("secret-token"), false);
    assert.equal(new Headers(call.init.headers).get("authorization"), "Bearer secret-token");
  }
});

test("provider response reader stops while streaming beyond the byte ceiling", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(8));
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(() => readBoundedText(new Response(stream), 10), /too large/i);
  assert.equal(cancelled, true);
});

test("dataset reads enforce an item limit as well as a byte limit", async () => {
  let requested = "";
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => { requested = String(url); return new Response("[]"); };
  try { await datasetItems("dataset", "secret-token", 1_000, 20); }
  finally { globalThis.fetch = original; }
  assert.equal(new URL(requested).searchParams.get("limit"), "20");
});

test("synchronous actor responses enforce an item ceiling", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]));
  let items;
  try { items = await runActorSync("actor", {}, "secret-token", 1_000, 2); }
  finally { globalThis.fetch = original; }
  assert.deepEqual(items, [{ id: 1 }, { id: 2 }]);
});
