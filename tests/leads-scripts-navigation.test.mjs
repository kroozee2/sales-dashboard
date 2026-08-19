import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const subTabs = readFileSync(new URL("../components/sub-tabs.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
const scriptsPage = readFileSync(new URL("../app/scripts/page.tsx", import.meta.url), "utf8");

function groupSource(name, nextName) {
  const pattern = new RegExp(`${name}: \\[([\\s\\S]*?)\\n  \\],\\n  ${nextName}:`);
  const match = subTabs.match(pattern);
  assert.ok(match, `expected ${name} sub-tab group before ${nextName}`);
  return match[1];
}

test("Scripts is a Leads sub-tab instead of a Resources sub-tab", () => {
  const leads = groupSource("leads", "tasks");
  const resources = subTabs.match(/resources: \[([\s\S]*?)\n  \],\n};/)?.[1] ?? "";

  assert.match(leads, /href: "\/scripts", label: "Scripts"/);
  assert.doesNotMatch(resources, /href: "\/scripts"/);
  assert.match(scriptsPage, /<SubTabs group="leads" \/>/);
});

test("the sidebar keeps Scripts highlighted under Leads, not Resources", () => {
  const leadsItem = sidebar.match(/\{ href: "\/leads"[^\n]+\}/)?.[0] ?? "";
  const resourcesItem = sidebar.match(/\{ href: "\/resources"[^\n]+\}/)?.[0] ?? "";

  assert.match(leadsItem, /"\/scripts"/);
  assert.doesNotMatch(resourcesItem, /"\/scripts"/);
});
