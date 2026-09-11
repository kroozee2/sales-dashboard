import type { AgentDefinition, SkillDefinition, SkillDeploymentState } from "./agent-workforce.ts";

export type SkillSort = "name" | "rating" | "usage";

export type SkillFilters = {
  query: string;
  category: string | "all";
  deploymentState: SkillDeploymentState | "all";
  agentId: string | "all";
  sort: SkillSort;
};

const searchText = (skill: SkillDefinition) => [skill.name, skill.purpose, skill.category, ...skill.tags].join(" ").toLowerCase();

export function skillUsageSortAvailable(skills: SkillDefinition[]): boolean {
  return skills.length > 0 && skills.every((skill) => skill.usage !== null);
}

export function filterAndSortSkills(skills: SkillDefinition[], filters: SkillFilters): SkillDefinition[] {
  const query = filters.query.trim().toLowerCase();
  const filtered = skills
    .filter((skill) => !query || searchText(skill).includes(query))
    .filter((skill) => filters.category === "all" || skill.category === filters.category)
    .filter((skill) => filters.deploymentState === "all" || skill.deployment_state === filters.deploymentState)
    .filter((skill) => filters.agentId === "all" || skill.agent_ids.includes(filters.agentId));
  return [...filtered].sort((left, right) => {
    if (filters.sort === "rating") {
      const score = (right.quality_rating ?? -1) - (left.quality_rating ?? -1);
      if (score) return score;
    }
    if (filters.sort === "usage" && skillUsageSortAvailable(skills)) {
      const uses = (right.usage?.count ?? 0) - (left.usage?.count ?? 0);
      if (uses) return uses;
    }
    return left.name.localeCompare(right.name);
  });
}

export function skillConnectionLabels(skill: Pick<SkillDefinition, "agent_ids">, agents: AgentDefinition[]): string[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  return skill.agent_ids.map((id) => {
    if (id === "jarvis") return "Jarvis";
    const agent = byId.get(id);
    if (!agent) return "Unknown agent";
    if (agent.type === "core") return agent.name;
    const parent = agent.parent_id ? byId.get(agent.parent_id) : null;
    return parent ? `${parent.name} › ${agent.name}` : agent.name;
  });
}
