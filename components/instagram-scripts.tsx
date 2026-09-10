"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CTA_LINES,
  SCRIPT_CATEGORIES,
  SCRIPT_STATUSES,
  estimateSeconds,
  formatScript,
  scriptProgress,
  type CtaKind,
  type ReelScript,
  type ScriptCategory,
  type ScriptStatus,
  type ScriptStep,
} from "@/lib/reel-scripts";

// The Scripts tab: a sheet of every script on the left, one script open in a
// sidebar on the right.
//
// The sheet is one <table> with a sticky <thead>, not a header table above a
// body table — two tables drift out of alignment the moment a column changes
// width, which is how the Calls sheet broke.

interface SourceIdea {
  id: string; title: string; category: string | null; shootDate: string | null; stage: string | null;
}
interface SourceModelPost {
  id: string; handle: string; hook: string | null; theme: string | null;
  views: number | null; postUrl: string | null; inMyVoice: string | null;
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const categoryMeta = (key: string) => SCRIPT_CATEGORIES.find((c) => c.key === key) ?? SCRIPT_CATEGORIES[1];
const statusMeta = (key: string) => SCRIPT_STATUSES.find((s) => s.key === key) ?? SCRIPT_STATUSES[0];

function runtimeLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function InstagramScripts() {
  const [scripts, setScripts] = useState<ReelScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [ideas, setIdeas] = useState<SourceIdea[]>([]);
  const [modelPosts, setModelPosts] = useState<SourceModelPost[]>([]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "idea" | "model">(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [statusFilter, setStatusFilter] = useState<ScriptStatus | "all">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/instagram/scripts", { cache: "no-store" });
      if (!res.ok) throw new Error("Scripts are temporarily unavailable");
      const json = (await res.json()) as { scripts: ReelScript[] };
      setScripts(json.scripts ?? []);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load scripts");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const res = await fetch("/api/instagram/scripts/sources", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { ideas: SourceIdea[]; modelPosts: SourceModelPost[] };
      setIdeas(json.ideas ?? []);
      setModelPosts(json.modelPosts ?? []);
    } catch {
      // The sheet still works without the pickers; they just show nothing.
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { void Promise.resolve().then(loadSources); }, [loadSources]);

  const open = useMemo(() => scripts.find((s) => s.id === openId) ?? null, [scripts, openId]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scripts.filter((script) => {
      if (statusFilter !== "all" && script.status !== statusFilter) return false;
      if (!query) return true;
      return `${script.title} ${script.hook} ${script.source_note ?? ""}`.toLowerCase().includes(query);
    });
  }, [scripts, statusFilter, search]);

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(SCRIPT_STATUSES.map((s) => [s.key, 0])) as Record<ScriptStatus, number>;
    let shootable = 0;
    for (const script of scripts) {
      byStatus[script.status] = (byStatus[script.status] ?? 0) + 1;
      if (scriptProgress(script).shootable) shootable += 1;
    }
    return { byStatus, shootable, total: scripts.length };
  }, [scripts]);

  /** Save a patch and fold the row the server returns back into the list. */
  const save = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch("/api/instagram/scripts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const json = (await res.json()) as { script?: ReelScript; error?: string };
      if (!res.ok || !json.script) throw new Error(json.error ?? "Could not save");
      setScripts((current) => current.map((s) => (s.id === id ? json.script! : s)));
      setSaveState({ kind: "saved" });
      return true;
    } catch (error) {
      setSaveState({ kind: "error", message: error instanceof Error ? error.message : "Could not save" });
      return false;
    }
  }, []);

  const create = useCallback(async (payload: Record<string, unknown>) => {
    setCreating(true);
    try {
      const res = await fetch("/api/instagram/scripts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { script?: ReelScript; error?: string };
      if (!res.ok || !json.script) throw new Error(json.error ?? "Could not create the script");
      setScripts((current) => [json.script!, ...current]);
      setOpenId(json.script.id);
      setPicker(null);
      setNewTitle("");
      setSaveState({ kind: "idle" });
    } catch (error) {
      setSaveState({ kind: "error", message: error instanceof Error ? error.message : "Could not create" });
    } finally {
      setCreating(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    const previous = scripts;
    setScripts((current) => current.filter((s) => s.id !== id));
    setOpenId((current) => (current === id ? null : current));
    const res = await fetch("/api/instagram/scripts", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setScripts(previous);
      setSaveState({ kind: "error", message: "Could not delete that script" });
    }
  }, [scripts]);

  return (
    <div className="space-y-4">
      {/* ── Start a script ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-pink-500/25 bg-gradient-to-br from-pink-950/35 to-zinc-900 p-4 sm:p-5">
        <div className="mb-4 min-w-0">
          <h2 className="text-base font-black text-white">Write a Reel script</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Hook, then what you show, then the ask. Start from scratch, from an idea you already logged, or from a post we model.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
            New script
            <input
              value={newTitle}
              maxLength={300}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newTitle.trim()) void create({ from: "blank", title: newTitle });
              }}
              placeholder="What is this Reel about?"
              autoComplete="off"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base font-normal normal-case tracking-normal text-white placeholder-zinc-500 focus:border-pink-500 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void create({ from: "blank", title: newTitle })}
            disabled={!newTitle.trim() || creating}
            className="min-h-11 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-pink-600/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? "Adding…" : "＋ New script"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPicker(picker === "idea" ? null : "idea")}
            aria-expanded={picker === "idea"}
            className={cn(
              "min-h-11 rounded-full border px-4 py-2 text-xs font-bold transition-colors",
              picker === "idea"
                ? "border-pink-500 bg-pink-500/20 text-pink-100"
                : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white",
            )}
          >
            💡 From an idea ({ideas.length})
          </button>
          <button
            type="button"
            onClick={() => setPicker(picker === "model" ? null : "model")}
            aria-expanded={picker === "model"}
            className={cn(
              "min-h-11 rounded-full border px-4 py-2 text-xs font-bold transition-colors",
              picker === "model"
                ? "border-pink-500 bg-pink-500/20 text-pink-100"
                : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white",
            )}
          >
            🎯 From what we model ({modelPosts.length})
          </button>
        </div>

        {picker === "idea" && (
          <SourceList
            empty="No Reel ideas on the board yet. Add one on the Ideas tab."
            rows={ideas.map((idea) => ({
              key: idea.id,
              primary: idea.title,
              secondary: [categoryMeta(idea.category ?? "value").label, idea.shootDate ? `shoot ${idea.shootDate}` : null]
                .filter(Boolean).join(" · "),
              onPick: () => void create({ from: "idea", id: idea.id }),
            }))}
          />
        )}

        {picker === "model" && (
          <SourceList
            empty="No modelled posts yet. Sync accounts on the Model tab."
            rows={modelPosts.map((post) => ({
              key: post.id,
              primary: post.hook ?? `@${post.handle}`,
              secondary: [
                `@${post.handle}`,
                post.theme,
                post.views ? `${post.views.toLocaleString()} views` : null,
              ].filter(Boolean).join(" · "),
              onPick: () => void create({ from: "model", id: post.id }),
            }))}
          />
        )}
      </div>

      {/* ── Glance ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Scripts" value={String(counts.total)} tone="text-white" />
        {/* Distinct from the "Ready to shoot" status below: this counts scripts
            that actually have all three sections written, whatever Andrew set
            the status to. Sharing the label made the row read as a duplicate. */}
        <Stat label="Fully written" value={String(counts.shootable)} tone="text-emerald-400" />
        {SCRIPT_STATUSES.slice(1).map((status) => (
          <Stat key={status.key} label={status.label} value={String(counts.byStatus[status.key] ?? 0)} tone="text-zinc-300" />
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {([{ key: "all", label: "All" }, ...SCRIPT_STATUSES] as { key: ScriptStatus | "all"; label: string }[]).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatusFilter(s.key)}
              aria-pressed={statusFilter === s.key}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2 text-xs font-bold transition-colors",
                statusFilter === s.key
                  ? "border-pink-500 bg-pink-500/20 text-pink-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search scripts…"
          aria-label="Search scripts"
          className="min-h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-pink-500 focus:outline-none sm:w-64"
        />
      </div>

      {/* ── The sheet ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-950">
              <tr className="border-b border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <th scope="col" className="px-4 py-3">Script</th>
                <th scope="col" className="px-3 py-3">Type</th>
                <th scope="col" className="px-3 py-3">Hook</th>
                <th scope="col" className="px-3 py-3 text-center">Beats</th>
                <th scope="col" className="hidden px-3 py-3 text-center lg:table-cell">Run</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="hidden px-3 py-3 xl:table-cell">Shoot</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500">Loading scripts…</td></tr>
              )}
              {!loading && loadError && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-rose-300">{loadError}</td></tr>
              )}
              {!loading && !loadError && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500">
                    {scripts.length === 0 ? "No scripts yet. Write your first one above." : "Nothing matches that filter."}
                  </td>
                </tr>
              )}
              {!loading && !loadError && visible.map((script) => {
                const progress = scriptProgress(script);
                const category = categoryMeta(script.category);
                const status = statusMeta(script.status);
                return (
                  <tr
                    key={script.id}
                    onClick={() => { setOpenId(script.id); setSaveState({ kind: "idle" }); }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${script.title}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpenId(script.id);
                        setSaveState({ kind: "idle" });
                      }
                    }}
                    className={cn(
                      "cursor-pointer border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40 focus:bg-zinc-800/60 focus:outline-none",
                      openId === script.id && "bg-pink-500/10",
                    )}
                  >
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={cn("h-2 w-2 shrink-0 rounded-full", progress.shootable ? "bg-emerald-400" : "bg-zinc-600")}
                        />
                        <span className="truncate font-bold text-white">{script.title}</span>
                      </div>
                      {script.source_kind !== "blank" && (
                        <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                          {script.source_kind === "model" ? "🎯 " : "💡 "}{script.source_note ?? "from an idea"}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-300">
                      {category.emoji} {category.label}
                    </td>
                    <td className="max-w-[280px] px-3 py-3">
                      <span className={cn("line-clamp-2 text-xs", script.hook ? "text-zinc-300" : "text-zinc-600 italic")}>
                        {script.hook || "no hook yet"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-zinc-300">{script.steps?.length ?? 0}</td>
                    <td className="hidden px-3 py-3 text-center text-xs text-zinc-400 lg:table-cell">
                      {runtimeLabel(estimateSeconds(script))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold", status.chip)}>
                        {status.label}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-xs text-zinc-400 xl:table-cell">
                      {script.shoot_date ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <ScriptSidebar
          key={open.id}
          script={open}
          saveState={saveState}
          onSave={(patch) => save(open.id, patch)}
          onClose={() => setOpenId(null)}
          onDelete={() => void remove(open.id)}
          onGenerated={(script) => setScripts((current) => current.map((s) => (s.id === script.id ? script : s)))}
          onSaveState={setSaveState}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-black", tone)}>{value}</div>
    </div>
  );
}

function SourceList({ rows, empty }: { rows: { key: string; primary: string; secondary: string; onPick: () => void }[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-zinc-500">{empty}</p>;
  }
  return (
    <ul className="mt-3 max-h-72 space-y-1.5 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2">
      {rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            onClick={row.onPick}
            className="w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/70"
          >
            <span className="block truncate text-sm font-bold text-white">{row.primary}</span>
            <span className="block truncate text-[11px] text-zinc-500">{row.secondary}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── The sidebar: one script, top to bottom ─────────────────────────────── */

interface SidebarProps {
  script: ReelScript;
  saveState: SaveState;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  onClose: () => void;
  onDelete: () => void;
  onGenerated: (script: ReelScript) => void;
  onSaveState: (state: SaveState) => void;
}

function ScriptSidebar({ script, saveState, onSave, onClose, onDelete, onGenerated, onSaveState }: SidebarProps) {
  // Seeded from the row once. The parent remounts this on a different script
  // via `key`, so there is no effect mirroring props into state.
  const [title, setTitle] = useState(script.title);
  const [hook, setHook] = useState(script.hook);
  const [steps, setSteps] = useState<ScriptStep[]>(script.steps ?? []);
  const [cta, setCta] = useState(script.cta);
  const [notes, setNotes] = useState("");
  const [writing, setWriting] = useState(false);
  const [copied, setCopied] = useState(false);

  const progress = scriptProgress({ hook, steps, cta });
  const seconds = estimateSeconds({ hook, steps, cta });

  const write = async () => {
    setWriting(true);
    onSaveState({ kind: "saving" });
    try {
      // Save what he typed first, so a hook he started is the one the model builds on.
      await onSave({ title, hook, steps, cta });
      const res = await fetch("/api/instagram/scripts/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: script.id, notes: notes.trim() || undefined }),
      });
      const json = (await res.json()) as { script?: ReelScript; error?: string };
      if (!res.ok || !json.script) throw new Error(json.error ?? "Could not write the script");
      setHook(json.script.hook);
      setSteps(json.script.steps ?? []);
      setCta(json.script.cta);
      onGenerated(json.script);
      onSaveState({ kind: "saved" });
    } catch (error) {
      onSaveState({ kind: "error", message: error instanceof Error ? error.message : "Could not write the script" });
    } finally {
      setWriting(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatScript({ title, hook, steps, cta }));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onSaveState({ kind: "error", message: "Could not copy to the clipboard" });
    }
  };

  const setStep = (index: number, patch: Partial<ScriptStep>) =>
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));

  const moveStep = (index: number, delta: number) =>
    setSteps((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={() => { void onSave({ title, hook, steps, cta }); onClose(); }}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Script: ${script.title}`}
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-zinc-800 p-4">
          <div className="min-w-0 flex-1">
            <input
              value={title}
              maxLength={300}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => { if (title.trim() && title !== script.title) void onSave({ title }); }}
              aria-label="Script title"
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-black text-white hover:border-zinc-800 focus:border-pink-500 focus:outline-none"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 px-2 text-[11px] text-zinc-500">
              <span className={cn("font-bold", progress.shootable ? "text-emerald-400" : "text-amber-400")}>
                {progress.shootable ? "✓ Ready to shoot" : `${progress.done}/3 sections`}
              </span>
              <span>·</span>
              <span>~{runtimeLabel(seconds)}</span>
              {saveState.kind === "saving" && <><span>·</span><span className="text-zinc-400">Saving…</span></>}
              {saveState.kind === "saved" && <><span>·</span><span className="text-emerald-400">Saved</span></>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void onSave({ title, hook, steps, cta }); onClose(); }}
            aria-label="Close script"
            className="rounded-lg px-3 py-2 text-xl leading-none text-zinc-500 hover:bg-zinc-900 hover:text-white"
          >
            ×
          </button>
        </div>

        {saveState.kind === "error" && (
          <div role="alert" className="flex items-center justify-between gap-3 border-b border-rose-500/40 bg-rose-950/60 px-4 py-2.5">
            <span className="text-xs font-bold text-rose-100">⚠ Not saved — {saveState.message}</span>
            <button
              type="button"
              onClick={() => void onSave({ title, hook, steps, cta })}
              className="shrink-0 rounded-lg border border-rose-400/50 px-3 py-1.5 text-xs font-bold text-rose-100 hover:bg-rose-900/60"
            >
              Retry
            </button>
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-auto p-4">
          {script.source_note && (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-[11px] leading-relaxed text-zinc-400">
              {script.source_kind === "model" ? "🎯 " : "💡 "}{script.source_note}
            </p>
          )}

          {/* Type, status, date */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Script type">
              {SCRIPT_CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => void onSave({ category: category.key as ScriptCategory })}
                  aria-pressed={script.category === category.key}
                  className={cn(
                    "min-h-9 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                    script.category === category.key
                      ? "border-pink-500 bg-pink-500/20 text-pink-100"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white",
                  )}
                >
                  {category.emoji} {category.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                Status
                <select
                  value={script.status}
                  onChange={(event) => void onSave({ status: event.target.value as ScriptStatus })}
                  className="mt-1.5 block min-h-11 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white focus:border-pink-500 focus:outline-none"
                >
                  {SCRIPT_STATUSES.map((status) => (
                    <option key={status.key} value={status.key}>{status.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                Shoot date
                <input
                  type="date"
                  value={script.shoot_date ?? ""}
                  onChange={(event) => void onSave({ shoot_date: event.target.value || null })}
                  className="mt-1.5 block min-h-11 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-200 [color-scheme:dark] focus:border-pink-500 focus:outline-none"
                />
              </label>
            </div>
          </div>

          {/* AI */}
          <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-3">
            <label className="text-[11px] font-bold uppercase tracking-wide text-purple-200">
              Anything it should cover? <span className="font-medium normal-case tracking-normal text-purple-300/70">(optional)</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="e.g. mention Rae going from $20k to $155k, show the Goals board"
                className="mt-1.5 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white placeholder-zinc-600 focus:border-purple-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void write()}
              disabled={writing || !title.trim()}
              className="mt-2 w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {writing ? "Writing…" : hook ? "✨ Rewrite it" : "✨ Write it for me"}
            </button>
            {hook && (
              <p className="mt-2 text-[11px] text-purple-300/70">
                Your hook is kept as the angle. Everything below it gets rewritten.
              </p>
            )}
          </div>

          {/* HOOK */}
          <Section title="Hook" hint="Face on camera. One or two sentences. No teasing.">
            <textarea
              value={hook}
              onChange={(event) => setHook(event.target.value)}
              onBlur={() => { if (hook !== script.hook) void onSave({ hook }); }}
              rows={3}
              placeholder="I built a sales dashboard in 30 minutes using Claude Code. Let me show you exactly how."
              aria-label="Hook"
              className="w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-pink-500 focus:outline-none"
            />
          </Section>

          {/* SHOW */}
          <Section title="Show" hint="One line to say, one thing on screen. Show the finished thing first.">
            <div className="space-y-2">
              {steps.length === 0 && (
                <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
                  No beats yet. Add one, or let it write them for you.
                </p>
              )}
              {steps.map((step, index) => (
                <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Beat {index + 1}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0}
                        aria-label={`Move beat ${index + 1} up`}
                        className="rounded px-1.5 text-zinc-500 hover:text-white disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1}
                        aria-label={`Move beat ${index + 1} down`}
                        className="rounded px-1.5 text-zinc-500 hover:text-white disabled:opacity-30">↓</button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = steps.filter((_, i) => i !== index);
                          setSteps(next);
                          void onSave({ steps: next });
                        }}
                        aria-label={`Remove beat ${index + 1}`}
                        className="rounded px-1.5 text-zinc-600 hover:text-rose-400"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <input
                    value={step.show}
                    onChange={(event) => setStep(index, { show: event.target.value })}
                    onBlur={() => void onSave({ steps })}
                    placeholder="Show: what is on screen"
                    aria-label={`Beat ${index + 1} screen direction`}
                    className="mb-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-sky-200 placeholder-zinc-600 focus:border-sky-500 focus:outline-none"
                  />
                  <input
                    value={step.say}
                    onChange={(event) => setStep(index, { say: event.target.value })}
                    onBlur={() => void onSave({ steps })}
                    placeholder="Say: one short sentence"
                    aria-label={`Beat ${index + 1} spoken line`}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-pink-500 focus:outline-none"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = [...steps, { say: "", show: "" }];
                  setSteps(next);
                  void onSave({ steps: next });
                }}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-xs font-bold text-zinc-400 hover:border-zinc-600 hover:text-white"
              >
                ＋ Add a beat
              </button>
            </div>
          </Section>

          {/* CTA */}
          <Section title="Call to action" hint="Face back on camera, pointing to bio.">
            <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Call to action">
              {(Object.keys(CTA_LINES) as CtaKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => { setCta(CTA_LINES[kind]); void onSave({ cta: CTA_LINES[kind], cta_kind: kind }); }}
                  aria-pressed={script.cta_kind === kind}
                  className={cn(
                    "min-h-9 rounded-full border px-3 py-1.5 text-xs font-bold capitalize transition-colors",
                    script.cta_kind === kind
                      ? "border-pink-500 bg-pink-500/20 text-pink-100"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white",
                  )}
                >
                  {kind === "skool" ? "Join the Skool community" : "Follow me"}
                </button>
              ))}
            </div>
            <textarea
              value={cta}
              onChange={(event) => setCta(event.target.value)}
              onBlur={() => { if (cta !== script.cta) void onSave({ cta }); }}
              rows={2}
              aria-label="Call to action line"
              className="w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none"
            />
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-zinc-800 p-4">
          <button
            type="button"
            onClick={() => void copy()}
            className="flex-1 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-pink-600/20"
          >
            {copied ? "✓ Copied" : "📋 Copy filming sheet"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl border border-zinc-800 px-4 py-3 text-sm font-bold text-zinc-500 hover:border-rose-500/50 hover:text-rose-300"
          >
            Delete
          </button>
        </div>
      </aside>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-300">{title}</h3>
      <p className="mb-2 text-[11px] text-zinc-500">{hint}</p>
      {children}
    </section>
  );
}
