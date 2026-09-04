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

test("Sales and Marketing are separate sidebar sections in the requested order", () => {
  assert.match(sidebar, /const sections = \["Command", "Sales", "Marketing", "Backend", "Vault"\]/);

  assert.match(navLine("/leads"), /label: "Leads"[\s\S]*section: "Sales"/);
  assert.match(navLine("/calls"), /label: "Sales Calls"[\s\S]*section: "Sales"/);
  assert.match(navLine("/revenue"), /label: "Revenue"[\s\S]*section: "Sales"/);

  assert.match(navLine("/content"), /label: "Content"[\s\S]*section: "Marketing"/);
  assert.match(navLine("/instagram"), /label: "Instagram"[\s\S]*section: "Marketing"/);

  const leads = sidebar.indexOf('{ href: "/leads"');
  const calls = sidebar.indexOf('{ href: "/calls"');
  const revenue = sidebar.indexOf('{ href: "/revenue"');
  const content = sidebar.indexOf('{ href: "/content"');
  const instagram = sidebar.indexOf('{ href: "/instagram"');
  assert.ok(leads < calls && calls < revenue, "Sales should be Leads, Sales Calls, Revenue");
  assert.ok(content < instagram, "Marketing should be Content, Instagram");
  assert.doesNotMatch(sidebar, /section: "Growth"/);
});
