'use client';

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Activity, Bot, ChevronRight, Clock3, Copy, ExternalLink, Library, Pencil, Plus, Search, ShieldCheck, Sparkles, Star, Users, X } from 'lucide-react';
import { agentWorkforceDraftKey, parseAgentWorkforceDraft, persistAgentWorkforceDraft, reconcileAgentWorkforceDraft, type AgentWorkforceDraftForm } from '@/lib/agent-workforce-draft';
import { filterWorkforceAgents, summarizeAgentWorkforce } from '@/lib/agent-workforce-view';
import { filterAndSortSkills, skillConnectionLabels, skillUsageSortAvailable, type SkillSort } from '@/lib/agent-skills-view';
import {
  AGENT_AUTONOMY,
  AGENT_STATUSES,
  isAgentEditorDirty,
  shouldCloseAgentEditor,
  slugifyAgentId,
  uniqueAgentId,
  type AgentAutonomy,
  type AgentDefinition,
  type AgentInput,
  type AgentStatus,
  type AgentType,
  type AgentWorkforceDocument,
  SKILL_DEPLOYMENT_STATES,
  type SkillDefinition,
  type SkillDeploymentState,
  type SkillInput,
} from '@/lib/agent-workforce';

type WorkforceView = 'core' | 'subagent';
type FormAgent = AgentWorkforceDraftForm;

const STATUS_LABEL: Record<AgentStatus, string> = {
  planned: 'Planned',
  designed: 'Designed',
  building: 'Building',
  testing: 'Testing',
  live: 'Released',
  paused: 'Paused',
};

const STATUS_STYLE: Record<AgentStatus, string> = {
  planned: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
  designed: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
  building: 'border-blue-500/25 bg-blue-500/10 text-blue-300',
  testing: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  live: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  paused: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
};

const AUTONOMY_LABEL: Record<AgentAutonomy, string> = {
  draft_only: 'Draft only',
  internal: 'Autonomous internally',
  approval_gated: 'Approval required',
};

// Dates are shown in Andrew's own timezone rather than raw UTC.
function formatStamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'unknown';
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function listToText(items: string[]) { return items.join('\n'); }
function textToList(value: string) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

// The server owns created_at/updated_at, so everything sent back to it is
// projected down to exactly the fields an editor is allowed to set.
function toInput(agent: AgentInput): AgentInput {
  return {
    id: agent.id, type: agent.type, parent_id: agent.parent_id, name: agent.name, emoji: agent.emoji,
    role: agent.role, department: agent.department, mission: agent.mission, personality: agent.personality,
    status: agent.status, progress: agent.progress, autonomy: agent.autonomy, cadence: agent.cadence,
    schedule: agent.schedule, triggers: agent.triggers, responsibilities: agent.responsibilities,
    capabilities: agent.capabilities, inputs: agent.inputs, outputs: agent.outputs,
    next_milestone: agent.next_milestone, notes: agent.notes,
  };
}

function toSkillInput(skill: SkillDefinition): SkillInput {
  return {
    id: skill.id, name: skill.name, purpose: skill.purpose, behavior: skill.behavior, category: skill.category,
    tags: skill.tags, capabilities: skill.capabilities, inputs: skill.inputs, outputs: skill.outputs,
    documentation: skill.documentation, provenance: skill.provenance, agent_ids: skill.agent_ids, deployment_state: skill.deployment_state,
    source_url: skill.source_url, quality_rating: skill.quality_rating, review_count: skill.review_count,
  };
}

function toForm(agent: AgentInput): FormAgent {
  return {
    id: agent.id, type: agent.type, parent_id: agent.parent_id, name: agent.name, emoji: agent.emoji,
    role: agent.role, department: agent.department, mission: agent.mission, personality: agent.personality,
    status: agent.status, progress: agent.progress, autonomy: agent.autonomy, cadence: agent.cadence,
    schedule: agent.schedule, next_milestone: agent.next_milestone, notes: agent.notes,
    capabilities_text: listToText(agent.capabilities),
    inputs_text: listToText(agent.inputs),
    outputs_text: listToText(agent.outputs),
    responsibilities_text: listToText(agent.responsibilities),
    triggers_text: listToText(agent.triggers),
  };
}

function newAgent(type: AgentType, parent?: AgentDefinition): FormAgent {
  return {
    id: `agent-${crypto.randomUUID()}`,
    type,
    parent_id: type === 'subagent' ? parent?.id ?? '' : null,
    name: '',
    emoji: type === 'core' ? '✦' : '◇',
    role: '',
    department: parent?.department ?? '',
    mission: '',
    personality: '',
    status: 'planned',
    progress: 0,
    autonomy: 'internal',
    cadence: '',
    schedule: '',
    next_milestone: '',
    notes: '',
    capabilities_text: '',
    inputs_text: '',
    outputs_text: '',
    responsibilities_text: '',
    triggers_text: '',
  };
}

function formAgentToDefinition(form: FormAgent): AgentInput {
  return { id: form.id, type: form.type, parent_id: form.type === 'core' ? null : form.parent_id, name: form.name.trim(), emoji: form.emoji.trim(), role: form.role.trim(), department: form.department.trim(), mission: form.mission.trim(), personality: form.personality.trim(), status: form.status, progress: form.progress, autonomy: form.autonomy, cadence: form.cadence.trim(), schedule: form.schedule.trim(), triggers: textToList(form.triggers_text), responsibilities: textToList(form.responsibilities_text), capabilities: textToList(form.capabilities_text), inputs: textToList(form.inputs_text), outputs: textToList(form.outputs_text), next_milestone: form.next_milestone.trim(), notes: form.notes.trim() };
}

function sameAgentDefinition(left: AgentInput, right: AgentInput) {
  return (Object.keys(left) as (keyof AgentInput)[]).every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

function statusDot(status: AgentStatus) {
  if (status === 'live') return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.75)]';
  if (status === 'building' || status === 'testing') return 'bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,.55)]';
  if (status === 'paused') return 'bg-rose-400';
  return 'bg-zinc-500';
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090a0d]';
const SELECT_CLASS = `${FOCUS_RING} min-h-11 w-full rounded-xl border border-zinc-500 bg-[#18181b] px-3 text-base text-zinc-300 sm:w-44 sm:text-sm`;

function useDialogLifecycle(containerRef: RefObject<HTMLElement | null>, requestClose: () => void, initialFocusRef?: RefObject<HTMLElement | null>, returnFocusRef?: RefObject<HTMLElement | null>, fallbackFocusRef?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(requestClose);
  useEffect(() => { closeRef.current = requestClose; }, [requestClose]);

  useEffect(() => {
    const previousFocus = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const fallbackFocus = fallbackFocusRef?.current ?? null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = containerRef.current instanceof HTMLDialogElement ? containerRef.current : null;
    if (dialog && !dialog.open) dialog.showModal();
    const focusFirst = () => {
      const first = initialFocusRef?.current ?? containerRef.current?.querySelector<HTMLElement>('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])');
      first?.focus();
    };
    const frame = window.requestAnimationFrame(focusFirst);

    const onFocusIn = (event: FocusEvent) => {
      if (containerRef.current && event.target instanceof Node && !containerRef.current.contains(event.target)) focusFirst();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) return;
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('hidden'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      const previousIsUsable = previousFocus?.isConnected && previousFocus !== document.body && !previousFocus.matches('[disabled], [hidden], [inert]');
      (previousIsUsable ? previousFocus : fallbackFocus)?.focus();
    };
  }, [containerRef, fallbackFocusRef, initialFocusRef, returnFocusRef]);
}

function AgentCard({ agent, childCount, parentName, onEdit, onOpen }: { agent: AgentDefinition; childCount?: number; parentName?: string; onEdit: (opener: HTMLButtonElement) => void; onOpen: (opener: HTMLButtonElement) => void }) {
  return (
    <article className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-blue-400/20 hover:bg-white/[0.04] sm:p-5">
      <div className="flex items-start gap-4">
        <button onClick={(event) => onOpen(event.currentTarget)} className={`${FOCUS_RING} grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-violet-500/10 overflow-hidden whitespace-nowrap text-ellipsis text-2xl leading-none shadow-inner`} aria-label={`Open ${agent.name}`}>
          <span aria-hidden="true">{agent.emoji}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <button onClick={(event) => onOpen(event.currentTarget)} className={`${FOCUS_RING} min-h-11 min-w-0 max-w-full flex-1 rounded-lg text-left`}>
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-base font-semibold text-zinc-100">{agent.name}</h3>
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot(agent.status)}`} />
              </div>
              <p className="mt-0.5 max-w-full break-words text-xs text-zinc-400 [overflow-wrap:anywhere]">{agent.role}</p>
            </button>
            <button onClick={(event) => onEdit(event.currentTarget)} className={`${FOCUS_RING} grid min-h-11 min-w-11 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-zinc-400 transition hover:text-white`} aria-label={`Edit agent ${agent.name}`}>
              <Pencil size={14} />
            </button>
          </div>
          <p className="mt-3 line-clamp-2 break-words text-sm leading-6 text-zinc-400 [overflow-wrap:anywhere]">{agent.mission}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-[11px]">
          <span className="font-medium text-zinc-400">Blueprint progress</span>
          <span className="font-mono text-zinc-300">{agent.progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-400 transition-all" style={{ width: `${agent.progress}%` }} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${STATUS_STYLE[agent.status]}`}>{STATUS_LABEL[agent.status]}</span>
        <span className="max-w-full break-words rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[10px] text-zinc-400 [overflow-wrap:anywhere]">{agent.department}</span>
        <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[10px] text-zinc-400">{AUTONOMY_LABEL[agent.autonomy]}</span>
        {agent.cadence && <span className="max-w-full break-words rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[10px] text-zinc-400 [overflow-wrap:anywhere]">{agent.cadence}</span>}
        {typeof childCount === 'number' && <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[10px] text-zinc-400">{childCount} sub-agents</span>}
        {parentName && <span className="max-w-full break-words rounded-2xl border border-blue-400/15 bg-blue-400/[0.06] px-2.5 py-1 text-[10px] text-blue-300/80 [overflow-wrap:anywhere]">Reports to {parentName}</span>}
      </div>

      <button onClick={(event) => onOpen(event.currentTarget)} className={`${FOCUS_RING} mt-4 flex min-h-11 w-full items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-zinc-400 transition group-hover:text-zinc-300`}>
        <span className="truncate pr-3">Next: {agent.next_milestone || 'Define the next milestone'}</span>
        <ChevronRight size={14} className="shrink-0" />
      </button>
    </article>
  );
}

function DetailPanel({ agent, teamMembers, returnFocusRef, fallbackFocusRef, onClose, onEdit }: { agent: AgentDefinition; teamMembers: AgentDefinition[]; returnFocusRef: RefObject<HTMLElement | null>; fallbackFocusRef: RefObject<HTMLElement | null>; onClose: () => void; onEdit: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDialogLifecycle(dialogRef, onClose, closeButtonRef, returnFocusRef, fallbackFocusRef);
  return (
    <dialog ref={dialogRef} aria-labelledby="agent-detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }} className="fixed inset-0 z-[80] m-0 h-[100dvh] max-h-none w-full max-w-none border-0 bg-black/70 p-0 text-left backdrop-blur-sm">
      <div className="flex h-full justify-end" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0c0d10] pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))] shadow-2xl sm:pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:pl-[max(1.75rem,env(safe-area-inset-left))] sm:pr-[max(1.75rem,env(safe-area-inset-right))] sm:pt-[max(1.75rem,env(safe-area-inset-top))]">
        <div className="sticky top-0 z-10 -mx-2 flex items-start justify-between gap-4 bg-[#0c0d10]/95 px-2 pb-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-4">
            <div aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden whitespace-nowrap text-ellipsis rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-500/20 to-violet-500/10 text-3xl leading-none">{agent.emoji}</div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-start gap-2"><h2 id="agent-detail-title" className="min-w-0 break-words text-2xl font-semibold tracking-tight text-white [overflow-wrap:anywhere]">{agent.name}</h2><span className={`mt-3 h-2 w-2 shrink-0 rounded-full ${statusDot(agent.status)}`} /></div>
              <p className="mt-1 break-words text-sm text-zinc-400 [overflow-wrap:anywhere]">{agent.role} · {agent.department}</p>
            </div>
          </div>
          <button ref={closeButtonRef} autoFocus onClick={onClose} className={`${FOCUS_RING} grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl border border-white/10 p-2.5 text-zinc-400 hover:text-white`} aria-label="Close agent details"><X size={18} /></button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Blueprint status</p><p className="mt-2 text-sm text-zinc-200">{STATUS_LABEL[agent.status]} · {agent.progress}%</p></div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Autonomy</p><p className="mt-2 text-sm text-zinc-200">{AUTONOMY_LABEL[agent.autonomy]}</p></div>
        </div>

        <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Mission</h3><p className="mt-3 min-w-0 break-words text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{agent.mission}</p></section>
        <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Personality</h3><p className="mt-3 min-w-0 break-words rounded-xl border border-violet-400/10 bg-violet-400/[0.045] p-4 text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{agent.personality}</p></section>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <section className="min-w-0"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Schedule</h3><p className="mt-2 break-words text-sm text-zinc-300 [overflow-wrap:anywhere]">{agent.schedule || 'On demand'}</p><p className="mt-1 break-words text-xs text-zinc-400 [overflow-wrap:anywhere]">{agent.cadence || 'Cadence not set'}</p></section>
          <section className="min-w-0"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Next milestone</h3><p className="mt-2 break-words text-sm leading-6 text-zinc-300 [overflow-wrap:anywhere]">{agent.next_milestone || 'Not defined'}</p></section>
        </div>

        <section className="mt-7">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Responsibilities</h3>
          {agent.responsibilities.length ? (
            <ul className="mt-3 space-y-2">{agent.responsibilities.map((item) => <li key={item} className="min-w-0 break-words rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5 text-sm leading-6 text-zinc-300 [overflow-wrap:anywhere]">{item}</li>)}</ul>
          ) : <p className="mt-3 text-sm text-zinc-400">None defined</p>}
        </section>

        {[['Capabilities', agent.capabilities], ['Triggers', agent.triggers], ['Inputs', agent.inputs], ['Outputs', agent.outputs]].map(([label, items]) => (
          <section key={String(label)} className="mt-7">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</h3>
            <div className="mt-3 flex flex-wrap gap-2">{(items as string[]).length ? (items as string[]).map((item) => <span key={item} className="max-w-full break-words rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300 [overflow-wrap:anywhere]">{item}</span>) : <span className="text-sm text-zinc-400">None defined</span>}</div>
          </section>
        ))}

        <section className="mt-7">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Notes</h3>
          <p className="mt-3 min-w-0 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{agent.notes || 'No notes yet.'}</p>
        </section>

        <section className="mt-7">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Definition history</h3>
          <p className="mt-2 break-words text-xs leading-5 text-zinc-400 [overflow-wrap:anywhere]">Created {formatStamp(agent.created_at)} · Last edited {formatStamp(agent.updated_at)}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">These record edits to the definition. They are not run history.</p>
        </section>

        {agent.type === 'core' && (
          <section className="mt-8"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Team</h3><div className="mt-3 space-y-2">{teamMembers.map((child) => <div key={child.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden whitespace-nowrap text-ellipsis text-lg leading-none">{child.emoji}</span><div className="min-w-0"><p className="break-words text-sm text-zinc-200 [overflow-wrap:anywhere]">{child.name}</p><p className="break-words text-xs text-zinc-400 [overflow-wrap:anywhere]">{child.role}</p></div><span className="ml-auto font-mono text-[10px] text-zinc-400">{child.progress}%</span></div>)}</div></section>
        )}

        <button onClick={onEdit} className={`${FOCUS_RING} mt-8 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-500`}><Pencil size={15} /> Edit agent</button>
      </aside>
      </div>
    </dialog>
  );
}

const SKILL_DEPLOYMENT_LABEL: Record<SkillDeploymentState, string> = {
  draft: 'Draft',
  configured: 'Configured',
  deployed: 'Deployed',
  paused: 'Paused',
  retired: 'Retired',
};

function SkillDetailPanel({ skill, agents, returnFocusRef, fallbackFocusRef, onClose }: { skill: SkillDefinition; agents: AgentDefinition[]; returnFocusRef: RefObject<HTMLElement | null>; fallbackFocusRef: RefObject<HTMLElement | null>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [copyStatus, setCopyStatus] = useState('');
  useDialogLifecycle(dialogRef, onClose, closeButtonRef, returnFocusRef, fallbackFocusRef);
  const connections = skillConnectionLabels(skill, agents);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(skill.source_url);
      setCopyStatus('GitHub link copied.');
    } catch {
      setCopyStatus('Could not copy the link. Open GitHub and copy it there.');
    }
  };
  return (
    <dialog ref={dialogRef} aria-labelledby="skill-detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }} className="fixed inset-0 z-[80] m-0 h-[100dvh] max-h-none w-full max-w-none border-0 bg-black/70 p-0 text-left backdrop-blur-sm">
      <div className="flex h-full justify-end" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
        <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0c0d10] pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))] shadow-2xl sm:pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:pl-[max(1.75rem,env(safe-area-inset-left))] sm:pr-[max(1.75rem,env(safe-area-inset-right))] sm:pt-[max(1.75rem,env(safe-area-inset-top))]">
          <div className="sticky top-0 z-10 -mx-2 flex items-start justify-between gap-4 bg-[#0c0d10]/95 px-2 pb-3 backdrop-blur">
            <div className="min-w-0"><p className="break-words text-[10px] font-medium uppercase tracking-[0.18em] text-blue-300 [overflow-wrap:anywhere]">{skill.category}</p><h2 id="skill-detail-title" className="mt-2 break-words text-2xl font-semibold tracking-tight text-white [overflow-wrap:anywhere]">{skill.name}</h2></div>
            <button ref={closeButtonRef} autoFocus onClick={onClose} className={`${FOCUS_RING} grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl border border-white/10 p-2.5 text-zinc-400 hover:text-white`} aria-label="Close skill details"><X size={18} /></button>
          </div>
          <p className="mt-6 break-words text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{skill.purpose}</p>
          <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Behavior</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{skill.behavior || 'Behavior not documented.'}</p></section>
          {([
            ['Capabilities', skill.capabilities],
            ['Inputs', skill.inputs],
            ['Outputs', skill.outputs],
          ] as const).map(([label, items]) => <section key={label} className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</h3>{items.length > 0 ? <ul className="mt-3 space-y-2">{items.map((item) => <li key={item} className="break-words rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5 text-sm text-zinc-300 [overflow-wrap:anywhere]">{item}</li>)}</ul> : <p className="mt-3 text-sm text-zinc-400">Not documented.</p>}</section>)}
          <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Documentation</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{skill.documentation || 'Documentation not provided.'}</p></section>
          <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Catalog provenance</h3><p className="mt-2 text-sm text-zinc-300">{skill.provenance === 'owner_configured' ? 'Owner configured' : skill.provenance === 'starter_recommendation' ? 'Starter recommendation' : 'Legacy record · unverified'}</p><p className="mt-1 text-xs leading-5 text-zinc-400">{skill.provenance === 'owner_configured' ? 'Saved as owner-maintained catalog configuration.' : skill.provenance === 'starter_recommendation' ? 'Suggested starter definition only; assignment, configuration, and deployment are not confirmed.' : 'Migrated from an older catalog record. Review its definition and state before relying on it.'}</p></section>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">Deployment</p><p className="mt-2 text-sm text-zinc-200">{SKILL_DEPLOYMENT_LABEL[skill.deployment_state]}</p><p className="mt-1 text-xs leading-5 text-zinc-400">Configuration state only; it does not mean the skill is running now.</p></div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">Runtime activity</p>{skill.usage ? <><p className="mt-2 text-sm text-zinc-200">{skill.usage.count.toLocaleString()} verified uses</p><p className="mt-1 text-xs text-zinc-400">Hermes · last observed {formatStamp(skill.usage.last_used_at)}</p></> : <p className="mt-2 text-sm text-amber-200">Activity not connected</p>}</div>
          </div>
          <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Connected workforce</h3>{connections.length > 0 ? <ul className="mt-3 space-y-2">{connections.map((label, index) => <li key={`${skill.agent_ids[index]}-${index}`} className="break-words rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5 text-sm text-zinc-300 [overflow-wrap:anywhere]">{label}</li>)}</ul> : <p className="mt-3 text-sm text-zinc-400">No workforce connections confirmed.</p>}</section>
          <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Tags</h3><div className="mt-3 flex flex-wrap gap-2">{skill.tags.map((tag) => <span key={tag} className="max-w-full break-words rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-300 [overflow-wrap:anywhere]">{tag}</span>)}</div></section>
          <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Internal quality rating</h3><p className="mt-2 text-sm text-zinc-300">{skill.quality_rating === null ? 'Not rated' : `${skill.quality_rating.toFixed(1)} out of 5`} · {skill.review_count} internal {skill.review_count === 1 ? 'review' : 'reviews'}</p><p className="mt-1 text-xs leading-5 text-zinc-400">Owner-maintained internal metadata, not a community rating.</p></section>
          <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">GitHub source</h3><p className="mt-2 break-all text-xs leading-5 text-zinc-400">{skill.source_url}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => void copyLink()} className={`${FOCUS_RING} flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5`}><Copy size={15} /> Copy link</button><a href={skill.source_url} target="_blank" rel="noreferrer" className={`${FOCUS_RING} flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500`}><ExternalLink size={15} /> Open GitHub</a></div><p role="status" aria-live="polite" className="mt-3 text-xs text-zinc-400">{copyStatus}</p><p className="mt-2 text-xs leading-5 text-zinc-400">Sharing this link is read-only. It does not install the skill or grant repository access.</p></section>
          {skill.provenance === 'owner_configured' ? <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Definition history</h3><p className="mt-2 text-xs leading-5 text-zinc-400">Created {formatStamp(skill.created_at)} · Last edited {formatStamp(skill.updated_at)}</p></section> : <section className="mt-7"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Definition history unavailable</h3><p className="mt-2 text-xs leading-5 text-zinc-400">Authoritative creation and edit timestamps are not available for this catalog provenance.</p></section>}
        </aside>
      </div>
    </dialog>
  );
}

function SkillsCatalog({ skills, agents }: { skills: SkillDefinition[]; agents: AgentDefinition[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [deploymentState, setDeploymentState] = useState<'all' | SkillDeploymentState>('all');
  const [agentId, setAgentId] = useState('all');
  const [sort, setSort] = useState<SkillSort>('name');
  const [selectedSkill, setSelectedSkill] = useState<SkillDefinition | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const usageAvailable = skillUsageSortAvailable(skills);
  const categories = useMemo(() => [...new Set(skills.map((skill) => skill.category))].sort(), [skills]);
  const connectedAgents = useMemo(() => agents.filter((agent) => skills.some((skill) => skill.agent_ids.includes(agent.id))), [agents, skills]);
  const visible = useMemo(() => filterAndSortSkills(skills, { query, category, deploymentState, agentId, sort }), [agentId, category, deploymentState, query, skills, sort]);
  return (
    <div>
      <header><div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-blue-300/70"><Library size={13} /> AI Workforce</div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Skills library</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Reusable capabilities for your AI workforce. This catalog is where workforce connections can be documented; each card and detail view shows only confirmed assignments. Deployment and runtime evidence stay separate.</p></header>
      <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">Skills</p><p className="mt-2 text-xl font-semibold text-zinc-100">{skills.length}</p></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">Deployed</p><p className="mt-2 text-xl font-semibold text-zinc-100">{skills.filter((skill) => skill.deployment_state === 'deployed').length}</p></div><div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-amber-200/80">Runtime evidence</p><p className="mt-2 text-sm font-medium text-amber-200">{usageAvailable ? 'Hermes activity connected' : 'Activity not connected'}</p></div></div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <label className="relative min-w-[12rem] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" /><span className="sr-only">Search skills</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills by name, purpose, category, or tag" className={`${FOCUS_RING} min-h-11 w-full rounded-xl border border-zinc-500 bg-[#18181b] pl-9 pr-3 text-base text-white placeholder:text-zinc-400 sm:text-sm`} /></label>
        <label><span className="sr-only">Filter skills by category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={SELECT_CLASS}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span className="sr-only">Filter skills by deployment state</span><select value={deploymentState} onChange={(event) => setDeploymentState(event.target.value as 'all' | SkillDeploymentState)} className={SELECT_CLASS}><option value="all">All deployment states</option>{SKILL_DEPLOYMENT_STATES.map((state) => <option key={state} value={state}>{SKILL_DEPLOYMENT_LABEL[state]}</option>)}</select></label>
        <label><span className="sr-only">Filter skills by connected agent</span><select value={agentId} onChange={(event) => setAgentId(event.target.value)} className={SELECT_CLASS}><option value="all">All connected agents</option><option value="jarvis">Jarvis</option>{connectedAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
        <label><span className="sr-only">Sort skills</span><select value={sort} onChange={(event) => setSort(event.target.value as SkillSort)} className={SELECT_CLASS}><option value="name">Name</option><option value="rating">Internal rating</option><option value="usage" disabled={!usageAvailable}>{usageAvailable ? 'Most used' : 'Most used (activity not connected)'}</option></select></label>
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-zinc-400">Showing {visible.length} of {skills.length} skills.</p>
      {visible.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-white/10 py-16 text-center"><Library className="mx-auto text-zinc-400" /><p className="mt-3 text-sm text-zinc-400">No skills match these filters.</p></div> : <div className="mt-6 grid gap-4 xl:grid-cols-2">{visible.map((skill) => { const labels = skillConnectionLabels(skill, agents); return <article key={skill.id} className="min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-[10px] font-medium uppercase tracking-[0.16em] text-blue-300 [overflow-wrap:anywhere]">{skill.category}</p><h2 className="mt-2 break-words text-base font-semibold text-zinc-100 [overflow-wrap:anywhere]">{skill.name}</h2></div><span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-zinc-300">{SKILL_DEPLOYMENT_LABEL[skill.deployment_state]}</span></div><p className="mt-3 break-words text-sm leading-6 text-zinc-400 [overflow-wrap:anywhere]">{skill.purpose}</p><div className="mt-4 flex flex-wrap gap-2">{labels.slice(0, 3).map((label) => <span key={label} className="max-w-full break-words rounded-full border border-blue-400/15 bg-blue-400/[0.05] px-2.5 py-1 text-[10px] text-blue-200 [overflow-wrap:anywhere]">{label}</span>)}{labels.length > 3 && <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-zinc-400">+{labels.length - 3}</span>}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-xs text-zinc-400"><span className="flex items-center gap-1.5"><Star size={13} /> Internal quality rating: {skill.quality_rating === null ? 'Not rated' : `${skill.quality_rating.toFixed(1)}/5`}</span><span>{skill.usage ? `${skill.usage.count.toLocaleString()} verified uses` : 'Activity not connected'}</span></div><button type="button" onClick={(event) => { detailOpenerRef.current = event.currentTarget; setSelectedSkill(skill); }} className={`${FOCUS_RING} mt-3 flex min-h-11 w-full items-center justify-between rounded-lg text-left text-xs text-zinc-300`}><span>View skill details</span><ChevronRight size={14} /></button></article>; })}</div>}
      {!usageAvailable && <p className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-zinc-400">Most-used ranking is disabled because authoritative runtime telemetry is not connected. Configured or deployed skills are not presented as currently active.</p>}
      {selectedSkill && <SkillDetailPanel skill={selectedSkill} agents={agents} returnFocusRef={detailOpenerRef} fallbackFocusRef={searchRef} onClose={() => setSelectedSkill(null)} />}
    </div>
  );
}

export function AgentSkillsCatalog() {
  const [document, setDocument] = useState<AgentWorkforceDocument | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/agent-workforce', { cache: 'no-store' });
      const data = await response.json() as { document?: AgentWorkforceDocument; error?: string };
      if (!response.ok || !data.document) throw new Error(data.error || 'The skills catalog could not be loaded.');
      setDocument(data.document);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The skills catalog could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/agent-workforce', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { document?: AgentWorkforceDocument; error?: string };
        if (!response.ok || !data.document) throw new Error(data.error || 'The skills catalog could not be loaded.');
        return data.document;
      })
      .then((next) => { if (!cancelled) setDocument(next); })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'The skills catalog could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  if (loading) return <div role="status" className="grid min-h-[320px] place-items-center rounded-3xl border border-white/[0.07] bg-[#090a0d] text-sm text-zinc-400">Loading skills library…</div>;
  if (!document) return <div role="alert" className="rounded-3xl border border-rose-400/20 bg-[#090a0d] p-6 text-sm text-rose-200"><p className="break-words [overflow-wrap:anywhere]">{error || 'The skills catalog is unavailable.'}</p><button type="button" onClick={() => void load()} className={`${FOCUS_RING} mt-4 min-h-11 rounded-lg border border-rose-300/30 px-4 py-2`}>Try again</button></div>;
  return <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#090a0d] p-4 shadow-2xl sm:p-6"><SkillsCatalog skills={document.skills} agents={document.agents} /></div>;
}

function AgentEditor({ form, coreAgents, saving, cleanupPending, error, initiallyDirty, creating, recoveryOnly, returnFocusRef, fallbackFocusRef, onChange, onClose, onSubmit }: { form: FormAgent; coreAgents: AgentDefinition[]; saving: boolean; cleanupPending: boolean; error: string; initiallyDirty: boolean; creating: boolean; recoveryOnly: boolean; returnFocusRef: RefObject<HTMLElement | null>; fallbackFocusRef: RefObject<HTMLElement | null>; onChange: (next: FormAgent) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const [initialForm] = useState(() => JSON.stringify(form));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isDirty = isAgentEditorDirty(initialForm, JSON.stringify(form), initiallyDirty);
  const editorLocked = saving || cleanupPending;
  const requestClose = () => {
    if (editorLocked) return;
    const discardConfirmed = !isDirty || window.confirm('Discard your unsaved agent changes?');
    if (shouldCloseAgentEditor(false, isDirty, discardConfirmed)) onClose();
  };
  useDialogLifecycle(dialogRef, requestClose, nameInputRef, returnFocusRef, fallbackFocusRef);
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);
  const navigationStateRef = useRef({ isDirty, saving: editorLocked, onClose });
  const historyGuardId = `agent-editor-${useId()}`;
  const historyGuardGenerationRef = useRef(0);
  useEffect(() => { navigationStateRef.current = { isDirty, saving: editorLocked, onClose }; }, [editorLocked, isDirty, onClose]);
  useEffect(() => {
    const guardId = historyGuardId;
    const guardGeneration = historyGuardGenerationRef;
    const generation = ++guardGeneration.current;
    if (window.history.state?.agentEditorGuard !== guardId) {
      window.history.pushState({ ...window.history.state, agentEditorGuard: guardId }, '');
    }
    const discardMessage = 'Discard your unsaved agent changes?';
    const leaveMessage = 'Leave this page? Your unsaved agent draft will be kept in this tab.';
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const state = navigationStateRef.current;
      if (!state.isDirty && !state.saving) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const onDocumentClick = (event: MouseEvent) => {
      const state = navigationStateRef.current;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!target || (!state.isDirty && !state.saving)) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || target.hasAttribute('download') || (target.target && target.target.toLowerCase() !== '_self')) return;
      const destination = new URL(target.href, window.location.href);
      const current = window.location;
      if (destination.origin === current.origin && destination.pathname === current.pathname && destination.search === current.search) return;
      if (state.saving || !window.confirm(leaveMessage)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const onPopState = (event: PopStateEvent) => {
      if (event.state?.agentEditorGuard === guardId) return;
      const state = navigationStateRef.current;
      if (state.saving || (state.isDirty && !window.confirm(discardMessage))) {
        window.history.forward();
        return;
      }
      state.onClose();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onDocumentClick, true);
      queueMicrotask(() => {
        if (guardGeneration.current !== generation) return;
        if (window.history.state?.agentEditorGuard === guardId) window.history.back();
      });
    };
  }, [historyGuardId]);

  const field = (key: keyof FormAgent, value: string | number | null) => onChange({ ...form, [key]: value });
  const inputClass = `mt-1.5 min-h-11 w-full rounded-lg border border-zinc-500 bg-[#18181b] px-3 py-2.5 text-base text-zinc-100 transition placeholder:text-zinc-400 sm:text-sm focus:border-blue-400/50 ${FOCUS_RING}`;
  const labelClass = 'text-[11px] font-medium text-zinc-400';
  return (
    <dialog ref={dialogRef} aria-labelledby="agent-editor-title" onCancel={(event) => { event.preventDefault(); requestClose(); }} className="fixed inset-0 z-[90] m-0 h-[100dvh] max-h-none w-full max-w-none overflow-y-auto border-0 bg-black/75 p-0 text-left backdrop-blur-sm">
      <div className="flex min-h-full items-start justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center">
      <form onSubmit={onSubmit} style={{ maxHeight: 'calc(100dvh - 1.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }} className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101115] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6"><div><h2 id="agent-editor-title" className="text-lg font-semibold text-white">{creating ? 'Create agent' : 'Edit agent'}</h2><p className="mt-1 text-xs text-zinc-400">Define the role, operating boundaries, and build plan.</p></div><button type="button" onClick={requestClose} disabled={editorLocked} className={`${FOCUS_RING} grid min-h-11 min-w-11 place-items-center rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white`} aria-label="Close agent editor"><X size={18} /></button></header>
        <fieldset disabled={editorLocked} className="contents">
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">
          <label className={labelClass}>Name<input ref={nameInputRef} autoFocus required maxLength={80} value={form.name} onChange={(e) => field('name', e.target.value)} className={inputClass} placeholder="Maya" /></label>
          <label className={labelClass}>Role<input required maxLength={120} value={form.role} onChange={(e) => field('role', e.target.value)} className={inputClass} placeholder="Content Director" /></label>
          <label className={labelClass}>Icon or emoji<input required maxLength={8} value={form.emoji} onChange={(e) => field('emoji', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Department<input required maxLength={100} value={form.department} onChange={(e) => field('department', e.target.value)} className={inputClass} placeholder="Content" /></label>
          {form.type === 'subagent' && <label className={`${labelClass} sm:col-span-2`}>Reports to<select required value={form.parent_id ?? ''} onChange={(e) => { const parent = coreAgents.find((item) => item.id === e.target.value); onChange({ ...form, parent_id: e.target.value, department: parent?.department ?? form.department }); }} className={inputClass}><option value="">Choose a core agent</option>{coreAgents.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>}
          <label className={`${labelClass} sm:col-span-2`}>Mission<textarea required maxLength={1200} rows={3} value={form.mission} onChange={(e) => field('mission', e.target.value)} className={inputClass} placeholder="What outcome is this agent responsible for?" /></label>
          <label className={`${labelClass} sm:col-span-2`}>Personality<textarea required maxLength={600} rows={2} value={form.personality} onChange={(e) => field('personality', e.target.value)} className={inputClass} placeholder="How should this agent think, communicate, and make decisions?" /></label>
          <label className={labelClass}>Build status<select value={form.status} onChange={(e) => field('status', e.target.value as AgentStatus)} className={inputClass}>{AGENT_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select></label>
          <label className={labelClass}>Autonomy<select value={form.autonomy} onChange={(e) => field('autonomy', e.target.value as AgentAutonomy)} className={inputClass}>{AGENT_AUTONOMY.map((value) => <option key={value} value={value}>{AUTONOMY_LABEL[value]}</option>)}</select></label>
          <label className={`${labelClass} sm:col-span-2`}>Build progress · {form.progress}%<input type="range" min="0" max="100" step="5" value={form.progress} onChange={(e) => field('progress', Number(e.target.value))} className={`mt-3 h-11 w-full accent-blue-500 ${FOCUS_RING}`} /></label>
          <label className={labelClass}>Cadence<input maxLength={200} value={form.cadence} onChange={(e) => field('cadence', e.target.value)} className={inputClass} placeholder="Daily, weekly, or on demand" /></label>
          <label className={labelClass}>Schedule<input maxLength={200} value={form.schedule} onChange={(e) => field('schedule', e.target.value)} className={inputClass} placeholder="Monday 6:00 AM PT" /></label>
          <label className={`${labelClass} sm:col-span-2`}>Next milestone<input maxLength={300} value={form.next_milestone} onChange={(e) => field('next_milestone', e.target.value)} className={inputClass} placeholder="What must be built next?" /></label>
          <label className={labelClass}>Capabilities<textarea rows={4} maxLength={4000} value={form.capabilities_text} onChange={(e) => field('capabilities_text', e.target.value)} className={inputClass} placeholder={'One per line\nResearch\nStrategy'} /></label>
          <label className={labelClass}>Inputs<textarea rows={4} maxLength={4000} value={form.inputs_text} onChange={(e) => field('inputs_text', e.target.value)} className={inputClass} placeholder={'One per line\nSales calls\nAnalytics'} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Outputs<textarea rows={3} maxLength={4000} value={form.outputs_text} onChange={(e) => field('outputs_text', e.target.value)} className={inputClass} placeholder={'One per line\nResearch brief\nApproval-ready draft'} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Responsibilities<textarea rows={4} maxLength={4000} value={form.responsibilities_text} onChange={(e) => field('responsibilities_text', e.target.value)} className={inputClass} placeholder={'One per line\nKeep the pipeline truthful\nHold outbound messages for approval'} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Triggers<textarea rows={3} maxLength={4000} value={form.triggers_text} onChange={(e) => field('triggers_text', e.target.value)} className={inputClass} placeholder={'One per line\nA new lead arrives\nThe daily 7:15 AM run'} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Notes<textarea rows={3} maxLength={2000} value={form.notes} onChange={(e) => field('notes', e.target.value)} className={inputClass} placeholder="Anything worth remembering about this agent" /></label>
        </div>
        </fieldset>
        {error && <div ref={alertRef} role="alert" tabIndex={-1} className="mx-5 mt-4 max-w-full break-words rounded-xl [overflow-wrap:anywhere] border border-rose-400/25 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 sm:mx-6">{error}</div>}
        <footer className="flex flex-col-reverse gap-3 border-t border-white/[0.07] bg-black/15 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:items-center sm:justify-end sm:px-6"><button type="button" onClick={requestClose} disabled={editorLocked} className={`${FOCUS_RING} min-h-11 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-white`}>Cancel</button><button type="submit" disabled={saving || recoveryOnly} className={`${FOCUS_RING} min-h-11 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50`}>{recoveryOnly ? 'Recovery only' : cleanupPending ? 'Retry cleanup' : saving ? 'Saving…' : 'Save agent'}</button></footer>
      </form>
      </div>
    </dialog>
  );
}

export function AgentWorkforceDashboard({ view, ownerId, onEditorOpenChange }: { view: WorkforceView; ownerId: string; onEditorOpenChange?: (open: boolean) => void }) {
  const [document, setDocument] = useState<AgentWorkforceDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [draftWarning, setDraftWarning] = useState('');
  const [search, setSearch] = useState('');
  const [autonomy, setAutonomy] = useState<'all' | AgentAutonomy>('all');
  const [parent, setParent] = useState<string>('all');
  const [status, setStatus] = useState<'all' | AgentStatus>('all');
  const [selected, setSelected] = useState<AgentDefinition | null>(null);
  const [form, setForm] = useState<FormAgent | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [saving, setSaving] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [recoveryOnlyDraft, setRecoveryOnlyDraft] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const savingRef = useRef(false);
  const [draftReadyRevision, setDraftReadyRevision] = useState<string | null>(null);
  const editorBaselineRef = useRef<FormAgent | null>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const editorReturnFocusRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const draftStorageRevisionRef = useRef<string | null>(null);
  const pendingSavedDocumentRef = useRef<AgentWorkforceDocument | null>(null);

  useEffect(() => { onEditorOpenChange?.(Boolean(form)); }, [form, onEditorOpenChange]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/agent-workforce', { cache: 'no-store' });
      const data = await response.json() as { document?: AgentWorkforceDocument; error?: string };
      if (!response.ok || !data.document) throw new Error(data.error || 'The AI workforce could not be loaded.');
      setDocument(data.document);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The AI workforce could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/agent-workforce', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { document?: AgentWorkforceDocument; error?: string };
        if (!response.ok || !data.document) throw new Error(data.error || 'The AI workforce could not be loaded.');
        return data.document;
      })
      .then((next) => { if (!cancelled) setDocument(next); })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'The AI workforce could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!document || draftReadyRevision === document.revision) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let restored: FormAgent | null = null;
      let recoveryOnly = false;
      try {
        const raw = window.sessionStorage.getItem(agentWorkforceDraftKey(ownerId, view));
        const candidate = raw ? parseAgentWorkforceDraft(raw, null, ownerId, view) : null;
        const exact = raw ? parseAgentWorkforceDraft(raw, document.revision, ownerId, view) : null;
        if (candidate) {
          const savedAgent = document.agents.find((item) => item.id === candidate.id);
          if (exact || !savedAgent) restored = candidate;
          else if (sameAgentDefinition(savedAgent, formAgentToDefinition(candidate))) {
            const cleared = persistAgentWorkforceDraft(window.sessionStorage, document.revision, ownerId, view, null);
            setDraftWarning(cleared.ok ? 'Your agent save completed before the previous response was lost.' : cleared.warning);
          } else {
            restored = candidate;
            recoveryOnly = true;
            setDraftWarning('This stale edit differs from the latest saved agent. It is open for inspection and manual recovery only; saving is blocked.');
          }
        }
      } catch { /* Storage can be unavailable in hardened browser modes. */ }
      if (cancelled) return;
      if (restored) {
        editorReturnFocusRef.current = null;
        const baselineAgent = document.agents.find((item) => item.id === restored.id);
        editorBaselineRef.current = recoveryOnly ? null : baselineAgent ? toForm(baselineAgent) : null;
        setEditorMode(recoveryOnly || baselineAgent ? 'edit' : 'create');
        setRecoveryOnlyDraft(recoveryOnly);
        setForm(restored);
        setRestoredDraft(true);
        setSaveError(recoveryOnly ? 'Recovery-only draft: copy the values you need, then close it and edit the latest saved agent. This stale snapshot cannot be saved.' : baselineAgent ? 'Your unsaved edit draft was restored.' : 'Your stable create draft was restored against the latest workforce version; review it, then save again.');
      }
      setDraftReadyRevision(document.revision);
    });
    return () => { cancelled = true; };
  }, [document, draftReadyRevision, ownerId, view]);

  useEffect(() => {
    if (!document || draftReadyRevision !== document.revision || recoveryOnlyDraft) return;
    const result = persistAgentWorkforceDraft(window.sessionStorage, document.revision, ownerId, view, form);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        if (result.ok && form) draftStorageRevisionRef.current = document.revision;
        setDraftWarning(result.ok ? '' : result.warning);
      }
    });
    return () => { cancelled = true; };
  }, [document, draftReadyRevision, form, ownerId, recoveryOnlyDraft, view]);

  const coreAgents = useMemo(() => document?.agents.filter((agent) => agent.type === 'core') ?? [], [document]);
  const agents = useMemo(
    () => filterWorkforceAgents(document?.agents ?? [], { view, query: search, status, autonomy, parentId: parent }),
    [autonomy, document, parent, search, status, view],
  );
  const summary = useMemo(() => summarizeAgentWorkforce(document?.agents ?? []), [document]);

  const openCreate = (opener: HTMLElement, parent?: AgentDefinition) => { pendingSavedDocumentRef.current = null; setCleanupPending(false); setSaveError(''); setRestoredDraft(false); setRecoveryOnlyDraft(false); setEditorMode('create'); editorReturnFocusRef.current = opener; editorBaselineRef.current = null; setForm(newAgent(view, parent)); };
  const openEdit = (agent: AgentDefinition, returnFocus: HTMLElement | null) => { pendingSavedDocumentRef.current = null; setCleanupPending(false); setSaveError(''); setRestoredDraft(false); setRecoveryOnlyDraft(false); setEditorMode('edit'); editorReturnFocusRef.current = returnFocus; setSelected(null); editorBaselineRef.current = toForm(agent); setForm(toForm(agent)); };

  const finalizeSavedDocument = (savedDocument: AgentWorkforceDocument): boolean => {
    const storageRevision = draftStorageRevisionRef.current ?? document?.revision;
    const cleared = storageRevision ? persistAgentWorkforceDraft(window.sessionStorage, storageRevision, ownerId, view, null) : { ok: true as const, warning: '' };
    if (!cleared.ok) {
      pendingSavedDocumentRef.current = savedDocument;
      setCleanupPending(true);
      setDraftWarning(cleared.warning);
      setSaveError('The agent was saved, but its recovery snapshot could not be cleared. Keep this editor open and select Save agent again to retry cleanup.');
      return false;
    }
    pendingSavedDocumentRef.current = null;
    setCleanupPending(false);
    draftStorageRevisionRef.current = null;
    setDraftReadyRevision(savedDocument.revision);
    setDocument(savedDocument);
    setRestoredDraft(false);
    setDraftWarning('');
    editorBaselineRef.current = null;
    setEditorMode('create');
    setForm(null);
    return true;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!document || !form || savingRef.current) return;
    if (pendingSavedDocumentRef.current) { finalizeSavedDocument(pendingSavedDocumentRef.current); return; }
    if (recoveryOnlyDraft) { setSaveError('This is a recovery-only snapshot. Copy the needed values, close it, then edit the latest saved agent.'); return; }
    setSaveError('');
    const existing = editorBaselineRef.current && form.id ? document.agents.find((agent) => agent.id === form.id) : undefined;
    const desiredId = existing?.id ?? (form.id || slugifyAgentId(form.name, form.role));
    const id = existing?.id ?? (form.id || uniqueAgentId(desiredId, document.agents.map((agent) => agent.id)));
    const capabilities = textToList(form.capabilities_text);
    const inputs = textToList(form.inputs_text);
    const outputs = textToList(form.outputs_text);
    if ([capabilities, inputs, outputs].some((items) => items.length > 20)) {
      setSaveError('Capabilities, inputs, and outputs are limited to 20 items each.');
      return;
    }
    const normalized = formAgentToDefinition({ ...form, id, capabilities_text: capabilities.join('\n'), inputs_text: inputs.join('\n'), outputs_text: outputs.join('\n') });
    if (!editorBaselineRef.current) {
      const requestDraft = toForm(normalized);
      const persisted = persistAgentWorkforceDraft(window.sessionStorage, document.revision, ownerId, view, requestDraft);
      if (!persisted.ok) { setDraftWarning(persisted.warning); setSaveError('The create request was blocked because its stable recovery identity could not be saved in this tab.'); return; }
      draftStorageRevisionRef.current = document.revision;
      setForm(requestDraft);
    }
    const nextAgents = existing ? document.agents.map((agent) => agent.id === existing.id ? normalized : agent) : [...document.agents, normalized];
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch('/api/agent-workforce', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agents: nextAgents.map(toInput), skills: document.skills.map(toSkillInput), expected_revision: document.revision }) });
      const data = await response.json() as { document?: AgentWorkforceDocument; error?: string };
      if (response.status === 409) {
        const reloadResponse = await fetch('/api/agent-workforce', { cache: 'no-store' });
        const reloadData = await reloadResponse.json() as { document?: AgentWorkforceDocument; error?: string };
        if (reloadResponse.ok && reloadData.document) {
          let reconciled = form;
          let resolution = 'Your changes were safely reapplied to the latest version.';
          const latestAgent = reloadData.document.agents.find((agent) => agent.id === form.id);
          if (!editorBaselineRef.current) {
            if (latestAgent) {
              if (!sameAgentDefinition(toInput(latestAgent), normalized)) throw new Error('This create ID now belongs to different agent data. Your draft is preserved; close and reload before continuing.');
              finalizeSavedDocument(reloadData.document);
              return;
            }
            setDocument(reloadData.document);
            setSaveError('Another tab changed the workforce. Your stable create request is preserved; review it, then save again.');
            return;
          }
          if (!latestAgent) throw new Error('The latest agent could not be safely reconciled. Your revision-bound draft is preserved; close and reload before continuing.');
          if (latestAgent && editorBaselineRef.current) {
            const latestForm = toForm(latestAgent);
            const result = reconcileAgentWorkforceDraft(editorBaselineRef.current, form, latestForm);
            reconciled = result.form;
            if (result.conflicts.length > 0) {
              const labels = result.conflicts.join(', ');
              const details = result.conflicts.map((key) => `${key}: your draft ${JSON.stringify(form[key])}; latest ${JSON.stringify(latestForm[key])}`).join('\n');
              const keepDraft = window.confirm(`Another tab also changed these fields:\n${details}\n\nPress OK to keep your draft values, or Cancel to use the latest saved values.`);
              if (!keepDraft) {
                reconciled = { ...reconciled };
                for (const key of result.conflicts) Object.assign(reconciled, { [key]: latestForm[key] });
              }
              resolution = keepDraft ? `You chose your draft values for: ${labels}.` : `You chose the latest saved values for: ${labels}.`;
            }
            editorBaselineRef.current = toForm(latestAgent);
          }
          setDraftReadyRevision(reloadData.document.revision);
          setDocument(reloadData.document);
          setForm(reconciled);
          setSaveError(`Another tab changed the workforce. ${resolution} Review the merged draft, then save again.`);
          return;
        }
        throw new Error(reloadData.error || data.error || 'The workforce changed, but the latest version could not be loaded. Your draft is still preserved.');
      }
      if (!response.ok || !data.document) throw new Error(data.error || 'The agent could not be saved.');
      finalizeSavedDocument(data.document);
    } catch (caught) { setSaveError(caught instanceof Error ? caught.message : 'The agent could not be saved.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  if (loading) return <div className="grid min-h-[480px] place-items-center rounded-2xl border border-white/[0.07] bg-[#0b0c0f]"><div className="flex items-center gap-3 text-sm text-zinc-400"><span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-400" /> Loading AI workforce…</div></div>;
  if (!document) return <div role="alert" className="max-w-full break-words rounded-2xl border border-rose-400/20 [overflow-wrap:anywhere] bg-rose-400/5 p-6 text-sm text-rose-300"><p>{error || 'The AI workforce is unavailable.'}</p><button onClick={() => void load()} className="mt-4 min-h-11 rounded-lg border border-rose-400/20 px-3 py-2">Try again</button></div>;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#090a0d] p-4 shadow-2xl sm:p-6">
      <div className="pointer-events-none absolute left-1/3 top-0 h-72 w-72 rounded-full bg-blue-600/10 blur-[100px]" />
      <div className="relative">
        <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-blue-300/70"><Sparkles size={13} /> AI Workforce</div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{view === 'core' ? 'Core Agents' : 'Sub-agents'}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{view === 'core' ? 'Department leaders that own outcomes, coordinate specialist workers, and report to Jarvis.' : 'Focused workers that research, create, monitor, verify, and prepare work for their department leader.'}</p></div>
          <button onClick={(event) => openCreate(event.currentTarget)} className={`${FOCUS_RING} flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500`}><Plus size={16} /> Create agent</button>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Core agents', value: summary.core, icon: Users },
            { label: 'Sub-agents', value: summary.subagents, icon: Bot },
            { label: 'Approval gated', value: summary.approvalGated, icon: ShieldCheck },
            { label: 'Overall build', value: `${summary.overallProgress}%`, icon: Activity },
          ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5 sm:p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-zinc-400"><Icon size={13} />{label}</div><p className="mt-2 text-xl font-semibold text-zinc-100">{value}</p></div>)}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-zinc-400"><Clock3 size={12} /> Build stages</span>
          {([['planned', summary.planned], ['designed', summary.designed], ['building', summary.building], ['testing', summary.testing], ['live', summary.live], ['paused', summary.paused]] as const).map(([stage, count]) => (
            <span key={stage} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${STATUS_STYLE[stage]}`}>{STATUS_LABEL[stage]} {count}</span>
          ))}
        </div>

        {summary.milestonesNeedingAttention.length > 0 && (
          <div className="mt-3 min-w-0 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100">
            <p className="font-medium">{summary.milestonesNeedingAttention.length} {summary.milestonesNeedingAttention.length === 1 ? 'agent needs' : 'agents need'} a next milestone</p>
            <p className="mt-1 break-words text-amber-100/80 [overflow-wrap:anywhere]">{summary.milestonesNeedingAttention.map((agent) => agent.name).join(', ')}</p>
          </div>
        )}

        {error && <div role="alert" className="mt-5 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-300"><span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{error}</span><button onClick={() => void load()} className={`${FOCUS_RING} min-h-11 shrink-0 rounded px-2 underline`}>Reload</button></div>}
        {draftWarning && !form && <div role="alert" className="mt-5 max-w-full break-words rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 [overflow-wrap:anywhere]">{draftWarning}</div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <label className="relative min-w-[12rem] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" /><span className="sr-only">Search agents</span><input ref={searchInputRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, role, capability, or department" className={`${FOCUS_RING} min-h-11 w-full rounded-xl border border-zinc-500 bg-[#18181b] pl-9 pr-3 text-base text-white placeholder:text-zinc-400 sm:text-sm focus:border-blue-400/40`} /></label>
          <label><span className="sr-only">Filter by build stage</span><select value={status} onChange={(e) => setStatus(e.target.value as 'all' | AgentStatus)} className={SELECT_CLASS}><option value="all">All build stages</option>{AGENT_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABEL[item]}</option>)}</select></label>
          <label><span className="sr-only">Filter by autonomy level</span><select value={autonomy} onChange={(e) => setAutonomy(e.target.value as 'all' | AgentAutonomy)} className={SELECT_CLASS}><option value="all">All autonomy levels</option>{AGENT_AUTONOMY.map((item) => <option key={item} value={item}>{AUTONOMY_LABEL[item]}</option>)}</select></label>
          {view === 'subagent' && <label><span className="sr-only">Filter by core agent</span><select value={parent} onChange={(e) => setParent(e.target.value)} className={SELECT_CLASS}><option value="all">All core agents</option>{coreAgents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        </div>

        <p aria-live="polite" className="mt-2 text-xs text-zinc-400">Showing {agents.length} of {view === 'core' ? summary.core : summary.subagents} {view === 'core' ? 'core agents' : 'sub-agents'}.</p>

        {agents.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-white/10 py-16 text-center"><Bot className="mx-auto text-zinc-400" /><p className="mt-3 text-sm text-zinc-400">No agents match this view.</p><button onClick={(event) => openCreate(event.currentTarget)} className={`${FOCUS_RING} mt-4 min-h-11 rounded px-2 text-sm text-blue-400`}>Create the first one</button></div> : (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {agents.map((agent) => <AgentCard key={agent.id} agent={agent} childCount={agent.type === 'core' ? document.agents.filter((item) => item.parent_id === agent.id).length : undefined} parentName={agent.parent_id ? coreAgents.find((item) => item.id === agent.parent_id)?.name : undefined} onEdit={(opener) => openEdit(agent, opener)} onOpen={(opener) => { detailOpenerRef.current = opener; setSelected(agent); }} />)}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-zinc-400">Status and progress above are manually maintained blueprint fields. Live Hermes schedules, runs, approvals, failures, and telemetry are not connected yet.</div>
      </div>
      {selected && <DetailPanel agent={selected} teamMembers={document.agents.filter((agent) => agent.parent_id === selected.id)} returnFocusRef={detailOpenerRef} fallbackFocusRef={searchInputRef} onClose={() => setSelected(null)} onEdit={() => openEdit(selected, detailOpenerRef.current)} />}
      {form && <AgentEditor form={form} coreAgents={coreAgents} saving={saving} cleanupPending={cleanupPending} creating={editorMode === 'create'} recoveryOnly={recoveryOnlyDraft} error={[saveError, draftWarning].filter(Boolean).join(' ')} initiallyDirty={restoredDraft} returnFocusRef={editorReturnFocusRef} fallbackFocusRef={searchInputRef} onChange={setForm} onClose={() => { if (!saving) { setRestoredDraft(false); setRecoveryOnlyDraft(false); editorBaselineRef.current = null; setEditorMode('create'); setForm(null); } }} onSubmit={(event) => void save(event)} />}
    </div>
  );
}
