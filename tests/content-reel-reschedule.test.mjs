import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/content/page.tsx", import.meta.url), "utf8");

test("shared Content reschedules Reel-board items through the CAS-protected endpoint", () => {
  assert.match(source, /updated_at: string/);
  assert.match(source, /meta\?\.reel_workflow === "idea_board"/);
  assert.match(source, /expected_updated_at: current\.updated_at/);
  assert.match(source, /\/api\/instagram\/reel-ideas/);
});
