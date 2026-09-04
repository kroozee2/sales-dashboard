import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");

function navLine(href) {
  return sidebar.match(new RegExp(`\\{ href: "${href}"[^\\n]+\\}`))?.[0] ?? "";
}

test("Jarvis belongs to Backend instead of Command", () => {
  assert.match(navLine("/jarvis"), /section: "Backend"/);
  assert.doesNotMatch(navLine("/jarvis"), /section: "Command"/);
});

test("Leads is the first item in Growth", () => {
  const leads = sidebar.indexOf('{ href: "/leads"');
  const content = sidebar.indexOf('{ href: "/content"');
  const instagram = sidebar.indexOf('{ href: "/instagram"');

  assert.ok(leads >= 0 && content >= 0 && instagram >= 0);
  assert.ok(leads < content, "Leads should appear before Content");
  assert.ok(leads < instagram, "Leads should appear before Instagram");
  assert.match(navLine("/leads"), /section: "Growth"/);
});