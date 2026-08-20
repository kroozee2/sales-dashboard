import test from "node:test";
import assert from "node:assert/strict";
import { BoundedBodyError, readBoundedJsonObject } from "../lib/http-bounds.ts";
import { parseSyncReservation } from "../lib/social-sync-reservation.ts";

test("request JSON reader stops while streaming beyond the byte ceiling", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":"'));
      controller.enqueue(new Uint8Array(32));
    },
    cancel() { cancelled = true; },
  });
  const request = new Request("https://example.test", { method: "POST", body: stream, duplex: "half" });
  await assert.rejects(() => readBoundedJsonObject(request, 12), (error) => error instanceof BoundedBodyError && error.status === 413);
  assert.equal(cancelled, true);
});

test("request JSON reader requires a bounded object", async () => {
  const arrayRequest = new Request("https://example.test", { method: "POST", body: "[]" });
  await assert.rejects(() => readBoundedJsonObject(arrayRequest, 100), (error) => error instanceof BoundedBodyError && error.status === 400);
  const objectRequest = new Request("https://example.test", { method: "POST", body: '{"platform":"instagram"}' });
  assert.deepEqual(await readBoundedJsonObject(objectRequest, 100), { platform: "instagram" });
});

test("sync reservations bind bounded provider references to one platform", () => {
  const valid = JSON.stringify({ status: "running", token: "claim", platform: "instagram", startedAt: "2026-08-20T12:00:00Z", runs: [{ runId: "run_1", datasetId: "data_1" }] });
  assert.equal(parseSyncReservation(valid)?.runs?.[0].runId, "run_1");
  assert.equal(parseSyncReservation(JSON.stringify({ ...JSON.parse(valid), platform: "other" })), null);
  assert.equal(parseSyncReservation(JSON.stringify({ ...JSON.parse(valid), runs: Array.from({ length: 6 }, (_, i) => ({ runId: `r${i}`, datasetId: `d${i}` })) })), null);
});
