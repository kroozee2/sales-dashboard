import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Leads pipeline places Two-Step Engagement directly below Hot Prospect", () => {
  const source = read("app/leads/page.tsx");
  assert.match(
    source,
    /'🔥 Hot Prospect',\s*'💬 Two-Step Engagement',\s*'📞 Call Booked'/,
  );
  assert.match(source, /'💬 Two-Step Engagement': 'bg-cyan-500\/20 text-cyan-300 border border-cyan-500\/30'/);
  assert.match(source, /return STAGE_ORDER\.map\(\(s\) => \(\{ stage: s, count: counts\[s\] \?\? 0 \}\)\)/);
});

test("New Leads stage picker exposes Two-Step Engagement", () => {
  const source = read("components/optin-feed.tsx");
  assert.match(source, /"🔥 Hot Prospect",\s*"💬 Two-Step Engagement",\s*"📞 Call Booked"/);
});

test("Today queue recognizes Two-Step Engagement without dropping Reached Out contact history", () => {
  const source = read("app/api/today/route.ts");
  assert.match(source, /"💬 Two-Step Engagement": 2/);
  assert.match(source, /STAGE_PRIORITY\[l\.prospect_stage \?\? ""\] \?\? 9\) <= 4/);
  assert.match(source, /MESSAGE_STAGES = \[[^\]]*"💬 Two-Step Engagement"/s);
});

test("AI assistant recognizes Two-Step Engagement as a real pipeline stage", () => {
  const source = read("app/api/ai-assistant/route.ts");
  assert.match(source, /Pipeline stages:[^\n]*🔥 Hot Prospect, 💬 Two-Step Engagement, 🔗 Pay Link Sent/);
});

test("Opt-in lead updates accept the Two-Step Engagement stage", () => {
  const source = read("app/api/leads/optins/[id]/route.ts");
  assert.match(source, /"💬 Two-Step Engagement"/);
});

test("active stage consumers no longer expose the old Two-Step Response label", () => {
  const activeSources = [
    "app/leads/page.tsx",
    "app/home/page.tsx",
    "app/api/today/route.ts",
    "app/api/leads/optins/[id]/route.ts",
    "app/api/ai-assistant/route.ts",
    "components/optin-feed.tsx",
    "lib/sales-call-leads.ts",
  ].map(read).join("\n");
  assert.doesNotMatch(activeSources, /💬 Two-Step Response/);
});
