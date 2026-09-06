import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/content/page.tsx", import.meta.url), "utf8");

test("calendar item drawer renders direct links for every published source", () => {
  assert.match(page, /publishedSourcesOf\(local\.meta\)/);
  assert.match(page, /Published links/);
  assert.match(page, /source\.url/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noreferrer"/);
});
