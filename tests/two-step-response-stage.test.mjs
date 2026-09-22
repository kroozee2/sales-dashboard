import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Leads pipeline places Two-Step Response directly below Hot Prospect", () => {
  const source = read("app/leads/page.tsx");
  assert.match(
    source,
    /'🔥 Hot Prospect',\s*'💬 Two-Step Response',\s*'📞 Call Booked'/,
  );
  assert.match(source, /'💬 Two-Step Response': 'bg-cyan-500\/20 text-cyan-300 border border-cyan-500\/30'/);
  assert.match(source, /return STAGE_ORDER\.map\(\(s\) => \(\{ stage: s, count: counts\[s\] \?\? 0 \}\)\)/);
});

test("New Leads stage picker exposes Two-Step Response", () => {
  const source = read("components/optin-feed.tsx");
  assert.match(source, /"🔥 Hot Prospect",\s*"💬 Two-Step Response",\s*"📞 Call Booked"/);
});

test("Today queue recognizes Two-Step Response without dropping Reached Out contact history", () => {
  const source = read("app/api/today/route.ts");
  assert.match(source, /"💬 Two-Step Response": 2/);
  assert.match(source, /STAGE_PRIORITY\[l\.prospect_stage \?\? ""\] \?\? 9\) <= 4/);
  assert.match(source, /MESSAGE_STAGES = \[[^\]]*"💬 Two-Step Response"/s);
});

test("AI assistant recognizes Two-Step Response as a real pipeline stage", () => {
  const source = read("app/api/ai-assistant/route.ts");
  assert.match(source, /Pipeline stages:[^\n]*🔥 Hot Prospect, 💬 Two-Step Response, 🔗 Pay Link Sent/);
});

test("Opt-in lead updates accept the Two-Step Response stage", () => {
  const source = read("app/api/leads/optins/[id]/route.ts");
  assert.match(source, /"💬 Two-Step Response"/);
});
