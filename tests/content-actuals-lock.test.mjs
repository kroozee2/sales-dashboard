import assert from "node:assert/strict";
import test from "node:test";
import { leaseTransition } from "../lib/content-actuals-lock.ts";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-09-05T12:00:00.000Z");

test("content actuals lease serializes independent workers and permits expiry recovery", () => {
  const acquired = leaseTransition(null, "acquire", ownerA, now);
  assert.equal(acquired.ok, true);
  assert.equal(acquired.status, 200);

  const blocked = leaseTransition(acquired.value, "acquire", ownerB, now + 1_000);
  assert.deepEqual(blocked, { ok: false, status: 409, error: "content actuals sync is already running" });

  const stillBlocked = leaseTransition(acquired.value, "acquire", ownerB, now + 20 * 60_000);
  assert.equal(stillBlocked.status, 409);
  const recovered = leaseTransition(acquired.value, "acquire", ownerB, now + 31 * 60_000);
  assert.equal(recovered.ok, true);
});

test("content actuals lease release requires the current owner", () => {
  const acquired = leaseTransition(null, "acquire", ownerA, now);
  assert.equal(leaseTransition(acquired.value, "release", ownerB, now + 1_000).status, 409);
  const released = leaseTransition(acquired.value, "release", ownerA, now + 1_000);
  assert.equal(released.ok, true);
  assert.equal(JSON.parse(released.value).expires_at, "2026-09-05T12:00:01.000Z");
});

test("content actuals lease fails closed on malformed persisted state", () => {
  const malformed = leaseTransition("not-json", "acquire", ownerA, now);
  assert.deepEqual(malformed, { ok: false, status: 409, error: "content actuals lease state is malformed" });
  const impossibleDate = JSON.stringify({ owner: ownerA, expires_at: "2026-02-31T12:00:00.000Z" });
  assert.equal(leaseTransition(impossibleDate, "acquire", ownerA, now).status, 409);
  for (const duplicate of [
    `{"owner":"${ownerA}","owner":"${ownerB}","expires_at":"2026-09-05T12:30:00.000Z"}`,
    `{"owner":"${ownerA}","\u006fwner":"${ownerB}","expires_at":"2026-09-05T12:30:00.000Z"}`,
    `{"owner":"${ownerA}","expires_at":"2026-09-05T12:30:00.000Z","expires_at":"2026-09-05T12:31:00.000Z"}`,
  ]) assert.equal(leaseTransition(duplicate, "release", ownerB, now).status, 409);
});

test("content actuals lease rejects malformed actions and owners", () => {
  assert.equal(leaseTransition(null, "invalid", ownerA, now).status, 400);
  assert.equal(leaseTransition(null, "acquire", "not-a-uuid", now).status, 400);
});
