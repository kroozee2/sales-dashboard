import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createAgentWorkforceDocument,
  parseAgentWorkforceDocument,
  updateAgentWorkforceDocument,
} from "../lib/agent-workforce.ts";
import { DEFAULT_AGENT_WORKFORCE } from "../lib/agent-workforce-default.ts";
import {
  JARVIS_PROFILE,
  JARVIS_INTERNAL_WORKERS,
} from "../lib/agent-workforce-jarvis.ts";
import { parseAgentWorkforceDraft, serializeAgentWorkforceDraft } from "../lib/agent-workforce-draft.ts";
import { summarizeAgentWorkforce, filterWorkforceAgents } from "../lib/agent-workforce-view.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const core = (overrides = {}) => ({
  id: "maya-content-director",
  type: "core",
  parent_id: null,
  name: "Maya",
  emoji: "✦",
  role: "Content Director",
  department: "Content",
  mission: "Own the content engine.",
  personality: "Creative and strategic.",
  status: "building",
  progress: 35,
  autonomy: "internal",
  cadence: "Weekly",
  schedule: "Mon 6:00 AM PT",
  triggers: ["Weekly planning block"],
  responsibilities: ["Set the editorial plan"],
  capabilities: ["Strategy"],
  inputs: ["Sales calls"],
  outputs: ["Editorial plan"],
  next_milestone: "Connect the approval queue",
  notes: "",
  ...overrides,
});

const sub = (overrides = {}) => ({
  ...core(),
  id: "scout-research",
  type: "subagent",
  parent_id: "maya-content-director",
  name: "Scout",
  role: "Research Scout",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Schema: the fields the operating model requires
// ---------------------------------------------------------------------------

test("an agent definition carries responsibilities, triggers, notes, and server timestamps", () => {
  const now = "2026-09-08T10:00:00.000Z";
  const document = createAgentWorkforceDocument({ agents: [core()] }, now);
  const [agent] = document.agents;
  assert.deepEqual(agent.responsibilities, ["Set the editorial plan"]);
  assert.deepEqual(agent.triggers, ["Weekly planning block"]);
  assert.equal(agent.notes, "");
  assert.equal(agent.created_at, now);
  assert.equal(agent.updated_at, now);
});

test("notes are bounded, control characters rejected, and newlines preserved", () => {
  const withNotes = createAgentWorkforceDocument({ agents: [core({ notes: "Line one\nLine two" })] });
  assert.equal(withNotes.agents[0].notes, "Line one\nLine two");
  assert.throws(() => createAgentWorkforceDocument({ agents: [core({ notes: "bad\u0007bell" })] }), /notes/);
  assert.throws(() => createAgentWorkforceDocument({ agents: [core({ notes: "x".repeat(2_001) })] }), /notes/);
});

test("responsibilities and triggers reject duplicates and non-arrays", () => {
  assert.throws(() => createAgentWorkforceDocument({ agents: [core({ responsibilities: ["A", "a"] })] }), /duplicate/i);
  assert.throws(() => createAgentWorkforceDocument({ agents: [core({ triggers: "daily" })] }), /triggers must be an array/);
});

test("client input may not set timestamps and unknown fields are still rejected", () => {
  assert.throws(
    () => createAgentWorkforceDocument({ agents: [{ ...core(), created_at: "2020-01-01T00:00:00.000Z" }] }),
    /Unknown field/,
  );
  assert.throws(() => createAgentWorkforceDocument({ agents: [{ ...core(), sneaky: 1 }] }), /Unknown field/);
});

// ---------------------------------------------------------------------------
// Timestamps are server-owned
// ---------------------------------------------------------------------------

test("editing an agent advances only that agent's updated_at and preserves created_at", () => {
  const born = "2026-09-01T00:00:00.000Z";
  const current = createAgentWorkforceDocument({ agents: [core(), sub()] }, born);
  const next = updateAgentWorkforceDocument(
    current,
    { agents: [core({ progress: 60 }), sub()], expected_revision: current.revision },
    "2026-09-08T12:00:00.000Z",
  );
  const edited = next.agents.find((agent) => agent.id === "maya-content-director");
  const untouched = next.agents.find((agent) => agent.id === "scout-research");
  assert.equal(edited.created_at, born, "created_at is immutable");
  assert.equal(edited.updated_at, next.revision, "edited agent stamps updated_at");
  assert.equal(untouched.updated_at, born, "an unchanged agent keeps its timestamp");
});

test("a newly added agent is stamped created and updated at the new revision", () => {
  const current = createAgentWorkforceDocument({ agents: [core()] }, "2026-09-01T00:00:00.000Z");
  const next = updateAgentWorkforceDocument(
    current,
    { agents: [core(), sub()], expected_revision: current.revision },
    "2026-09-08T12:00:00.000Z",
  );
  const added = next.agents.find((agent) => agent.id === "scout-research");
  assert.equal(added.created_at, next.revision);
  assert.equal(added.updated_at, next.revision);
});

test("a client cannot forge timestamps through an update", () => {
  const current = createAgentWorkforceDocument({ agents: [core()] }, "2026-09-01T00:00:00.000Z");
  assert.throws(
    () => updateAgentWorkforceDocument(current, {
      agents: [{ ...core(), created_at: "1999-01-01T00:00:00.000Z", updated_at: "1999-01-01T00:00:00.000Z" }],
      expected_revision: current.revision,
    }),
    /Unknown field/,
  );
});

// ---------------------------------------------------------------------------
// Stored documents written before these fields existed must still load
// ---------------------------------------------------------------------------

test("a stored document from the previous schema loads with safe defaults", () => {
  const legacyAgent = { ...core() };
  delete legacyAgent.responsibilities;
  delete legacyAgent.triggers;
  delete legacyAgent.notes;
  const stored = JSON.stringify({
    version: 1,
    agents: [legacyAgent],
    revision: "2026-09-05T15:00:00.000Z",
    updated_at: "2026-09-05T15:00:00.000Z",
  });
  const document = parseAgentWorkforceDocument(stored);
  assert.deepEqual(document.agents[0].responsibilities, []);
  assert.deepEqual(document.agents[0].triggers, []);
  assert.equal(document.agents[0].notes, "");
  assert.equal(document.agents[0].created_at, "2026-09-05T15:00:00.000Z", "legacy agents inherit the document revision");
  assert.equal(document.agents[0].updated_at, "2026-09-05T15:00:00.000Z");
});

test("a stored document with a corrupt new field is still rejected", () => {
  const stored = JSON.stringify({
    version: 1,
    agents: [{ ...core(), triggers: "nope", created_at: "2026-09-05T15:00:00.000Z", updated_at: "2026-09-05T15:00:00.000Z" }],
    revision: "2026-09-05T15:00:00.000Z",
    updated_at: "2026-09-05T15:00:00.000Z",
  });
  assert.throws(() => parseAgentWorkforceDocument(stored), /triggers/);
});

test("a round trip through storage preserves every field", () => {
  const document = createAgentWorkforceDocument({ agents: [core({ notes: "Watch the approval queue." }), sub()] });
  assert.deepEqual(parseAgentWorkforceDocument(JSON.stringify(document)), document);
});

// ---------------------------------------------------------------------------
// Hierarchy integrity and non-destructive editing survive the new schema
// ---------------------------------------------------------------------------

test("hierarchy rules still hold", () => {
  assert.throws(() => createAgentWorkforceDocument({ agents: [sub({ parent_id: "missing-core" })] }), /unknown core parent/);
  assert.throws(() => createAgentWorkforceDocument({ agents: [core(), sub({ parent_id: "scout-research" })] }), /unknown core parent/);
  assert.throws(() => createAgentWorkforceDocument({ agents: [core({ parent_id: "x" })] }), /cannot have a parent/);
  assert.throws(() => createAgentWorkforceDocument({ agents: [sub({ parent_id: null })] }), /requires a parent/);
});

test("deletion is refused and stale revisions return a conflict", () => {
  const current = createAgentWorkforceDocument({ agents: [core(), sub()] });
  assert.throws(
    () => updateAgentWorkforceDocument(current, { agents: [core()], expected_revision: current.revision }),
    /deletion is not supported/,
  );
  assert.throws(
    () => updateAgentWorkforceDocument(current, { agents: [core(), sub()], expected_revision: "2020-01-01T00:00:00.000Z" }),
    /Stale/,
  );
});

test("a paused stage replaces deletion for retiring an agent", () => {
  const current = createAgentWorkforceDocument({ agents: [core(), sub()] });
  const next = updateAgentWorkforceDocument(
    current,
    { agents: [core(), sub({ status: "paused" })], expected_revision: current.revision },
    "2026-09-08T12:00:00.000Z",
  );
  assert.equal(next.agents.find((agent) => agent.id === "scout-research").status, "paused");
});

// ---------------------------------------------------------------------------
// The seeded workforce matches the operating model Andrew asked for
// ---------------------------------------------------------------------------

test("the seed ships four core agents and nineteen sub-agents", () => {
  const cores = DEFAULT_AGENT_WORKFORCE.agents.filter((agent) => agent.type === "core");
  const subs = DEFAULT_AGENT_WORKFORCE.agents.filter((agent) => agent.type === "subagent");
  assert.equal(cores.length, 4);
  assert.equal(subs.length, 19);
  assert.deepEqual(cores.map((agent) => agent.name), ["Maya", "Cora", "Sterling", "Forge"]);
  assert.deepEqual(cores.map((agent) => agent.department), ["Content", "Client Success", "Sales", "Build & Systems"]);
});

test("every seeded sub-agent reports to a real core agent and every seeded agent is fully defined", () => {
  const coreIds = new Set(DEFAULT_AGENT_WORKFORCE.agents.filter((agent) => agent.type === "core").map((agent) => agent.id));
  for (const agent of DEFAULT_AGENT_WORKFORCE.agents) {
    if (agent.type === "subagent") assert.equal(coreIds.has(agent.parent_id), true, `${agent.id} has a real parent`);
    assert.equal(agent.responsibilities.length > 0, true, `${agent.id} defines responsibilities`);
    assert.equal(agent.triggers.length > 0, true, `${agent.id} defines triggers`);
    assert.equal(agent.next_milestone.length > 0, true, `${agent.id} defines a next milestone`);
    assert.equal(typeof agent.created_at, "string");
  }
});

test("each core agent owns the sub-agent team the operating model specifies", () => {
  const teamOf = (parent) => DEFAULT_AGENT_WORKFORCE.agents.filter((agent) => agent.parent_id === parent).map((agent) => agent.name);
  assert.deepEqual(teamOf("maya-content-director"), ["Scout", "Story", "Echo", "Frame", "Signal", "Launch"]);
  assert.deepEqual(teamOf("cora-client-success"), ["Pulse", "Brief", "Relay", "Circle", "Care"]);
  assert.deepEqual(teamOf("sterling-sales-director"), ["Radar", "Ember", "Nudge", "Closer", "Forecast"]);
  assert.deepEqual(teamOf("forge-systems-director"), ["Builder", "Sentinel", "Lens"]);
});

test("Jarvis is defined as the chief of staff with its five internal workers", () => {
  assert.equal(JARVIS_PROFILE.role, "Chief of Staff");
  assert.equal(JARVIS_INTERNAL_WORKERS.length, 5);
  assert.deepEqual(JARVIS_INTERNAL_WORKERS.map((worker) => worker.name), [
    "Morning Brief",
    "Calendar & Priority",
    "Automation Health",
    "End-of-Day Reconciliation",
    "Research on Demand",
  ]);
  for (const worker of JARVIS_INTERNAL_WORKERS) {
    assert.equal(typeof worker.mission, "string");
    assert.equal(worker.mission.length > 0, true);
    assert.equal(["planned", "designed", "building", "testing", "live", "paused"].includes(worker.status), true);
  }
});

// ---------------------------------------------------------------------------
// Dashboard summary counts what the brief asks for
// ---------------------------------------------------------------------------

test("the summary reports core, sub-agent, stage, approval, and milestone counts", () => {
  const summary = summarizeAgentWorkforce(DEFAULT_AGENT_WORKFORCE.agents);
  assert.equal(summary.core, 4);
  assert.equal(summary.subagents, 19);
  assert.equal(summary.total, 23);
  assert.equal(summary.planned + summary.designed + summary.building + summary.testing + summary.live + summary.paused, 23);
  assert.equal(summary.approvalGated, DEFAULT_AGENT_WORKFORCE.agents.filter((a) => a.autonomy === "approval_gated").length);
  assert.equal(summary.overallProgress >= 0 && summary.overallProgress <= 100, true);
  assert.equal(Number.isInteger(summary.overallProgress), true);
});

test("overall progress averages the agents and an empty workforce reports zero", () => {
  assert.equal(summarizeAgentWorkforce([core({ progress: 40 }), sub({ progress: 60 })]).overallProgress, 50);
  const empty = summarizeAgentWorkforce([]);
  assert.equal(empty.overallProgress, 0);
  assert.equal(empty.total, 0);
});

test("milestones needing attention are the un-released agents that never got one", () => {
  const summary = summarizeAgentWorkforce([
    core({ id: "a", next_milestone: "", status: "building" }),
    core({ id: "b", next_milestone: "", status: "live" }),
    core({ id: "c", next_milestone: "Ship it", status: "planned" }),
  ]);
  assert.deepEqual(summary.milestonesNeedingAttention.map((agent) => agent.id), ["a"]);
});

// ---------------------------------------------------------------------------
// Search and filtering
// ---------------------------------------------------------------------------

test("search matches name, role, department, mission, capabilities, and responsibilities", () => {
  const agents = [core(), sub({ capabilities: ["Voice-of-customer mining"], responsibilities: ["Cite every claim"] })];
  const find = (query) => filterWorkforceAgents(agents, { view: "subagent", query }).map((agent) => agent.id);
  assert.deepEqual(find("scout"), ["scout-research"]);
  assert.deepEqual(find("research scout"), ["scout-research"]);
  assert.deepEqual(find("voice-of-customer"), ["scout-research"], "capabilities are searchable");
  assert.deepEqual(find("cite every"), ["scout-research"], "responsibilities are searchable");
  assert.deepEqual(find("   "), ["scout-research"], "a blank query filters nothing");
  assert.deepEqual(find("nothing here"), []);
});

test("search is case and whitespace insensitive", () => {
  const agents = [sub()];
  assert.equal(filterWorkforceAgents(agents, { view: "subagent", query: "  SCOUT  " }).length, 1);
});

test("sub-agents filter by parent core agent, build stage, and autonomy", () => {
  const agents = [
    core(),
    core({ id: "cora-client-success", name: "Cora", department: "Client Success" }),
    sub({ id: "scout-research", parent_id: "maya-content-director", status: "designed", autonomy: "internal" }),
    sub({ id: "launch-publisher", parent_id: "maya-content-director", status: "building", autonomy: "approval_gated" }),
    sub({ id: "pulse-client-health", parent_id: "cora-client-success", status: "building", autonomy: "internal" }),
  ];
  const ids = (filters) => filterWorkforceAgents(agents, { view: "subagent", ...filters }).map((agent) => agent.id);
  assert.deepEqual(ids({ parentId: "maya-content-director" }), ["scout-research", "launch-publisher"]);
  assert.deepEqual(ids({ status: "building" }), ["launch-publisher", "pulse-client-health"]);
  assert.deepEqual(ids({ autonomy: "approval_gated" }), ["launch-publisher"]);
  assert.deepEqual(ids({ parentId: "maya-content-director", status: "building" }), ["launch-publisher"]);
  assert.deepEqual(ids({ parentId: "cora-client-success", autonomy: "approval_gated" }), []);
});

test("the core view never leaks sub-agents and ignores the parent filter", () => {
  const agents = [core(), sub()];
  assert.deepEqual(filterWorkforceAgents(agents, { view: "core" }).map((a) => a.id), ["maya-content-director"]);
  assert.deepEqual(
    filterWorkforceAgents(agents, { view: "core", parentId: "maya-content-director" }).map((a) => a.id),
    ["maya-content-director"],
  );
});

// ---------------------------------------------------------------------------
// Draft recovery keeps up with the new fields
// ---------------------------------------------------------------------------

test("a recovery draft round-trips the new text fields", () => {
  const revision = "2026-09-08T12:00:00.000Z";
  const form = {
    id: "scout-research",
    type: "subagent",
    parent_id: "maya-content-director",
    name: "Scout",
    emoji: "⌕",
    role: "Research Scout",
    department: "Content",
    mission: "Find evidence.",
    personality: "Curious.",
    status: "designed",
    progress: 20,
    autonomy: "internal",
    cadence: "Daily",
    schedule: "5:45 AM PT",
    next_milestone: "First automated brief",
    notes: "Ask about sourcing.",
    capabilities_text: "Web research",
    inputs_text: "Calls",
    outputs_text: "Cited brief",
    responsibilities_text: "Cite every claim",
    triggers_text: "Daily 5:45 AM PT",
  };
  const raw = serializeAgentWorkforceDraft(revision, "owner-1", "subagent", form);
  assert.notEqual(raw, null);
  assert.deepEqual(parseAgentWorkforceDraft(raw, revision, "owner-1", "subagent"), form);
});

test("a draft missing a new field is discarded rather than half-restored", () => {
  const revision = "2026-09-08T12:00:00.000Z";
  const raw = JSON.stringify({
    revision,
    owner_id: "owner-1",
    view: "subagent",
    form: { id: "x", type: "subagent", parent_id: null, name: "X", emoji: "⌕", role: "R", department: "D", mission: "M", personality: "P", status: "designed", progress: 1, autonomy: "internal", cadence: "", schedule: "", next_milestone: "", capabilities_text: "", inputs_text: "", outputs_text: "" },
  });
  assert.equal(parseAgentWorkforceDraft(raw, revision, "owner-1", "subagent"), null);
});

// ---------------------------------------------------------------------------
// Navigation: AI Workforce is its own sidebar section with its own tabs
// ---------------------------------------------------------------------------

test("the sidebar has an AI Workforce section holding Jarvis, Core Agents, and Sub-agents", () => {
  const sidebar = read("../components/sidebar.tsx");
  assert.match(sidebar, /"AI Workforce"/);
  assert.match(sidebar, /href: "\/jarvis", label: "Jarvis".*section: "AI Workforce"/);
  assert.match(sidebar, /href: "\/jarvis\?tab=core", label: "Core Agents".*tab: "core".*section: "AI Workforce"/);
  assert.match(sidebar, /href: "\/jarvis\?tab=subagent", label: "Sub-agents".*tab: "subagent".*section: "AI Workforce"/);
  assert.doesNotMatch(sidebar, /label: "Jarvis".*section: "Backend"/, "Jarvis no longer hides under Backend");
});

test("the AI Workforce section renders in the sidebar section order", () => {
  const sidebar = read("../components/sidebar.tsx");
  const order = sidebar.match(/const SECTIONS = \[([^\]]+)\]/);
  assert.notEqual(order, null);
  assert.match(order[1], /"AI Workforce"/);
});

test("the Jarvis route resolves the active tab from the query string", () => {
  const page = read("../app/jarvis/page.tsx");
  // Resolved on the server and handed down, so the client tree needs no
  // render-blocking search-param bailout.
  assert.match(page, /searchParams: Promise</);
  assert.match(page, /initialTab=/);
  assert.match(page, /"core" \|\| requested === "subagent"/);
  const workspace = read("../app/jarvis/jarvis-workspace.tsx");
  assert.doesNotMatch(workspace, /useSearchParams/, "the workspace takes the tab as a prop");
  assert.match(workspace, /pushState/, "in-page tab changes update URL history for sidebar highlighting and Back/Forward");
});

test("the workforce dashboard exposes the parent and autonomy filters and the full summary", () => {
  const dashboard = read("../components/agent-workforce-dashboard.tsx");
  assert.match(dashboard, /Filter by core agent/i);
  assert.match(dashboard, /Filter by autonomy/i);
  assert.match(dashboard, /summarizeAgentWorkforce/);
  assert.match(dashboard, /filterWorkforceAgents/);
  assert.match(dashboard, /Responsibilities/);
  assert.match(dashboard, /Triggers/);
  assert.match(dashboard, /Notes/);
});

test("runtime state is never implied by configuration", () => {
  const dashboard = read("../components/agent-workforce-dashboard.tsx");
  assert.match(dashboard, /not connected/i, "telemetry is labelled as unavailable");
  assert.match(dashboard, /live: 'Released'/, "a released blueprint is not reported as running");
});

test("the Jarvis tab presents the chief of staff and its internal workers", () => {
  const workspace = read("../app/jarvis/jarvis-workspace.tsx");
  assert.match(workspace, /JARVIS_INTERNAL_WORKERS/);
  assert.match(workspace, /JARVIS_PROFILE/);
});

// ---------------------------------------------------------------------------
// A visitor without owner access must be told why, not quietly redirected
// ---------------------------------------------------------------------------

test("the workforce tabs are always offered, matching the sidebar", () => {
  const workspace = read("../app/jarvis/jarvis-workspace.tsx");
  assert.match(workspace, /\{ id: 'core', label: 'Core Agents'/);
  assert.match(workspace, /\{ id: 'subagent', label: 'Sub-agents'/);
  assert.doesNotMatch(workspace, /workforceOwner \?/, "the tab row is no longer gated on ownership");
});

test("a non-owner keeps the workspace they asked for instead of being sent to Jarvis", () => {
  const workspace = read("../app/jarvis/jarvis-workspace.tsx");
  assert.match(workspace, /const \[workspaceTab, setWorkspaceTab\] = useState<WorkspaceTab>\(initialTab\)/);
  assert.doesNotMatch(
    workspace,
    /workforceChecked && workforceOwnerId === null \? 'jarvis'/,
    "the silent fallback to the read-only Jarvis panel is gone",
  );
});

test("the locked state names the reason and offers the way out", () => {
  const workspace = read("../app/jarvis/jarvis-workspace.tsx");
  assert.match(workspace, /function WorkforceLocked/);
  assert.match(workspace, /needs an owner sign-in/);
  assert.match(workspace, /not recognised as an owner account/);
  assert.match(workspace, /\/login\?next=/, "it links to sign-in and returns to this tab");
  assert.match(workspace, /Checking your access/, "it does not accuse anyone before the check finishes");
  assert.match(workspace, /min-h-11/, "the action meets the mobile target size");
});

test("the Read-only badge belongs to the Jarvis assistant alone", () => {
  const workspace = read("../app/jarvis/jarvis-workspace.tsx");
  const jarvisPanel = workspace.slice(workspace.indexOf('id="workforce-panel-jarvis"'), workspace.indexOf('id="workforce-panel-core"'));
  assert.match(jarvisPanel, /Read-only/, "the badge stays on the Jarvis panel");
  const corePanel = workspace.slice(workspace.indexOf('id="workforce-panel-core"'));
  assert.doesNotMatch(corePanel, /Read-only/, "it never appears on a workforce panel");
});
