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

test("collapse state is restored after mount, not read during render", () => {
  // The server and the first client render must agree, so the stored state is
  // applied in a deferred read afterwards. Reading it during render would mean
  // a hydration mismatch on every collapsed section.
  assert.doesNotMatch(sidebar, /useSyncExternalStore/);
  assert.match(sidebar, /useState<SectionState>\(\(\) => Object\.fromEntries/);
  assert.match(sidebar, /Promise\.resolve\(\)\.then/);
  assert.match(sidebar, /try \{ raw = window\.localStorage[\s\S]*\} catch/);
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

// ---------------------------------------------------------------------------
// Section memory
// ---------------------------------------------------------------------------

const { parseSectionState, serializeSectionState, toggleSectionState } = await import("../lib/sidebar-sections.ts");
const NAMES = ["Command", "Leads", "Offers", "Team"];

test("with nothing stored, every section is open", () => {
  assert.deepEqual(parseSectionState(null, NAMES), { Command: true, Leads: true, Offers: true, Team: true });
  assert.deepEqual(parseSectionState("", NAMES), { Command: true, Leads: true, Offers: true, Team: true });
});

test("a collapsed section is restored, and only collapsed ones are stored", () => {
  const state = toggleSectionState(parseSectionState(null, NAMES), "Leads");
  assert.equal(state.Leads, false);
  const raw = serializeSectionState(state);
  assert.deepEqual(JSON.parse(raw), { Leads: false }, "storing only the exceptions keeps this forward-compatible");
  assert.deepEqual(parseSectionState(raw, NAMES), { Command: true, Leads: false, Offers: true, Team: true });
});

test("a section added since the last save stays open", () => {
  const raw = JSON.stringify({ Leads: false });
  const state = parseSectionState(raw, [...NAMES, "Brand New"]);
  assert.equal(state["Brand New"], true, "a new section must not inherit a collapsed state it never had");
  assert.equal(state.Leads, false);
});

test("a section removed since the last save is simply ignored", () => {
  const raw = JSON.stringify({ Vault: false, Leads: false });
  assert.deepEqual(Object.keys(parseSectionState(raw, NAMES)).sort(), [...NAMES].sort());
});

test("unparseable storage means all open, never a broken sidebar", () => {
  assert.deepEqual(parseSectionState("{not json", NAMES), { Command: true, Leads: true, Offers: true, Team: true });
  assert.deepEqual(parseSectionState("[1,2,3]", NAMES), { Command: true, Leads: true, Offers: true, Team: true });
  assert.deepEqual(parseSectionState("null", NAMES), { Command: true, Leads: true, Offers: true, Team: true });
});

test("toggling twice returns to where it started", () => {
  const start = parseSectionState(null, NAMES);
  assert.deepEqual(toggleSectionState(toggleSectionState(start, "Offers"), "Offers"), start);
});

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

test("the badge only rides on destinations where a number means act now", () => {
  assert.match(navLine("/follow-ups"), /badge: "followUps"/);
  assert.match(navLine("/applications"), /badge: "applications"/);
  assert.match(navLine("/hot-leads"), /badge: "hotLeads"/);
});

test("a badge never renders a zero", () => {
  assert.match(sidebar, /if \(!value\) return null;/);
});

test("a failed count is silent, never an error in the nav", () => {
  assert.match(sidebar, /\.catch\(\(\) => undefined\)/);
});

test("nav counts stay cheap and fail soft", () => {
  const route = readFileSync(new URL("../app/api/nav-counts/route.ts", import.meta.url), "utf8");
  assert.match(route, /Promise\.allSettled/, "one failing count cannot take the others down");
  assert.match(route, /head: true/, "counts are head-only");
  assert.match(route, /Cache-Control/);
  assert.doesNotMatch(route, /status: 500/, "a missing badge must not surface as an error");
});

test("the recording gap is counted, since nothing said Fathom had stopped", () => {
  const route = readFileSync(new URL("../app/api/nav-counts/route.ts", import.meta.url), "utf8");
  assert.match(route, /callsMissingRecording/);
  assert.match(route, /no show/i, "a no-show was never going to have a recording");
});
