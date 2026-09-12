import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { MANAGEABLE_SETTINGS_KEY_SET } from "../lib/settings-policy.ts";

test("Presentations has owner-only bounded CAS storage and cannot be overwritten through generic settings", () => {
  const route = readFileSync(new URL("../app/api/presentations/route.ts", import.meta.url), "utf8");
  assert.match(route, /identitySigningConfiguredWithSettings/);
  assert.match(route, /currentMember\(req\.cookies\.get\("sos_user"\)\?\.value\)/);
  assert.equal((route.match(/await requireOwner\(req\)/g) ?? []).length, 2);
  assert.match(route, /readBoundedPresentationsBody/);
  assert.match(route, /parseJsonWithUniqueKeys/);
  assert.match(route, /updatePresentationsDocument\(current, input/);
  assert.match(route, /\.eq\("updated_at", stored\.updated_at\)/);
  assert.match(route, /\.is\("updated_at", null\)/);
  assert.equal((route.match(/\.select\("updated_at"\)/g) ?? []).length, 2);
  assert.match(route, /row_updated_at: persistedRowUpdatedAt/);
  assert.match(route, /status: 409/);
  assert.equal(MANAGEABLE_SETTINGS_KEY_SET.has("PRESENTATIONS_V1"), false);
});

test("only the stable audience route and its sanitized API bypass the app-wide session proxy", () => {
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /pathname\.startsWith\("\/present\/"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/api\/presentations\/deployed\/"\)/);
  assert.doesNotMatch(proxy, /PUBLIC_PATHS[^;]+\/api\/presentations["']/s);
});

test("Presentations routes are real App Router destinations", () => {
  const root = new URL("..", import.meta.url);
  for (const path of [
    "app/api/presentations/route.ts",
    "app/api/presentations/deployed/[slug]/route.ts",
    "app/present/[slug]/page.tsx",
  ]) assert.equal(existsSync(new URL(path, root)), true, `${path} exists`);
});
