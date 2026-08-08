"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { SubTabs } from "@/components/sub-tabs";
import { usePerson } from "@/lib/use-person";
import { Ring } from "@/components/winning-formula";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Task {
  id: string;
  name: string;
  urgency: Urgency;
  due_date: string | null;
  project_id: string | null;
  owner: Owner;
  notes: string | null;
  status: string;
  done: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}
interface Project {
  id: string;
  name: string;
  emoji: string;
  goal_id: string | null;
}
type Owner = "Andrew" | "Jameson";
type Urgency = "low" | "medium" | "high" | "urgent";

const OWNERS: Owner[] = ["Andrew", "Jameson"];
const ownerEmoji = (o: string) => (o === "Jameson" ? "🧑" : "🧔");

// Owner color language, used across the sheet: Andrew = blue, Jameson = violet.
const OWNER_STYLE: Record<Owner, { chip: string; accent: string }> = {
  Andrew: { chip: "bg-blue-500/20 text-blue-300 border-blue-500/40", accent: "border-l-blue-500" },
  Jameson: { chip: "bg-violet-500/20 text-violet-300 border-violet-500/40", accent: "border-l-violet-500" },
};

// The sheet's sections, top to bottom — the order you should work the list in.
const SECTIONS: { key: Bucket; label: string; emoji: string; head: string; row: string }[] = [
  { key: "overdue", label: "Overdue", emoji: "❌", head: "text-red-400", row: "bg-red-500/[0.06]" },
  { key: "today", label: "Due today", emoji: "📌", head: "text-amber-400", row: "bg-amber-500/[0.06]" },
  { key: "upcoming", label: "Upcoming", emoji: "🚀", head: "text-blue-400", row: "" },
  { key: "someday", label: "Someday · no date", emoji: "💭", head: "text-zinc-400", row: "" },
  { key: "done", label: "Done", emoji: "✅", head: "text-emerald-400", row: "" },
];

const STATUSES: { key: string; label: string; emoji: string; chip: string }[] = [
  { key: "todo", label: "To Do", emoji: "⬜", chip: "bg-zinc-700/60 text-zinc-300" },
  { key: "in_progress", label: "In Progress", emoji: "🔄", chip: "bg-sky-500/20 text-sky-300" },
  { key: "blocked", label: "Blocked", emoji: "🚧", chip: "bg-rose-500/20 text-rose-300" },
  { key: "done", label: "Done", emoji: "✅", chip: "bg-emerald-500/20 text-emerald-300" },
];
const statusOf = (t: Task) => STATUSES.find((s) => s.key === (t.status || (t.done ? "done" : "todo"))) ?? STATUSES[0];

const URGENCY: { key: Urgency; label: string; emoji: string; chip: string }[] = [
  { key: "low", label: "Low", emoji: "🌱", chip: "bg-zinc-700/50 text-zinc-300" },
  { key: "medium", label: "Medium", emoji: "👌", chip: "bg-amber-500/20 text-amber-300" },
  { key: "high", label: "High", emoji: "🔥", chip: "bg-orange-500/25 text-orange-300" },
  { key: "urgent", label: "Urgent", emoji: "🏆", chip: "bg-red-500/25 text-red-300" },
];
const urg = (k: string) => URGENCY.find((u) => u.key === k) ?? URGENCY[1];

// ─── Date helpers ─────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDue(s: string | null) {
  if (!s) return "";
  const t = todayStr();
  if (s === t) return "Today";
  if (s === addDays(1)) return "Tomorrow";
  if (s === addDays(-1)) return "Yesterday";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

type Bucket = "overdue" | "today" | "upcoming" | "someday" | "done";
function bucketOf(t: Task): Bucket {
  if (t.done) return "done";
  if (!t.due_date) return "someday";
  const today = todayStr();
  if (t.due_date < today) return "overdue";
  if (t.due_date === today) return "today";
  return "upcoming";
}
// ─── Page ─────────────────────────────────────────────────────────────────────
// Execution = the Winning Formula (who you're being) + the task sheet (what you're
// shipping), under one score. Both halves are editable in place, any time.
export default function ExecutionPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [person] = usePerson();
  const [showDone, setShowDone] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tasks").then((r) => r.json()).then((d) => setTasks(Array.isArray(d) ? d : []));
    fetch("/api/projects").then((r) => r.json()).then((d) => setProjects(Array.isArray(d) ? d : []));
  }, []);

  // ── Task mutations (optimistic) ──
  const patch = useCallback(async (id: string, updates: Partial<Task>) => {
    setTasks((prev) => prev?.map((t) => (t.id === id ? { ...t, ...updates } : t)) ?? prev);
    await fetch("/api/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
  }, []);
  const remove = useCallback(async (id: string) => {
    setTasks((prev) => prev?.filter((t) => t.id !== id) ?? prev);
    await fetch("/api/tasks", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  }, []);
  const add = useCallback(async (payload: Partial<Task>) => {
    const res = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const created = await res.json();
    if (created?.id) setTasks((prev) => [created, ...(prev ?? [])]);
  }, []);

  // ── Scoped to the selected person ──
  const filtered = useMemo(() => (tasks ?? []).filter((t) => person === "all" || t.owner === person), [tasks, person]);

  const grouped = useMemo(() => {
    const g: Record<Bucket, Task[]> = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
    for (const t of filtered) g[bucketOf(t)].push(t);
    return g;
  }, [filtered]);

  const openCount = filtered.filter((t) => !t.done).length;
  const doneToday = filtered.filter((t) => t.done && t.completed_at?.slice(0, 10) === todayStr()).length;
  const selected = tasks?.find((t) => t.id === selectedId) ?? null;

  // ── How much of today's list is cleared. (The Winning Formula lives on its
  //    own tab now, so this page scores tasks only.) ──
  const dueToday = grouped.overdue.length + grouped.today.length;
  const taskPct = dueToday + doneToday > 0 ? Math.round((doneToday / (dueToday + doneToday)) * 100) : null;
  const clear = dueToday === 0 && doneToday > 0;

  return (
    <div className="w-full">
      <SubTabs group="tasks" />

      {/* ── Header: today's list at a glance ────────────────────────────────── */}
      <div className={`bg-zinc-900 border rounded-2xl p-4 sm:p-5 mb-4 ${clear ? "border-emerald-500/50" : "border-zinc-800"}`}>
        {/* On a phone the ring + headline sit on one row and the three numbers
            get their own full-width row underneath, so nothing gets squeezed. */}
        <div className="flex items-center gap-3 sm:gap-5">
          <Ring pct={taskPct ?? 0} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {clear ? "🏆 Nothing left due" : "📋 Tasks"}
            </h1>
            <p className="text-zinc-500 text-xs sm:text-sm mt-0.5">
              {clear
                ? "Everything due today is done. Anything you knock out now is ahead of schedule."
                : dueToday > 0
                  ? `${dueToday} to clear today, in the order to work it.`
                  : "Nothing due today."}
            </p>
          </div>
          {/* the three numbers worth glancing at — beside the headline on desktop */}
          <div className="hidden sm:flex gap-4 sm:gap-5">
            <Stat n={grouped.overdue.length} label="Overdue" tone={grouped.overdue.length > 0 ? "text-red-400" : "text-zinc-600"} />
            <Stat n={grouped.today.length} label="Due today" tone={grouped.today.length > 0 ? "text-amber-400" : "text-zinc-600"} />
            <Stat n={doneToday} label="Done today" tone={doneToday > 0 ? "text-emerald-400" : "text-zinc-600"} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:hidden mt-3 pt-3 border-t border-zinc-800">
          <Stat n={grouped.overdue.length} label="Overdue" tone={grouped.overdue.length > 0 ? "text-red-400" : "text-zinc-600"} />
          <Stat n={grouped.today.length} label="Due today" tone={grouped.today.length > 0 ? "text-amber-400" : "text-zinc-600"} />
          <Stat n={doneToday} label="Done today" tone={doneToday > 0 ? "text-emerald-400" : "text-zinc-600"} />
        </div>
      </div>

      {/* ── The task sheet ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-white font-bold text-sm">📋 Tasks <span className="text-zinc-600 font-normal">· {openCount} open</span></p>
        <button onClick={() => setShowDone((s) => !s)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showDone ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
          ✅ Done {showDone ? "shown" : "hidden"}
        </button>
      </div>

      <QuickAdd projects={projects} defaultOwner={person === "all" ? "Andrew" : person} onAdd={add} />

      {!tasks ? (
        <p className="text-zinc-600 text-center py-16 animate-pulse">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-600 text-center py-16">
          {person === "all" ? "No tasks yet. Add your first one above ↑" : `No tasks for ${person} yet. Add one above ↑`}
        </p>
      ) : (
        <TaskSheet
          tasks={filtered}
          projects={projects}
          showDone={showDone}
          onPatch={patch}
          onRemove={remove}
          onOpen={setSelectedId}
        />
      )}

      {selected && (
        <TaskPanel
          task={selected}
          projects={projects}
          onPatch={patch}
          onRemove={(id) => { remove(id); setSelectedId(null); }}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-extrabold tabular-nums leading-none ${tone}`}>{n}</p>
      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-1 whitespace-nowrap">{label}</p>
    </div>
  );
}

// ─── Quick add bar ─────────────────────────────────────────────────────────────
function QuickAdd({ projects, defaultOwner, onAdd }: { projects: Project[]; defaultOwner: Owner; onAdd: (p: Partial<Task>) => void }) {
  const [name, setName] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [due, setDue] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [owner, setOwner] = useState<Owner>(defaultOwner);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setOwner(defaultOwner); }, [defaultOwner]);

  function submit() {
    const n = name.trim();
    if (!n) return;
    onAdd({ name: n, urgency, due_date: due, project_id: projectId, owner });
    setName("");
    setDue(null);
    setProjectId(null);
    setUrgency("medium");
    setOpen(false);
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
          placeholder="Add a task…"
          className="flex-1 bg-transparent text-white placeholder-zinc-600 text-[15px] focus:outline-none py-1"
        />
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          Add
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
          {/* Urgency */}
          <div className="flex items-center gap-1">
            {URGENCY.map((u) => (
              <button
                key={u.key}
                onClick={() => setUrgency(u.key)}
                title={u.label}
                className={`px-2 py-1 rounded-lg text-xs transition-all ${urgency === u.key ? u.chip + " ring-1 ring-white/20" : "text-zinc-500 hover:text-white"}`}
              >
                {u.emoji}
              </button>
            ))}
          </div>
          <span className="text-zinc-800">|</span>
          {/* Due quick picks */}
          <div className="flex items-center gap-1">
            {[
              { label: "Today", val: todayStr() },
              { label: "Tmrw", val: addDays(1) },
              { label: "Mon", val: nextMonday() },
            ].map((q) => (
              <button
                key={q.label}
                onClick={() => setDue(due === q.val ? null : q.val)}
                className={`px-2 py-1 rounded-lg text-xs transition-colors ${due === q.val ? "bg-blue-600/30 text-blue-200" : "text-zinc-500 hover:text-white"}`}
              >
                {q.label}
              </button>
            ))}
            <input
              type="date"
              value={due ?? ""}
              onChange={(e) => setDue(e.target.value || null)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
            />
          </div>
          <span className="text-zinc-800">|</span>
          {/* Project */}
          <select
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 max-w-[160px]"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
            ))}
          </select>
          {/* Owner */}
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value as Owner)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            {OWNERS.map((o) => (
              <option key={o} value={o}>{ownerEmoji(o)} {o}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
function nextMonday() {
  const d = new Date();
  const day = d.getDay();
  const delta = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Task spreadsheet ─────────────────────────────────────────────────────────
// Full-width, color-coded table: owner accent on the left edge, status + urgency
// chips as selects, inline name/date/project edits. 📝 opens the notes panel.
function TaskSheet({ tasks, projects, showDone, onPatch, onRemove, onOpen }: {
  tasks: Task[]; projects: Project[]; showDone: boolean;
  onPatch: (id: string, u: Partial<Task>) => void; onRemove: (id: string) => void; onOpen: (id: string) => void;
}) {
  // The sheet is sectioned by when a task is due, so the order you read it in is
  // the order you should work it. Sections keep the same columns, so it still
  // behaves like one spreadsheet rather than five separate tables.
  const today = todayStr();
  const visible = tasks.filter((t) => showDone || !t.done);
  const groups = SECTIONS
    .map((sec) => ({
      ...sec,
      rows: visible
        .filter((t) => bucketOf(t) === sec.key)
        .sort((a, b) => (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1),
    }))
    .filter((g) => g.rows.length > 0);

  // Everything they have is finished and Done is hidden — say so, rather than
  // rendering an empty table shell that reads as broken.
  if (groups.length === 0) {
    const allDone = tasks.length > 0;
    return (
      <div className="mt-4 border border-dashed border-zinc-800 rounded-2xl py-12 px-6 text-center">
        {allDone ? (
          <>
            <p className="text-2xl mb-1">🎉</p>
            <p className="text-white text-sm font-semibold">All {tasks.length} {tasks.length === 1 ? "task is" : "tasks are"} done</p>
            <p className="text-zinc-500 text-xs mt-1">Flip <span className="text-emerald-300">✅ Done hidden</span> above to see them.</p>
          </>
        ) : (
          <p className="text-zinc-600 text-sm">Nothing here yet. Add a task above ↑</p>
        )}
      </div>
    );
  }
  const cell = "bg-transparent focus:bg-zinc-950 border border-transparent focus:border-blue-500/50 rounded-md px-2 py-1 text-sm focus:outline-none w-full transition-colors";

  return (
    <>
    {/* ── Phone: cards. A spreadsheet can't show a whole task on a 390px screen,
        so on mobile each task becomes a card with its full name on show. ── */}
    <div className="md:hidden mt-4 space-y-4">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="flex items-center gap-2 mb-2 px-0.5">
            <span className={`text-[11px] font-bold uppercase tracking-wide ${g.head}`}>{g.emoji} {g.label}</span>
            <span className="text-zinc-600 text-[11px]">{g.rows.length}</span>
          </div>
          <div className="space-y-2">
            {g.rows.map((t) => (
              <TaskCard key={t.id} t={t} projects={projects} today={today} onPatch={onPatch} onRemove={onRemove} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>

    {/* ── Tablet and up: the spreadsheet ── */}
    <div className="hidden md:block mt-4 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[860px]">
          <thead>
            <tr className="bg-zinc-900/80 border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-2 font-semibold w-9">✓</th>
              <th className="px-3 py-2 font-semibold">Task</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Who</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Status</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Due</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Project</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Urgency</th>
              <th className="px-3 py-2 font-semibold w-9"></th>
            </tr>
          </thead>
          {groups.map((g) => (
          <tbody key={g.key}>
            {/* section header — same table, so every column stays aligned */}
            <tr className="bg-zinc-900/60 border-y border-zinc-800">
              <td colSpan={8} className="px-3 py-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wide ${g.head}`}>{g.emoji} {g.label}</span>
                <span className="text-zinc-600 text-[11px] ml-2">{g.rows.length}</span>
              </td>
            </tr>
            {g.rows.map((t, i) => {
              const st = statusOf(t);
              const ow = OWNER_STYLE[t.owner] ?? OWNER_STYLE.Andrew;
              const overdue = !t.done && t.due_date && t.due_date < today;
              const dueToday = !t.done && t.due_date === today;
              return (
                <tr key={t.id}
                  className={`group border-b border-zinc-800/60 border-l-[3px] ${ow.accent} hover:bg-zinc-800/30 transition-colors ${g.row || (i % 2 ? "bg-zinc-900/30" : "")} ${t.done ? "opacity-50" : ""}`}>
                  {/* done tick */}
                  <td className="px-3 py-1.5 align-middle">
                    <button
                      onClick={() => onPatch(t.id, { done: !t.done, status: t.done ? "todo" : "done" })}
                      className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${t.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-600 hover:border-emerald-400"}`}
                    >{t.done && <span className="text-[11px] leading-none">✓</span>}</button>
                  </td>
                  {/* name (inline) + notes opener */}
                  <td className="px-1 py-1.5 align-middle min-w-[240px]">
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={t.name}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) onPatch(t.id, { name: v }); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className={`${cell} ${t.done ? "line-through text-zinc-500" : "text-white"}`}
                      />
                      <button onClick={() => onOpen(t.id)} title={t.notes?.trim() ? "Open notes" : "Add notes"}
                        className={`flex-shrink-0 text-sm px-1 transition-opacity ${t.notes?.trim() ? "text-blue-400" : "text-zinc-600 opacity-0 group-hover:opacity-100"}`}>📝</button>
                    </div>
                  </td>
                  {/* who's responsible — single select */}
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <select
                      value={t.owner}
                      onChange={(e) => onPatch(t.id, { owner: e.target.value as Owner })}
                      title="Who's responsible"
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${ow.chip}`}
                    >
                      {OWNERS.map((o) => <option key={o} value={o} className="bg-zinc-900 text-zinc-200">{ownerEmoji(o)} {o}</option>)}
                    </select>
                  </td>
                  {/* status — colored select */}
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <select
                      value={st.key}
                      onChange={(e) => onPatch(t.id, { status: e.target.value, done: e.target.value === "done" })}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${st.chip}`}
                    >
                      {STATUSES.map((s) => <option key={s.key} value={s.key} className="bg-zinc-900 text-zinc-200">{s.emoji} {s.label}</option>)}
                    </select>
                  </td>
                  {/* due date — real input, colored by urgency of the date */}
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={t.due_date ?? ""}
                        onChange={(e) => onPatch(t.id, { due_date: e.target.value || null })}
                        className={`bg-zinc-950/70 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${overdue ? "text-red-400" : dueToday ? "text-amber-300" : "text-zinc-300"}`}
                      />
                      {t.due_date && <span className={`text-[11px] ${overdue ? "text-red-400 font-semibold" : dueToday ? "text-amber-300 font-semibold" : "text-zinc-600"}`}>{fmtDue(t.due_date)}</span>}
                    </div>
                  </td>
                  {/* project */}
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <select
                      value={t.project_id ?? ""}
                      onChange={(e) => onPatch(t.id, { project_id: e.target.value || null })}
                      className={`bg-zinc-950/70 border border-zinc-800 rounded-lg px-2 py-1 text-xs max-w-[170px] focus:outline-none focus:border-blue-500 ${t.project_id ? "text-zinc-200" : "text-zinc-600"}`}
                    >
                      <option value="">—</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
                    </select>
                  </td>
                  {/* urgency */}
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <select
                      value={t.urgency}
                      onChange={(e) => onPatch(t.id, { urgency: e.target.value as Urgency })}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${urg(t.urgency).chip}`}
                    >
                      {URGENCY.map((u) => <option key={u.key} value={u.key} className="bg-zinc-900 text-zinc-200">{u.emoji} {u.label}</option>)}
                    </select>
                  </td>
                  {/* delete */}
                  <td className="px-2 py-1.5 align-middle">
                    <button onClick={() => onRemove(t.id)} title="Delete"
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-sm transition-opacity">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          ))}
        </table>
      </div>
    </div>
    </>
  );
}

// ─── Task card (phone) ────────────────────────────────────────────────────────
// The whole task name is on show — wrapped, never truncated — because on a phone
// "Create Offer 1 Sheeter for St…" is useless. Everything stays editable, with
// native selects so iOS gives a proper picker, and 44px-ish tap targets.
function TaskCard({ t, projects, today, onPatch, onRemove, onOpen }: {
  t: Task; projects: Project[]; today: string;
  onPatch: (id: string, u: Partial<Task>) => void; onRemove: (id: string) => void; onOpen: (id: string) => void;
}) {
  const st = statusOf(t);
  const ow = OWNER_STYLE[t.owner] ?? OWNER_STYLE.Andrew;
  const u = urg(t.urgency);
  const overdue = !t.done && t.due_date && t.due_date < today;
  const dueToday = !t.done && t.due_date === today;
  const project = projects.find((p) => p.id === t.project_id);
  const chip = "rounded-lg pl-2 pr-6 py-1.5 text-[11px] font-semibold border-0 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500";
  // a caret so the native selects still read as tappable
  const caret = { backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M1 3l4 4 4-4' stroke='rgba(255,255,255,.5)' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" };

  return (
    <div className={`rounded-2xl border border-zinc-800 border-l-[3px] ${ow.accent} bg-zinc-900 p-3 ${t.done ? "opacity-55" : ""}`}>
      {/* tick + the full name */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => onPatch(t.id, { done: !t.done, status: t.done ? "todo" : "done" })}
          aria-label={t.done ? "Mark not done" : "Mark done"}
          className={`mt-0.5 h-7 w-7 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${t.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-600"}`}
        >{t.done && <span className="text-xs leading-none">✓</span>}</button>

        <button onClick={() => onOpen(t.id)} className="min-w-0 flex-1 text-left">
          {/* break-words + no truncation: the whole task, however long */}
          <p className={`text-[15px] leading-snug break-words ${t.done ? "line-through text-zinc-500" : "text-white"}`}>{t.name}</p>
          {project && <p className="text-[11px] text-zinc-500 mt-1 truncate">{project.emoji} {project.name}</p>}
        </button>

        {t.notes?.trim() && <span className="text-blue-400 text-sm shrink-0" title="Has notes">📝</span>}
      </div>

      {/* everything editable, wrapped so nothing ever runs off screen */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <select value={t.owner} onChange={(e) => onPatch(t.id, { owner: e.target.value as Owner })}
          aria-label="Who's responsible" style={caret} className={`${chip} ${ow.chip}`}>
          {OWNERS.map((o) => <option key={o} value={o} className="bg-zinc-900 text-zinc-200">{ownerEmoji(o)} {o}</option>)}
        </select>

        <select value={st.key} onChange={(e) => onPatch(t.id, { status: e.target.value, done: e.target.value === "done" })}
          aria-label="Status" style={caret} className={`${chip} ${st.chip}`}>
          {STATUSES.map((s) => <option key={s.key} value={s.key} className="bg-zinc-900 text-zinc-200">{s.emoji} {s.label}</option>)}
        </select>

        <select value={t.urgency} onChange={(e) => onPatch(t.id, { urgency: e.target.value as Urgency })}
          aria-label="Urgency" style={caret} className={`${chip} ${u.chip}`}>
          {URGENCY.map((x) => <option key={x.key} value={x.key} className="bg-zinc-900 text-zinc-200">{x.emoji} {x.label}</option>)}
        </select>

        <label className={`relative rounded-lg px-2 py-1.5 text-[11px] font-semibold ${overdue ? "bg-red-500/20 text-red-300" : dueToday ? "bg-amber-500/20 text-amber-300" : t.due_date ? "bg-zinc-800 text-zinc-300" : "bg-zinc-800/60 text-zinc-500"}`}>
          📅 {t.due_date ? fmtDue(t.due_date) : "Set date"}
          <input type="date" value={t.due_date ?? ""} onChange={(e) => onPatch(t.id, { due_date: e.target.value || null })}
            aria-label="Due date" className="absolute inset-0 w-full h-full opacity-0" />
        </label>

        <select value={t.project_id ?? ""} onChange={(e) => onPatch(t.id, { project_id: e.target.value || null })}
          aria-label="Project" style={caret}
          className={`${chip} max-w-[46%] truncate ${t.project_id ? "bg-zinc-800 text-zinc-200" : "bg-zinc-800/60 text-zinc-500"}`}>
          <option value="" className="bg-zinc-900 text-zinc-200">🗂️ No project</option>
          {projects.map((p) => <option key={p.id} value={p.id} className="bg-zinc-900 text-zinc-200">{p.emoji} {p.name}</option>)}
        </select>

        <button onClick={() => { if (confirm(`Delete "${t.name}"?`)) onRemove(t.id); }}
          aria-label="Delete task"
          className="ml-auto h-8 w-8 rounded-lg text-zinc-600 active:bg-zinc-800 active:text-rose-400 text-sm">✕</button>
      </div>
    </div>
  );
}

// ─── Voice dictation (Web Speech API — verbatim, no AI cleanup) ───────────────
type SpeechRec = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: (e: { resultIndex: number; results: { [i: number]: { isFinal: boolean; 0: { transcript: string } }; length: number } }) => void;
  onend: () => void; onerror: (e: unknown) => void; start: () => void; stop: () => void;
};
function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRec | null>(null);
  const keepRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  const supported = typeof window !== "undefined" &&
    !!((window as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown }).webkitSpeechRecognition ||
       (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition);

  const stop = useCallback(() => {
    keepRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { webkitSpeechRecognition?: new () => SpeechRec; SpeechRecognition?: new () => SpeechRec };
    const SR = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e) => {
      let final = "", live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else live += t;
      }
      if (final.trim()) onFinalRef.current(final.trim());
      setInterim(live);
    };
    // Safari stops on silence — restart automatically while the user is still recording.
    rec.onend = () => { if (keepRef.current) { try { rec.start(); } catch { /* already started */ } } else setListening(false); };
    rec.onerror = () => { /* keep going; onend will restart if needed */ };
    keepRef.current = true;
    try { rec.start(); } catch { /* ignore double-start */ }
    recRef.current = rec;
    setListening(true);
  }, []);

  const toggle = useCallback(() => { if (listening) stop(); else start(); }, [listening, start, stop]);
  // Stop on unmount.
  useEffect(() => () => { keepRef.current = false; recRef.current?.stop(); }, []);
  return { listening, interim, toggle, supported };
}

// ─── Task detail panel (slide-in) ─────────────────────────────────────────────
function TaskPanel({ task, projects, onPatch, onRemove, onClose }: {
  task: Task; projects: Project[];
  onPatch: (id: string, u: Partial<Task>) => void; onRemove: (id: string) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Task>(task);
  const [saved, setSaved] = useState(true);
  const savedRef = useRef(JSON.stringify(task));
  const baseId = useRef(task.id);

  // Reset if a different task opens.
  useEffect(() => {
    if (baseId.current !== task.id) {
      baseId.current = task.id;
      setForm(task);
      savedRef.current = JSON.stringify(task);
      setSaved(true);
    }
  }, [task]);

  // Debounced auto-save.
  useEffect(() => {
    const snap = JSON.stringify(form);
    if (snap === savedRef.current) return;
    setSaved(false);
    const t = setTimeout(() => {
      savedRef.current = snap;
      const { id, ...updates } = form;
      onPatch(id, updates);
      setSaved(true);
    }, 500);
    return () => clearTimeout(t);
  }, [form, onPatch]);

  // Esc to close.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const set = (patch: Partial<Task>) => setForm((f) => ({ ...f, ...patch }));

  // Voice notes — append verbatim dictation to whatever is already in Notes.
  const appendNote = useCallback((text: string) => {
    setForm((f) => {
      const existing = (f.notes ?? "").trimEnd();
      return { ...f, notes: existing ? `${existing} ${text}` : text };
    });
  }, []);
  const dictation = useDictation(appendNote);

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:max-w-md bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center justify-between gap-2">
          <button
            onClick={() => set({ done: !form.done, completed_at: !form.done ? new Date().toISOString() : null })}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${form.done ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
          >
            <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${form.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-500"}`}>{form.done && <span className="text-[9px]">✓</span>}</span>
            {form.done ? "Completed" : "Mark done"}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-600">{saved ? "Saved" : "Saving…"}</span>
            <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none px-1">✕</button>
          </div>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* Name */}
          <div>
            <label className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">Task name</label>
            <textarea
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              rows={2}
              placeholder="Task name"
              className={`w-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-base font-semibold focus:outline-none focus:border-blue-500 resize-none ${form.done ? "line-through text-zinc-500" : ""}`}
            />
          </div>

          {/* Urgency */}
          <div>
            <label className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">Urgency</label>
            <div className="flex items-center gap-1.5 mt-1.5">
              {URGENCY.map((x) => (
                <button
                  key={x.key}
                  onClick={() => set({ urgency: x.key })}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${form.urgency === x.key ? x.chip + " ring-1 ring-white/20" : "text-zinc-500 hover:text-white bg-zinc-900"}`}
                >
                  {x.emoji} {x.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due date + Owner */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">Due date</label>
              <input
                type="date"
                value={form.due_date ?? ""}
                onChange={(e) => set({ due_date: e.target.value || null })}
                className="w-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">Owner</label>
              <select
                value={form.owner}
                onChange={(e) => set({ owner: e.target.value as Owner })}
                className="w-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                {OWNERS.map((o) => <option key={o} value={o}>{ownerEmoji(o)} {o}</option>)}
              </select>
            </div>
          </div>

          {/* Project */}
          <div>
            <label className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">Project</label>
            <select
              value={form.project_id ?? ""}
              onChange={(e) => set({ project_id: e.target.value || null })}
              className="w-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">📝 Notes</label>
              {dictation.supported && (
                <button
                  onClick={dictation.toggle}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${dictation.listening ? "bg-rose-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}
                >
                  {dictation.listening
                    ? <><span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Listening… tap to stop</>
                    : <>🎤 Speak</>}
                </button>
              )}
            </div>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set({ notes: e.target.value })}
              rows={8}
              placeholder="Type, or tap 🎤 Speak and talk. Your words go in exactly as said."
              className="w-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y"
            />
            {dictation.listening && (
              <p className="mt-1.5 text-xs text-rose-300/90">
                🎙️ {dictation.interim ? <span className="italic text-zinc-400">{dictation.interim}</span> : "Listening… speak now. Text is added as you talk."}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 px-4 py-3">
          <button
            onClick={() => { if (confirm("Delete this task?")) onRemove(form.id); }}
            className="text-sm text-zinc-500 hover:text-red-400 transition-colors"
          >
            🗑️ Delete task
          </button>
        </div>
      </div>
    </div>
  );
}
