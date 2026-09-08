import type { AgentAutonomy, AgentDefinition, AgentStatus, AgentType } from "./agent-workforce.ts";

export type WorkforceSummary = {
  core: number;
  subagents: number;
  total: number;
  planned: number;
  designed: number;
  building: number;
  testing: number;
  live: number;
  paused: number;
  approvalGated: number;
  overallProgress: number;
  milestonesNeedingAttention: AgentDefinition[];
};

/**
 * Counts for the dashboard header. Every number here describes the *blueprint*
 * — what has been defined and how far it is built. None of it describes a
 * running process; runtime state has no authoritative source connected yet.
 */
export function summarizeAgentWorkforce(agents: AgentDefinition[]): WorkforceSummary {
  const countStatus = (status: AgentStatus) => agents.filter((agent) => agent.status === status).length;
  const total = agents.length;
  return {
    core: agents.filter((agent) => agent.type === "core").length,
    subagents: agents.filter((agent) => agent.type === "subagent").length,
    total,
    planned: countStatus("planned"),
    designed: countStatus("designed"),
    building: countStatus("building"),
    testing: countStatus("testing"),
    live: countStatus("live"),
    paused: countStatus("paused"),
    approvalGated: agents.filter((agent) => agent.autonomy === "approval_gated").length,
    overallProgress: total === 0 ? 0 : Math.round(agents.reduce((sum, agent) => sum + agent.progress, 0) / total),
    // An agent still being built with no stated next step is the one thing on
    // this page that genuinely needs Andrew's attention.
    milestonesNeedingAttention: agents.filter((agent) => !agent.next_milestone.trim() && agent.status !== "live" && agent.status !== "paused"),
  };
}

export type WorkforceFilters = {
  view: AgentType;
  query?: string;
  status?: AgentStatus | "all";
  autonomy?: AgentAutonomy | "all";
  parentId?: string | "all";
};

const searchableText = (agent: AgentDefinition) => [
  agent.name,
  agent.role,
  agent.department,
  agent.mission,
  agent.personality,
  agent.next_milestone,
  ...agent.capabilities,
  ...agent.responsibilities,
  ...agent.inputs,
  ...agent.outputs,
  ...agent.triggers,
].join(" ").toLowerCase();

export function filterWorkforceAgents(agents: AgentDefinition[], filters: WorkforceFilters): AgentDefinition[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  return agents
    .filter((agent) => agent.type === filters.view)
    // Only sub-agents have a parent, so the filter is meaningless on the core view.
    .filter((agent) => filters.view !== "subagent" || !filters.parentId || filters.parentId === "all" || agent.parent_id === filters.parentId)
    .filter((agent) => !filters.status || filters.status === "all" || agent.status === filters.status)
    .filter((agent) => !filters.autonomy || filters.autonomy === "all" || agent.autonomy === filters.autonomy)
    .filter((agent) => !query || searchableText(agent).includes(query));
}
