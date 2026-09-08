import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");

function navLine(href) {
  return sidebar.match(new RegExp(`\\{ href: "${href.replace(/[?]/g, "\\?")}"[^\\n]+\\}`))?.[0] ?? "";
}

const sections = sidebar.match(/const SECTIONS = \[([^\]]+)\]/)?.[1] ?? "";

// ---------------------------------------------------------------------------
// The bottom of the sidebar: Offers and Team, replacing Backend and Vault
// ---------------------------------------------------------------------------

test("Offers holds Offer Lab and Messaging", () => {
  assert.match(navLine("/offer-lab"), /label: "Offer Lab"[\s\S]*section: "Offers"/);
  assert.match(navLine("/messaging"), /label: "Messaging"[\s\S]*section: "Offers"/);
});

test("Team holds Team, Playbook and Resources", () => {
  assert.match(navLine("/team"), /label: "Team"[\s\S]*section: "Team"/);
  assert.match(navLine("/playbook"), /label: "Playbook"[\s\S]*section: "Team"/);
  assert.match(navLine("/resources"), /label: "Resources"[\s\S]*section: "Team"/);
});

test("Backend and Vault are gone, with nothing stranded in them", () => {
  assert.doesNotMatch(sections, /"Backend"|"Vault"/);
  assert.doesNotMatch(sidebar, /section: "Backend"/);
  assert.doesNotMatch(sidebar, /section: "Vault"/);
});

test("every item's section is one the sidebar actually renders", () => {
  const declared = new Set([...sections.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...sidebar.matchAll(/section: "([^"]+)"/g)].map((m) => m[1]));
  const orphaned = [...used].filter((name) => !declared.has(name));
  assert.deepEqual(orphaned, [], "an item in an undeclared section would silently vanish from the sidebar");
});

test("Offers and Team sit at the bottom, after the working sections", () => {
  const order = [...sections.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(order.at(-2), "Offers");
  assert.equal(order.at(-1), "Team");
});

test("Install App stays reachable outside any section", () => {
  assert.match(navLine("/install"), /label: "Install App"/);
  assert.doesNotMatch(navLine("/install"), /section:/);
});

// ---------------------------------------------------------------------------
// A 48-item sidebar has to be collapsible, and stay how you left it
// ---------------------------------------------------------------------------

test("the sidebar keeps its state in plain React, with nothing that can stall hydration", () => {
  // An earlier attempt read the collapse state through useSyncExternalStore so
  // it would survive navigation. It froze the renderer and left the whole
  // sidebar unhydrated and unclickable. Simple local state is worth more than
  // remembered scroll position.
  assert.doesNotMatch(sidebar, /useSyncExternalStore/);
  assert.match(sidebar, /useState<Record<string, boolean>>/);
});

test("a section that is open is not clipped by a fixed height", () => {
  // Leads already carries ten items; a fixed max-height silently cut off the
  // rest the moment a section outgrew it.
  assert.doesNotMatch(sidebar, /max-h-\[500px\]/);
});

test("the section toggle reports its state to assistive tech", () => {
  assert.match(sidebar, /aria-expanded=\{isExpanded\}/);
  assert.match(sidebar, /aria-controls=/);
});

test("section toggles stay large enough to hit on a phone", () => {
  const toggle = sidebar.match(/<button[^>]*onClick=\{\(\) => toggleSection[\s\S]*?>/)?.[0] ?? "";
  assert.match(toggle, /min-h-11/);
});
