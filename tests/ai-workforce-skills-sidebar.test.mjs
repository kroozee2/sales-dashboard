import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");

function readNavItems() {
  return sidebar.split("\n").filter((line) => line.trimStart().startsWith("{ href:")).map((line) => ({
    href: line.match(/href: "([^"]+)"/)?.[1],
    label: line.match(/label: "([^"]+)"/)?.[1],
    section: line.match(/section: "([^"]+)"/)?.[1],
    tab: line.match(/tab: "([^"]+)"/)?.[1],
    tabDefault: /tabDefault: true/.test(line),
  }));
}

function activeItem(items, pathname, activeTab) {
  return items.filter((item) => {
    const hrefPath = item.href.split("?")[0];
    const onPath = pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
    if (onPath && item.tab) {
      const siblings = items.filter((candidate) => candidate.href.split("?")[0] === hrefPath && candidate.tab);
      if (activeTab && siblings.some((candidate) => candidate.tab === activeTab)) return item.tab === activeTab;
      return item.tabDefault;
    }
    return onPath;
  });
}

test("AI Workforce sidebar routes directly to Skills and selects only Skills for its query tab", () => {
  const items = readNavItems();
  const workforceItems = items.filter((item) => item.section === "AI Workforce");
  const skills = workforceItems.find((item) => item.label === "Skills");

  assert.equal(skills?.href, "/jarvis?tab=skills");
  assert.equal(skills?.tab, "skills");
  assert.deepEqual(activeItem(workforceItems, "/jarvis", "skills").map((item) => item.label), ["Skills"]);
});
