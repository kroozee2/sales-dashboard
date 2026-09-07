import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/content/actuals-lock/route.ts", import.meta.url), "utf8");
const settingsRoute = readFileSync(new URL("../app/api/settings/route.ts", import.meta.url), "utf8");
const settingsPolicy = readFileSync(new URL("../lib/settings-policy.ts", import.meta.url), "utf8");

test("content actuals lock uses a reserved settings key and compare-and-set update", () => {
  assert.match(route, /CONTENT_ACTUALS_SYNC_LOCK/);
  assert.match(route, /leaseTransition/);
  assert.match(route, /\.eq\("value", currentValue\)/);
  assert.match(route, /status: transition\.status/);
  assert.match(settingsRoute, /MANAGEABLE_SETTINGS_KEY_SET/);
  assert.doesNotMatch(settingsPolicy, /CONTENT_ACTUALS_SYNC_LOCK/);
});
