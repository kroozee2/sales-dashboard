"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { SubTabs } from "@/components/sub-tabs";
import { usePerson } from "@/lib/use-person";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  name: string;
  emoji: string;
  stage: Stage;
  priority: string;          // high | medium | low
  department: string | null; // department key, or null
  goal_id: string | null;
  due_date: string | null;
  owner: Owner;
  notes: string | null;
  sort_order: number;
  task_total: number;
  task_done: number;
  created_at: string;
}
interface Goal { id: string; name: string; emoji: string; }
type Owner = "Andrew" | "Jameson";
type Stage = "planning" | "in_progress" | "on_hold" | "done";

const OWNERS: Owner[] = ["Andrew", "Jameson"];
const ownerEmoji = (o: string) => (o === "Jameson" ? "🧑" : "🧔");

// Same owner color language as the Tasks sheet: Andrew = blue, Jameson = violet.
const OWNER_STYLE: Record<Owner, { chip: string; accent: string }> = {
  Andrew: { chip: "bg-blue-500/20 text-blue-300 border-blue-500/40", accent: "border-l-blue-500" },
  Jameson: { chip: "bg-violet-500/20 text-violet-300 border-violet-500/40", accent: "border-l-violet-500" },
};

const STAGES: { key: Stage; label: string; chip: string }[] = [
  { key: "planning", label: "Planning", chip: "bg-rose-500/20 text-rose-300" },
  { key: "in_progress", label: "In Progress", chip: "bg-blue-500/20 text-blue-300" },
  { key: "on_hold", label: "On Hold", chip: "bg-zinc-600/40 text-zinc-300" },
  { key: "done", label: "Done", chip: "bg-emerald-500/20 text-emerald-300" },
];
const stg = (k: string) => STAGES.find((s) => s.key === k) ?? STAGES[0];

// Importance — the primary sort within each month block.
type Priority = "high" | "medium" | "low";
const PRIORITIES: { key: Priority; label: string; emoji: string; chip: string; dot: string }[] = [
  { key: "high", label: "High", emoji: "🔴", chip: "bg-rose-500/15 text-rose-200 border-rose-500/40", dot: "bg-rose-500" },
  { key: "medium", label: "Medium", emoji: "🟠", chip: "bg-amber-500/15 text-amber-200 border-amber-500/40", dot: "bg-amber-400" },
  { key: "low", label: "Low", emoji: "⚪", chip: "bg-zinc-600/25 text-zinc-300 border-zinc-600/50", dot: "bg-zinc-500" },
];
const prio = (k?: string | null) => PRIORITIES.find((p) => p.key === k) ?? PRIORITIES[1];
const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Which part of the business a project belongs to.
const DEPARTMENTS: { key: string; label: string; emoji: string; chip: string }[] = [
  { key: "sales", label: "Sales", emoji: "💰", chip: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" },
  { key: "marketing", label: "Marketing", emoji: "📣", chip: "bg-pink-500/15 text-pink-200 border-pink-500/30" },
  { key: "content", label: "Content", emoji: "✍️", chip: "bg-sky-500/15 text-sky-200 border-sky-500/30" },
  { key: "fulfillment", label: "Fulfillment", emoji: "🤝", chip: "bg-violet-500/15 text-violet-200 border-violet-500/30" },
  { key: "product", label: "Product / Apps", emoji: "🛠️", chip: "bg-cyan-500/15 text-cyan-200 border-cyan-500/30" },
  { key: "operations", label: "Operations", emoji: "⚙️", chip: "bg-zinc-500/20 text-zinc-200 border-zinc-500/40" },
  { key: "finance", label: "Finance", emoji: "📊", chip: "bg-teal-500/15 text-teal-200 border-teal-500/30" },
  { key: "team", label: "Team", emoji: "👥", chip: "bg-orange-500/15 text-orange-200 border-orange-500/30" },
];
const dept = (k?: string | null) => DEPARTMENTS.find((d) => d.key === k);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthLabel(s: string | null) {
  if (!s) return "No date yet";
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function fmtDue(s: string | null) {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}
function daysLeft(s: string | null) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86400000);
}
// Most important first, then soonest due.
function sortByImportance(items: Project[]) {
  return [...items].sort((a, b) => {
    const pr = (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1);
    if (pr !== 0) return pr;
    return (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1;
  });
}

// ─── Reusable inline chip-selects ─────────────────────────────────────────────
function PrioritySelect({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  const p = prio(value);
  return (
    <select value={value ?? "medium"} onChange={(e) => onChange(e.target.value)} title="Priority"
      className={`appearance-none cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-semibold border focus:outline-none focus:ring-1 focus:ring-blue-500 ${p.chip} ${className}`}>
      {PRIORITIES.map((x) => <option key={x.key} value={x.key} className="bg-zinc-900 text-white">{x.emoji} {x.label}</option>)}
    </select>
  );
}
function DepartmentSelect({ value, onChange, className = "" }: { value: string | null; onChange: (v: string | null) => void; className?: string }) {
  const d = dept(value);
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} title="Department"
      className={`appearance-none cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium border focus:outline-none focus:ring-1 focus:ring-blue-500 ${d ? d.chip : "bg-zinc-800/60 text-zinc-500 border-zinc-700"} ${className}`}>
      <option value="" className="bg-zinc-900 text-white">🏢 Department…</option>
      {DEPARTMENTS.map((x) => <option key={x.key} value={x.key} className="bg-zinc-900 text-white">{x.emoji} {x.label}</option>)}
    </select>
  );
}
function OwnerSelect({ value, onChange, className = "" }: { value: Owner; onChange: (v: Owner) => void; className?: string }) {
  const ow = OWNER_STYLE[value] ?? OWNER_STYLE.Andrew;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Owner)} title="Who's responsible"
      className={`appearance-none cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-semibold border focus:outline-none focus:ring-1 focus:ring-blue-500 ${ow.chip} ${className}`}>
      {OWNERS.map((o) => <option key={o} value={o} className="bg-zinc-900 text-white">{ownerEmoji(o)} {o}</option>)}
    </select>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [person] = usePerson();

  const load = useCallback(() => {
    fetch("/api/projects").then((r) => r.json()).then((d) => setProjects(Array.isArray(d) ? d : []));
    fetch("/api/goals").then((r) => r.json()).then((d) => setGoals(Array.isArray(d) ? d : []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = useCallback(async (id: string, updates: Partial<Project>) => {
    setProjects((prev) => prev?.map((p) => (p.id === id ? { ...p, ...updates } : p)) ?? prev);
    await fetch("/api/projects", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
  }, []);
  const remove = useCallback(async (id: string) => {
    setProjects((prev) => prev?.filter((p) => p.id !== id) ?? prev);
    await fetch("/api/projects", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  }, []);
  const add = useCallback(async (payload: Partial<Project>) => {
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const created = await res.json();
    if (created?.id) setProjects((prev) => [{ ...created, task_total: 0, task_done: 0 }, ...(prev ?? [])]);
  }, []);

  const filtered = useMemo(() => (projects ?? []).filter((p) => person === "all" || p.owner === person), [projects, person]);

  // Group into month blocks (by due date), each sorted by importance. No-date block last.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; sortKey: string; items: Project[] }>();
    for (const p of filtered) {
      const key = p.due_date ? p.due_date.slice(0, 7) : "none";
      if (!map.has(key)) map.set(key, { key, label: monthLabel(p.due_date), sortKey: key === "none" ? "9999-99" : key, items: [] });
      map.get(key)!.items.push(p);
    }
    const arr = Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    for (const g of arr) g.items = sortByImportance(g.items);
    return arr;
  }, [filtered]);

  const active = filtered.filter((p) => p.stage !== "done").length;
  const [view, setView] = useState<"sheet" | "grid">("sheet");

  return (
    <div className="w-full">
      <SubTabs group="tasks" />
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">🗂️ Projects</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{active} active · {filtered.length} total · grouped by month, most important first</p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {([["sheet", "▦ Sheet"], ["grid", "🗂️ Grid"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${view === k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{l}</button>
          ))}
        </div>
      </div>

      <QuickAddProject goals={goals} defaultOwner={person === "all" ? "Andrew" : person} onAdd={add} />

      {!projects ? (
        <p className="text-zinc-600 text-center py-16 animate-pulse">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-600 text-center py-16">
          {person === "all" ? "No projects yet. Add your first one above ↑" : `No projects for ${person} yet. Add one above ↑`}
        </p>
      ) : (
        <div className={`mt-5 space-y-7 ${view === "grid" ? "max-w-5xl" : ""}`}>
          {groups.map((g) => (
            <section key={g.key}>
              {/* Month block header */}
              <div className="flex items-center gap-2.5 mb-2.5">
                <h2 className="text-white font-bold text-sm">📆 {g.label}</h2>
                <span className="text-[11px] text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5">{g.items.length}</span>
                <div className="flex-1 h-px bg-zinc-800/70" />
              </div>
              {view === "sheet"
                ? <ProjectSheet projects={g.items} goals={goals} onPatch={patch} onRemove={remove} />
                : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {g.items.map((p) => <ProjectCard key={p.id} project={p} goals={goals} onPatch={patch} onRemove={remove} />)}
                  </div>
                )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Project spreadsheet (one month block) ────────────────────────────────────
// Rows come in pre-sorted by importance. Every field is editable in place.
function ProjectSheet({ projects, goals, onPatch, onRemove }: {
  projects: Project[]; goals: Goal[];
  onPatch: (id: string, u: Partial<Project>) => void; onRemove: (id: string) => void;
}) {
  const cell = "bg-transparent focus:bg-zinc-950 border border-transparent focus:border-blue-500/50 rounded-md px-2 py-1 text-sm focus:outline-none w-full transition-colors";

  return (
    <div className="border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[980px]">
          <thead>
            <tr className="bg-zinc-900/80 border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-2 font-semibold w-9"></th>
              <th className="px-3 py-2 font-semibold min-w-[240px]">Project</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Priority</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Department</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Who</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Stage</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Due</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap min-w-[140px]">Progress</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Goal</th>
              <th className="px-3 py-2 font-semibold w-9"></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => {
              const s = stg(p.stage);
              const ow = OWNER_STYLE[p.owner] ?? OWNER_STYLE.Andrew;
              const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;
              const dl = daysLeft(p.due_date);
              const overdue = dl !== null && dl < 0 && p.stage !== "done";
              return (
                <tr key={p.id}
                  className={`group border-b border-zinc-800/60 border-l-[3px] ${ow.accent} hover:bg-zinc-800/30 transition-colors ${i % 2 ? "bg-zinc-900/30" : ""} ${p.stage === "done" ? "opacity-50" : ""}`}>
                  <td className="px-2 py-1.5 align-middle">
                    <input defaultValue={p.emoji}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.emoji) onPatch(p.id, { emoji: v }); }}
                      className={`${cell} text-center text-base w-9`} />
                  </td>
                  <td className="px-1 py-1.5 align-middle">
                    <input defaultValue={p.name}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) onPatch(p.id, { name: v }); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className={`${cell} font-semibold text-white`} />
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <PrioritySelect value={p.priority} onChange={(v) => onPatch(p.id, { priority: v })} />
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <DepartmentSelect value={p.department} onChange={(v) => onPatch(p.id, { department: v })} />
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <OwnerSelect value={p.owner} onChange={(v) => onPatch(p.id, { owner: v })} />
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <select value={p.stage} onChange={(e) => onPatch(p.id, { stage: e.target.value as Stage })}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${s.chip}`}>
                      {STAGES.map((x) => <option key={x.key} value={x.key} className="bg-zinc-900 text-zinc-200">{x.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={p.due_date ?? ""}
                        onChange={(e) => onPatch(p.id, { due_date: e.target.value || null })}
                        className={`bg-zinc-950/70 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${overdue ? "text-red-400" : "text-zinc-300"}`} />
                      {dl !== null && p.stage !== "done" && (
                        <span className={`text-[11px] ${overdue ? "text-red-400 font-semibold" : dl <= 3 ? "text-amber-300" : "text-zinc-600"}`}>
                          {overdue ? `${Math.abs(dl)}d over` : dl === 0 ? "today" : `${dl}d`}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 align-middle">
                    {p.task_total > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden min-w-[60px]">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-zinc-500 tabular-nums whitespace-nowrap">{p.task_done}/{p.task_total}</span>
                      </div>
                    ) : <span className="text-zinc-700 text-xs">no tasks</span>}
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <select value={p.goal_id ?? ""} onChange={(e) => onPatch(p.id, { goal_id: e.target.value || null })}
                      className={`bg-zinc-950/70 border border-zinc-800 rounded-lg px-2 py-1 text-xs max-w-[170px] focus:outline-none focus:border-blue-500 ${p.goal_id ? "text-zinc-200" : "text-zinc-600"}`}>
                      <option value="">—</option>
                      {goals.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <button onClick={() => onRemove(p.id)} title="Delete"
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-sm transition-opacity">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Quick add ─────────────────────────────────────────────────────────────────
function QuickAddProject({ goals, defaultOwner, onAdd }: { goals: Goal[]; defaultOwner: Owner; onAdd: (p: Partial<Project>) => void }) {
  const [name, setName] = useState("");
  const [stage, setStage] = useState<Stage>("planning");
  const [priority, setPriority] = useState<Priority>("medium");
  const [department, setDepartment] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [owner, setOwner] = useState<Owner>(defaultOwner);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setOwner(defaultOwner); }, [defaultOwner]);

  function submit() {
    const n = name.trim();
    if (!n) return;
    onAdd({ name: n, stage, priority, department, due_date: due, goal_id: goalId, owner });
    setName(""); setDue(null); setGoalId(null); setStage("planning"); setPriority("medium"); setDepartment(null); setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <span className="text-zinc-600 text-lg pl-1">＋</span>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Add a project…"
          className="flex-1 bg-transparent text-white placeholder-zinc-600 text-[15px] focus:outline-none py-1"
        />
        <button onClick={submit} disabled={!name.trim()} className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">Add</button>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
          <label className="text-[11px] text-zinc-500 uppercase tracking-wide">Priority</label>
          <PrioritySelect value={priority} onChange={(v) => setPriority(v as Priority)} />
          <label className="text-[11px] text-zinc-500 uppercase tracking-wide ml-1">Dept</label>
          <DepartmentSelect value={department} onChange={setDepartment} />
          <span className="w-px h-5 bg-zinc-800 mx-0.5" />
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500">
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <input type="date" value={due ?? ""} onChange={(e) => setDue(e.target.value || null)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500" />
          <select value={goalId ?? ""} onChange={(e) => setGoalId(e.target.value || null)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 max-w-[180px]">
            <option value="">🏁 Link a goal…</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
          </select>
          <OwnerSelect value={owner} onChange={setOwner} />
        </div>
      )}
    </div>
  );
}

// ─── Project card (grid) ───────────────────────────────────────────────────────
function ProjectCard({ project, goals, onPatch, onRemove }: { project: Project; goals: Goal[]; onPatch: (id: string, u: Partial<Project>) => void; onRemove: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const goal = goals.find((g) => g.id === project.goal_id);
  const s = stg(project.stage);
  const p = prio(project.priority);
  const pct = project.task_total > 0 ? Math.round((project.task_done / project.task_total) * 100) : 0;
  const dl = daysLeft(project.due_date);
  const overdue = dl !== null && dl < 0 && project.stage !== "done";
  const ow = OWNER_STYLE[project.owner] ?? OWNER_STYLE.Andrew;

  useEffect(() => { setName(project.name); }, [project.name]);
  function saveName() {
    const n = name.trim();
    setEditing(false);
    if (n && n !== project.name) onPatch(project.id, { name: n });
    else setName(project.name);
  }

  return (
    <div className={`group bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 border-l-[3px] ${ow.accent} rounded-2xl p-3.5 transition-colors flex flex-col ${project.stage === "done" ? "opacity-60" : ""}`}>
      {/* Title row — full title, wraps, never cut off */}
      <div className="flex items-start gap-2">
        <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${p.dot}`} title={`${p.label} priority`} />
        <span className="text-lg leading-none flex-shrink-0">{project.emoji}</span>
        {editing ? (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName}
            onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setName(project.name); setEditing(false); } }}
            className="flex-1 bg-transparent text-white font-semibold focus:outline-none border-b border-blue-500 min-w-0" />
        ) : (
          <button onClick={() => setEditing(true)} className="flex-1 text-left min-w-0">
            <span className="text-white font-semibold text-[15px] leading-snug break-words">{project.name}</span>
          </button>
        )}
        <button onClick={() => onRemove(project.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-sm transition-opacity flex-shrink-0" title="Delete">✕</button>
      </div>

      {/* Responsible + priority + department — all editable */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <OwnerSelect value={project.owner} onChange={(v) => onPatch(project.id, { owner: v })} />
        <PrioritySelect value={project.priority} onChange={(v) => onPatch(project.id, { priority: v })} />
        <DepartmentSelect value={project.department} onChange={(v) => onPatch(project.id, { department: v })} />
      </div>

      {/* Stage + due + goal */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2.5 text-xs">
        <select value={project.stage} onChange={(e) => onPatch(project.id, { stage: e.target.value as Stage })}
          className={`appearance-none cursor-pointer rounded-full px-2 py-0.5 font-medium focus:outline-none ${s.chip}`}>
          {STAGES.map((x) => <option key={x.key} value={x.key} className="bg-zinc-900 text-white">{x.label}</option>)}
        </select>
        {project.due_date && (
          <span className={overdue ? "text-red-400 font-medium" : "text-zinc-500"}>
            📅 {fmtDue(project.due_date)}{dl !== null && (overdue ? ` · ${Math.abs(dl)}d over` : dl === 0 ? " · today" : ` · ${dl}d`)}
          </span>
        )}
        {project.task_total > 0 && <span className="text-zinc-500">✅ {project.task_done}/{project.task_total}</span>}
      </div>

      {/* Progress bar */}
      {project.task_total > 0 && (
        <div className="mt-2.5 h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Goal link */}
      <div className="mt-2.5 pt-2.5 border-t border-zinc-800/70">
        <select value={project.goal_id ?? ""} onChange={(e) => onPatch(project.id, { goal_id: e.target.value || null })}
          className="appearance-none cursor-pointer bg-transparent text-zinc-500 hover:text-zinc-300 text-xs focus:outline-none max-w-full">
          <option value="" className="bg-zinc-900 text-white">🏁 No goal linked</option>
          {goals.map((g) => <option key={g.id} value={g.id} className="bg-zinc-900 text-white">{g.emoji} {g.name}</option>)}
        </select>
      </div>
    </div>
  );
}
