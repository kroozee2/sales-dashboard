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
  behavior: "",
  category: "Software development",
  tags: ["review", "security", "quality"],
  capabilities: [],
  inputs: [],
  outputs: [],
  documentation: "",
  provenance: "owner_configured",
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


test("omitted skills remain backward compatible while explicit null is rejected", () => {
  const legacyClientDocument = createAgentWorkforceDocument({ agents: [coreAgent()] });
  assert.deepEqual(legacyClientDocument.skills, []);
  assert.throws(
    () => createAgentWorkforceDocument({ agents: [coreAgent()], skills: null }),
    /skills must be an array/i,
  );
});


test("skill definitions include bounded behavior, capabilities, inputs, outputs, documentation, and provenance", () => {
  const definition = createAgentWorkforceDocument({
    agents: [coreAgent()],
    skills: [skill({
      behavior: "Review the candidate diff and fail closed on blocking findings.",
      capabilities: ["Security review", "Regression review"],
      inputs: ["Immutable candidate diff"],
      outputs: ["Evidence-backed verdict"],
      documentation: "Use before every release.\nDo not treat configuration as runtime evidence.",
      provenance: "owner_configured",
    })],
  }).skills[0];
  assert.equal(definition.behavior, "Review the candidate diff and fail closed on blocking findings.");
  assert.deepEqual(definition.capabilities, ["Security review", "Regression review"]);
  assert.deepEqual(definition.inputs, ["Immutable candidate diff"]);
  assert.deepEqual(definition.outputs, ["Evidence-backed verdict"]);
  assert.match(definition.documentation, /before every release/);
  assert.equal(definition.provenance, "owner_configured");
  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent()], skills: [skill({ behavior: "x".repeat(1201) })] }), /behavior/i);
  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent()], skills: [skill({ documentation: "x".repeat(4001) })] }), /documentation/i);
});


test("skill definitions fail closed on unknown fields, bounds, URLs, duplicates, and unknown agent references", () => {
  const make = (...skills) => ({ agents: [coreAgent()], skills });
  assert.throws(() => createAgentWorkforceDocument(make(skill({ surprise: true }))), /unknown field/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ purpose: "x".repeat(601) }))), /purpose/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`) }))), /tags/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ quality_rating: 5.1 }))), /quality/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ review_count: 10001 }))), /review/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ source_url: "javascript:alert(1)" }))), /https|url/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ source_url: "http://github.com/NousResearch/hermes-agent" }))), /https|github/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ source_url: "https://www.github.com/NousResearch/hermes-agent" }))), /canonical|github/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ source_url: "https://user@github.com/NousResearch/hermes-agent" }))), /canonical|github/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ source_url: "https://example.com/skill" }))), /github/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill({ agent_ids: ["missing-agent"] }))), /unknown agent/i);
  assert.throws(() => createAgentWorkforceDocument(make(skill(), skill())), /duplicate skill/i);
});


test("GitHub skill sources require an exact canonical file path and are never silently normalized", () => {
  const canonical = "https://github.com/NousResearch/hermes-agent/blob/main/skills/research/grounded-citations/SKILL.md";
  const make = (source_url) => ({ agents: [coreAgent()], skills: [skill({ source_url })] });
  const invalid = [
    ` ${canonical}`,
    `${canonical} `,
    canonical.replace("SKILL.md", "SKILL\u007f.md"),
    canonical.replace("SKILL.md", "SKILL\u0085.md"),
    "https://github.com/NousResearch\\hermes-agent/blob/main/SKILL.md",
    "https://github.com/NousResearch/hermes-agent/../other/blob/main/SKILL.md",
    "https://github.com/NousResearch/hermes-agent/%2e%2e/other/blob/main/SKILL.md",
    "https://github.com/NousResearch//hermes-agent/blob/main/SKILL.md",
    `${canonical}?plain=1`,
    `${canonical}#readme`,
    "https://github.com/",
    "https://github.com/NousResearch/hermes-agent",
    "https://user:password@github.com/NousResearch/hermes-agent/blob/main/SKILL.md",
    "https://github.com:443/NousResearch/hermes-agent/blob/main/SKILL.md",
    "http://github.com/NousResearch/hermes-agent/blob/main/SKILL.md",
    "https://www.github.com/NousResearch/hermes-agent/blob/main/SKILL.md",
  ];

  for (const sourceUrl of invalid) {
    assert.throws(() => createAgentWorkforceDocument(make(sourceUrl)), /source_url|canonical|GitHub/i, sourceUrl);
  }

  const stored = createAgentWorkforceDocument(make(canonical)).skills[0].source_url;
  assert.equal(stored, canonical);
});


test("older version 2 skill records migrate missing definition fields without inventing details", () => {
  const at = "2026-09-11T12:00:00.000Z";
  const { behavior, capabilities, inputs, outputs, documentation, provenance, ...oldSkill } = skill();
  void behavior; void capabilities; void inputs; void outputs; void documentation; void provenance;
  const parsed = parseAgentWorkforceDocument(JSON.stringify({
    version: 2,
    agents: [{ ...coreAgent(), created_at: at, updated_at: at }],
    skills: [{ ...oldSkill, usage: null, created_at: at, updated_at: at }],
    revision: at,
    updated_at: at,
  }));
  assert.equal(parsed.skills[0].provenance, "legacy_unverified");
  assert.equal(parsed.skills[0].behavior, "");
  assert.deepEqual(parsed.skills[0].capabilities, []);
  assert.deepEqual(parsed.skills[0].inputs, []);
  assert.deepEqual(parsed.skills[0].outputs, []);
  assert.equal(parsed.skills[0].documentation, "");
});


test("skill ratings and review counts must describe one coherent evidence state", () => {
  assert.throws(
    () => createAgentWorkforceDocument({ agents: [coreAgent()], skills: [skill({ quality_rating: 4.5, review_count: 0 })] }),
    /rating.*review|review.*rating/i,
  );
  assert.throws(
    () => createAgentWorkforceDocument({ agents: [coreAgent()], skills: [skill({ quality_rating: null, review_count: 3 })] }),
    /rating.*review|review.*rating/i,
  );
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


test("the default catalog is a truthful starter recommendation set, not configured assignments", () => {
  assert.equal(DEFAULT_AGENT_WORKFORCE.skills.length, 6);
  for (const item of DEFAULT_AGENT_WORKFORCE.skills) {
    assert.equal(new URL(item.source_url).hostname, "github.com");
    assert.deepEqual(item.agent_ids, []);
    assert.equal(item.deployment_state, "draft");
    assert.equal(item.provenance, "starter_recommendation");
    assert.ok(item.behavior.length > 0);
    assert.ok(item.capabilities.length > 0);
    assert.ok(item.inputs.length > 0);
    assert.ok(item.outputs.length > 0);
    assert.ok(item.documentation.length > 0);
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
    { ...DEFAULT_AGENT_WORKFORCE.skills[0], name: "Zulu", category: "Research", quality_rating: null, deployment_state: "configured", provenance: "owner_configured", agent_ids: ["scout-research"] },
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
