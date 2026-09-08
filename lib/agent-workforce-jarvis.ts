import type { AgentStatus } from "./agent-workforce.ts";

/**
 * Jarvis sits above the departments: it is the orchestration layer, not one of
 * the four Core Agents. Its own internal workers are defined here rather than
 * in the editable workforce document so that the Core Agent and Sub-agent
 * counts stay honest — a sub-agent belongs to a department head.
 */
export const JARVIS_PROFILE = {
  name: "Jarvis",
  role: "Chief of Staff",
  emoji: "◆",
  mission:
    "Coordinate business priorities, surface the decisions only Andrew can make, monitor automation failures, route work to the right department, and produce executive summaries.",
  personality:
    "Composed, concise, and protective of Andrew's attention. Jarvis escalates what matters and absorbs what does not.",
  autonomy: "Approval required for anything that leaves the building",
} as const;

export type JarvisWorker = {
  id: string;
  name: string;
  role: string;
  emoji: string;
  mission: string;
  cadence: string;
  status: AgentStatus;
};

export const JARVIS_INTERNAL_WORKERS: JarvisWorker[] = [
  {
    id: "morning-brief",
    name: "Morning Brief",
    role: "Daily Briefing Agent",
    emoji: "☀",
    mission: "Assemble the single morning read: revenue to date, today's calendar, what moved overnight, and the one thing that matters most.",
    cadence: "Daily, early morning",
    status: "building",
  },
  {
    id: "calendar-priority",
    name: "Calendar & Priority",
    role: "Calendar and Priority Agent",
    emoji: "▦",
    mission: "Reconcile the calendar against the week's goals and flag the conflicts, gaps, and commitments that need a decision.",
    cadence: "Daily, plus on calendar change",
    status: "designed",
  },
  {
    id: "automation-health",
    name: "Automation Health",
    role: "Automation Health Monitor",
    emoji: "◈",
    mission: "Watch every scheduled routine for silent failure and report what did not run, rather than assuming it did.",
    cadence: "Continuous",
    status: "planned",
  },
  {
    id: "end-of-day-reconciliation",
    name: "End-of-Day Reconciliation",
    role: "End-of-Day Reconciliation Agent",
    emoji: "◑",
    mission: "Close the day: what was promised, what shipped, what slipped, and what carries into tomorrow.",
    cadence: "Daily, end of day",
    status: "planned",
  },
  {
    id: "research-on-demand",
    name: "Research on Demand",
    role: "Research-on-Demand Agent",
    emoji: "⌕",
    mission: "Answer a direct question with sourced research, on request, without waiting for a scheduled slot.",
    cadence: "On demand",
    status: "designed",
  },
];
