import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createAgentWorkforceDocument, parseAgentWorkforceDocument, SKILL_DEPLOYMENT_STATES, updateAgentWorkforceDocument } from "../lib/agent-workforce.ts";
import { DEFAULT_AGENT_WORKFORCE } from "../lib/agent-workforce-default.ts";
import { filterAndSortSkills, skillUsageSortAvailable, skillConnectionLabels } from "../lib/agent-skills-view.ts";

const coreAgent = (overrides = {}) => ({
  id: "forge-systems-director",
  type: "core",
  parent_id: null,
  name: "Forge",
  emoji: "⬡",
  role: "Build & Systems Director",
  department: "Build & Systems",
  mission: "Build and verify production systems.",
  personality: "Precise and evidence-driven.",
  status: "testing",
  progress: 70,
  autonomy: "internal",
  cadence: "On demand",
  schedule: "Continuous",
  triggers: [],
  responsibilities: [],
  capabilities: ["Product delivery"],
  inputs: ["Build queue"],
  outputs: ["Verified releases"],
  next_milestone: "Connect runtime telemetry",
  notes: "",
  ...overrides,
});

const skill = (overrides = {}) => ({
  id: "requesting-code-review",
  name: "Requesting Code Review",
  purpose: "Run security, logic, and regression checks before a change is committed.",
  category: "Software development",
  tags: ["review", "security", "quality"],
  agent_ids: ["forge-systems-director"],
  deployment_state: "configured",
  source_url: "https://github.com/NousResearch/hermes-agent/blob/main/skills/software-development/requesting-code-review/SKILL.md",
  quality_rating: null,
  review_count: 0,
  ...overrides,
});

test("workforce documents include bounded skill definitions without inventing runtime usage", () => {
  const document = createAgentWorkforceDocument(
    { agents: [coreAgent()], skills: [skill()] },
    "2026-09-11T12:00:00.000Z",
  );

  assert.equal(document.version, 2);
  assert.equal(document.skills.length, 1);
  assert.equal(document.skills[0].id, "requesting-code-review");
  assert.equal(document.skills[0].usage, null);
});


test("skill definitions fail closed on unknown fields, bounds, URLs, duplicates, and unknown agent references", () => {
  const make = (...skills) => ({ agents: [coreAgent()], skills });
  assert.throws(() => createAgentWorkforceDocument(make(skill({ surprise: true }))), /unknown field/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ purpose: "x".repeat(601) }))), /purpose/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`) }))), /tags/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ quality_rating: 5.1 }))), /quality/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ review_count: 10001 }))), /review/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ source_url: "javascript:alert(1)" }))), /http|url/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ source_url: "https://example.com/skill" }))), /github/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ agent_ids: ["missing-agent"] }))), /unknown agent/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill(), skill())), /duplicate skill/i);
});


test("version 1 documents migrate non-destructively and skill updates preserve server-owned usage telemetry", () => {
  const at = "2026-09-11T12:00:00.000Z";
  const legacy = {
    version: 1,
    agents: [{ ...coreAgent(), created_at: at, updated_at: at }],
    revision: at,
    updated_at: at,
  };
  const migrated = parseAgentWorkforceDocument(JSON.stringify(legacy), [skill()]);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.agents[0].name, "Forge");
  assert.equal(migrated.skills[0].id, "requesting-code-review");

  const withUsage = {
    ...migrated,
    skills: [{
      ...migrated.skills[0],
      usage: { count: 42, last_used_at: "2026-09-11T12:30:00.000Z", source: "hermes" },
    }],
  };
  const parsed = parseAgentWorkforceDocument(JSON.stringify(withUsage));
  const updated = updateAgentWorkforceDocument(parsed, {
    agents: [coreAgent()],
    skills: [skill({ quality_rating: 4.5, review_count: 2 })],
    expected_revision: parsed.revision,
  }, "2026-09-11T13:00:00.000Z");
  assert.deepEqual(updated.skills[0].usage, withUsage.skills[0].usage);
  assert.equal(updated.skills[0].quality_rating, 4.5);
  assert.throws(() => updateAgentWorkforceDocument(parsed, {
    agents: [coreAgent()], skills: [], expected_revision: parsed.revision,
  }), /skill deletion is not supported/i);
});


test("the default catalog connects shareable official skills to the existing workforce hierarchy", () => {
  assert.equal(DEFAULT_AGENT_WORKFORCE.skills.length, 6);
  const agentIds = new Set(DEFAULT_AGENT_WORKFORCE.agents.map((agent) => agent.id));
  for (const item of DEFAULT_AGENT_WORKFORCE.skills) {
    assert.equal(new URL(item.source_url).hostname, "github.com");
    assert.ok(item.agent_ids.length > 0);
    assert.ok(item.agent_ids.every((id) => id === "jarvis" || agentIds.has(id)));
    assert.equal(item.usage, null);
    assert.equal(item.quality_rating, null);
    assert.equal(item.review_count, 0);
  }
});


test("the dedicated workforce route migrates legacy rows and existing agent saves preserve skills", () => {
  const route = readFileSync(new URL("../app/api/agent-workforce/route.ts", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../components/agent-workforce-dashboard.tsx", import.meta.url), "utf8");
  assert.match(route, /DEFAULT_AGENT_SKILLS/);
  assert.ok((route.match(/parseAgentWorkforceDocument\(String\([^)]*\), DEFAULT_AGENT_SKILLS\)/g) ?? []).length >= 2);
  assert.match(dashboard, /skills: document\.skills\.map\(toSkillInput\)/);
});


test("skill catalog filtering and sorting stay deterministic and disable unsupported popularity", () => {
  const skills = [
    { ...DEFAULT_AGENT_WORKFORCE.skills[0], name: "Zulu", category: "Research", quality_rating: null },
    { ...DEFAULT_AGENT_WORKFORCE.skills[1], name: "Alpha", category: "Productivity", quality_rating: 4.8, review_count: 3 },
  ];
  assert.deepEqual(filterAndSortSkills(skills, { query: "alpha", category: "all", deploymentState: "all", agentId: "all", sort: "name" }).map((item) => item.name), ["Alpha"]);
  assert.deepEqual(filterAndSortSkills(skills, { query: "", category: "Research", deploymentState: "configured", agentId: "scout-research", sort: "name" }).map((item) => item.name), ["Zulu"]);
  assert.deepEqual(filterAndSortSkills(skills, { query: "", category: "all", deploymentState: "all", agentId: "all", sort: "rating" }).map((item) => item.name), ["Alpha", "Zulu"]);
  assert.equal(skillUsageSortAvailable(skills), false);
  const withUsage = skills.map((item, index) => ({ ...item, usage: { count: index + 1, last_used_at: "2026-09-11T12:00:00.000Z", source: "hermes" } }));
  assert.equal(skillUsageSortAvailable(withUsage), true);
  assert.deepEqual(filterAndSortSkills(withUsage, { query: "", category: "all", deploymentState: "all", agentId: "all", sort: "usage" }).map((item) => item.name), ["Alpha", "Zulu"]);
});

test("skill connections expose Jarvis, core, and parent-child hierarchy context", () => {
  const labels = skillConnectionLabels({ ...DEFAULT_AGENT_WORKFORCE.skills[0], agent_ids: ["jarvis", "scout-research"] }, DEFAULT_AGENT_WORKFORCE.agents);
  assert.deepEqual(labels, ["Jarvis", "Maya › Scout"]);
});


test("the catalog supports retired skills and rejects duplicate connections and disguised GitHub origins", () => {
  assert.ok(SKILL_DEPLOYMENT_STATES.includes("retired"));
  assert.doesNotThrow(() => createAgentWorkforceDocument({
    agents: [coreAgent()],
    skills: [skill({ deployment_state: "retired" })],
  }));
  assert.throws(() => createAgentWorkforceDocument({
    agents: [coreAgent()],
    skills: [skill({ agent_ids: ["forge-systems-director", "forge-systems-director"] })],
  }), /duplicate references/i);
  assert.throws(() => createAgentWorkforceDocument({
    agents: [coreAgent()],
    skills: [skill({ source_url: "https://github.com:444/NousResearch/hermes-agent" })],
  }), /GitHub/i);
});

test("the AI workforce exposes a first-class skills view with truthful evidence, filters, sharing, and a detail drawer", () => {
  const dashboard = readFileSync(new URL("../components/agent-workforce-dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /Skills library/);
  assert.match(dashboard, /Search skills/);
  assert.match(dashboard, /Filter skills by deployment state/);
  assert.match(dashboard, /Filter skills by connected agent/);
  assert.match(dashboard, /Sort skills/);
  assert.match(dashboard, /Most used \(activity not connected\)/);
  assert.match(dashboard, /Activity not connected/);
  assert.match(dashboard, /Internal quality rating/);
  assert.match(dashboard, /navigator\.clipboard\.writeText\(skill\.source_url\)/);
  assert.match(dashboard, /target="_blank" rel="noreferrer"/);
  assert.match(dashboard, /aria-labelledby="skill-detail-title"/);
  assert.match(dashboard, /skillConnectionLabels/);
  assert.match(dashboard, /filterAndSortSkills/);
});
