import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
const subTabs = readFileSync(new URL("../components/sub-tabs.tsx", import.meta.url), "utf8");
const projectsPage = readFileSync(new URL("../app/projects/page.tsx", import.meta.url), "utf8");
const contentPage = readFileSync(new URL("../app/content/page.tsx", import.meta.url), "utf8");

function navLine(href) {
  return sidebar.match(new RegExp(`\\{ href: "${href}"[^\\n]+\\}`))?.[0] ?? "";
}

function tabsBlock() {
  const match = contentPage.match(/const TABS = \[([\s\S]*?)\n\] as const;/);
  assert.ok(match, "expected Content TABS configuration");
  return match[1];
}

test("Projects sits below Goals and Tasks fronts only Tasks and Winning Formula", () => {
  assert.match(navLine("/projects"), /label: "Projects"[\s\S]*section: "Command"/);
  assert.match(navLine("/tasks"), /label: "Tasks"[\s\S]*match: \["\/winning-formula"\][\s\S]*section: "Command"/);
  assert.doesNotMatch(navLine("/tasks"), /"\/projects"/);
  assert.doesNotMatch(sidebar, /label: "Execution"/);

  const goals = sidebar.indexOf('{ href: "/goals"');
  const projects = sidebar.indexOf('{ href: "/projects"');
  const tasks = sidebar.indexOf('{ href: "/tasks"');
  assert.ok(goals < projects && projects < tasks, "Command should order Goals, Projects, Tasks");

  const taskGroup = subTabs.match(/tasks: \[([\s\S]*?)\n  \],\n  resources:/)?.[1] ?? "";
  assert.match(taskGroup, /href: "\/tasks", label: "Tasks"/);
  assert.match(taskGroup, /href: "\/winning-formula", label: "Winning Formula"/);
  assert.doesNotMatch(taskGroup, /href: "\/projects"/);
  assert.doesNotMatch(projectsPage, /<SubTabs group="tasks" \/>/);
  assert.match(projectsPage, /<PersonSelect \/>/);
});

test("Marketing calls Content Calendar and puts Dashboard above Calendar", () => {
  assert.match(navLine("/content"), /label: "Calendar"[\s\S]*section: "Marketing"/);

  const tabs = tabsBlock();
  const dashboard = tabs.indexOf('key: "dashboard"');
  const calendar = tabs.indexOf('key: "calendar"');
  assert.ok(dashboard >= 0 && dashboard < calendar, "Dashboard should be immediately above Calendar");
  assert.doesNotMatch(tabs, /key: "posted"/);
  assert.match(contentPage, /useState<string>\("dashboard"\)/);
});

test("Dashboard contains both posted analytics and the full posted workspace", () => {
  assert.match(contentPage, /tab === "dashboard"[\s\S]*<DashboardTab[\s\S]*<PostedTab posted=\{posted\} onChanged=\{loadPosted\}/);
  assert.doesNotMatch(contentPage, /tab === "posted"/);
  assert.match(contentPage, /id="posted-content"/);
});
