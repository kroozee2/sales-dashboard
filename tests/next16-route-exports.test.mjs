import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("Next 16 pages and routes keep helper exports internal", () => {
  assert.doesNotMatch(source("app/api/leads/referral-party/route.ts"), /export function nextParty/);
  assert.doesNotMatch(source("app/api/messaging/route.ts"), /export const MESSAGING_BIBLE_KEY/);
  assert.doesNotMatch(source("app/api/morning-briefs/tasks/route.ts"), /export function deterministicTaskId/);
  assert.doesNotMatch(source("app/calls/page.tsx"), /export function needsAction/);
});
