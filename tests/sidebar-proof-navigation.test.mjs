import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

function navLine(href) {
  return sidebar.split("\n").find((line) => line.includes(`href: "${href}"`)) ?? "";
}

test("restores the six-section SalesOS sidebar and keeps Proof in Marketing", () => {
  assert.match(sidebar, /const sections = \["Command", "Sales", "Marketing", "Clients", "Backend", "Vault"\]/);

  assert.match(navLine("/home"), /label: "Dashboard"[\s\S]*section: "Command"/);
  assert.match(navLine("/projects"), /section: "Command"/);
  assert.match(navLine("/tasks"), /label: "Tasks"[\s\S]*match: \["\/winning-formula"\][\s\S]*section: "Command"/);
  assert.doesNotMatch(navLine("/tasks"), /"\/projects"/);

  assert.match(navLine("/content?tab=dashboard"), /section: "Marketing"/);
  assert.match(navLine("/content"), /label: "Calendar"[\s\S]*section: "Marketing"/);
  assert.match(navLine("/instagram"), /label: "Instagram"[\s\S]*section: "Marketing"/);
  assert.match(navLine("/youtube"), /label: "YouTube"[\s\S]*section: "Marketing"/);
  assert.match(navLine("/content?tab=proof"), /label: "Proof"[\s\S]*emoji: "🏆"[\s\S]*contentTab: "proof"[\s\S]*section: "Marketing"/);

  const instagram = sidebar.indexOf('{ href: "/instagram"');
  const youtube = sidebar.indexOf('{ href: "/youtube"');
  const proof = sidebar.indexOf('{ href: "/content?tab=proof"');
  assert.ok(instagram >= 0 && instagram < youtube && youtube < proof, "Marketing sub-pages should retain their prior visual order with Proof last");

  assert.match(navLine("/clients/dashboard"), /section: "Clients"/);
  assert.match(navLine("/clients/members"), /section: "Clients"/);
  assert.match(navLine("/clients/calendar"), /section: "Clients"/);
  assert.match(navLine("/jarvis"), /section: "Backend"/);
  assert.match(navLine("/messaging"), /section: "Vault"/);
});

test("Proof has its own active state without stealing Calendar's other content tabs", () => {
  assert.match(sidebar, /n\.contentTab === "proof"[\s\S]*contentTab === "proof"/);
  assert.match(sidebar, /n\.contentTab === "calendar"[\s\S]*contentTab !== "dashboard"[\s\S]*contentTab !== "proof"/);
});


test("the query-aware sidebar remains inside a Suspense boundary", () => {
  assert.match(layout, /import \{ Suspense \} from "react"/);
  assert.match(layout, /<Suspense fallback=\{null\}>\s*<Sidebar \/>\s*<\/Suspense>/);
});


test("every visible sidebar destination is backed by a real App Router page", () => {
  const hrefs = [...sidebar.matchAll(/href: "([^"?#]+)(?:[?#][^"]*)?"/g)].map((match) => match[1]);
  const uniquePaths = [...new Set(hrefs)];
  const missing = uniquePaths.filter((pathname) => {
    const relative = pathname === "/" ? "../app/page.tsx" : `../app${pathname}/page.tsx`;
    return !existsSync(new URL(relative, import.meta.url));
  });
  assert.deepEqual(missing, [], `missing page implementations for: ${missing.join(", ")}`);
});
