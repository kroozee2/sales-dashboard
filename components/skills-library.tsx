"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Skill = {
  id: string; source: "claude" | "hermes"; name: string; path: string;
  description: string | null; trigger_hint: string | null;
  html_url: string; raw_url: string; body_chars: number | null; synced_at: string | null;
};

const SOURCE_META: Record<string, { label: string; chip: string; dot: string }> = {
  claude: { label: "Claude", chip: "bg-violet-500/12 text-violet-300 ring-violet-500/25", dot: "bg-violet-400" },
  hermes: { label: "Hermes", chip: "bg-cyan-500/12 text-cyan-300 ring-cyan-500/25", dot: "bg-cyan-400" },
};

const pretty = (n: string) =>
  n.split("/").pop()!.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function SkillsLibrary() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | "claude" | "hermes">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() =>
    fetch("/api/skills", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b.error ? setError(b.error) : (setSkills(b.skills ?? []), setError(null))))
      .catch((e) => setError(String(e))), []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function sync() {
    setSyncing(true);
    const res = await fetch("/api/skills/sync", { method: "POST", headers: { "x-requested-with": "sales-os-ui" } });
    const body = await res.json().catch(() => ({}));
    setSyncing(false);
    setToast(res.ok ? `Refreshed ${body.synced} skills from GitHub` : body.error ?? "Refresh failed");
    if (res.ok) void load();
  }

  const rows = useMemo(() => {
    if (!skills) return [];
    const needle = q.trim().toLowerCase();
    return skills.filter((s) => {
      if (source !== "all" && s.source !== source) return false;
      if (!needle) return true;
      return `${s.name} ${s.description ?? ""} ${s.trigger_hint ?? ""}`.toLowerCase().includes(needle);
    });
  }, [skills, q, source]);

  const counts = useMemo(() => ({
    all: skills?.length ?? 0,
    claude: skills?.filter((s) => s.source === "claude").length ?? 0,
    hermes: skills?.filter((s) => s.source === "hermes").length ?? 0,
  }), [skills]);

  const copy = async (text: string, note: string) => {
    try { await navigator.clipboard.writeText(text); setToast(note); }
    catch { setToast("Could not copy"); }
  };

  /** What a client should receive: what it does and where to get it. */
  const shareText = (list: Skill[]) =>
    list.map((s) => `${pretty(s.name)}\n${s.description ?? "No description on file."}\n${s.html_url}`).join("\n\n");

  const toggle = (id: string) =>
    setPicked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-400/20 bg-[#090a0d] p-6">
        <p className="text-sm text-rose-200">{error}</p>
        <button onClick={() => void load()} className="mt-3 rounded-lg border border-rose-300/30 px-4 py-2 text-sm text-rose-200">Try again</button>
      </div>
    );
  }
  if (!skills) return <div className="h-80 animate-pulse rounded-3xl border border-white/[0.07] bg-[#090a0d]" />;

  const chosen = skills.filter((s) => picked.has(s.id));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-white/[0.07] bg-[#090a0d] p-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">Skills library</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-400">
            Every skill you and the agents have built, read from{" "}
            <a href="https://github.com/kroozee2/7figureceoskills" target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">
              7figureceoskills
            </a>{" "}
            on GitHub. Pick any of them to send to a client.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {skills[0]?.synced_at && (
            <span className="text-[11px] text-zinc-600">
              synced {new Date(skills[0].synced_at).toLocaleDateString()}
            </span>
          )}
          <button onClick={() => void sync()} disabled={syncing}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50">
            {syncing ? "Refreshing…" : "Refresh from GitHub"}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.07] bg-[#090a0d] p-3">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills by name or what they do…"
            className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none" />
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {(["all", "claude", "hermes"] as const).map((k) => (
            <button key={k} onClick={() => setSource(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                source === k ? "bg-white/[0.10] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
              {k === "all" ? "All" : SOURCE_META[k].label}
              <span className="ml-1.5 text-[10px] text-zinc-600">{counts[k]}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500">{rows.length} shown</span>
      </div>

      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.05] px-4 py-3">
          <span className="text-sm font-medium text-cyan-200">{picked.size} selected</span>
          <button onClick={() => void copy(shareText(chosen), `Copied ${chosen.length} skills, ready to paste`)}
            className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/30 hover:bg-cyan-500/30">
            Copy for a client
          </button>
          <button onClick={() => void copy(chosen.map((s) => s.html_url).join("\n"), "Links copied")}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]">
            Copy links only
          </button>
          <button onClick={() => setPicked(new Set())} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300">clear</button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => {
          const meta = SOURCE_META[s.source];
          const isPicked = picked.has(s.id);
          const isOpen = openId === s.id;
          return (
            <article key={s.id}
              className={`group flex flex-col rounded-2xl border p-4 transition ${
                isPicked ? "border-cyan-400/50 bg-cyan-400/[0.04]" : "border-white/[0.07] bg-[#090a0d] hover:border-white/20"}`}>
              <div className="flex items-start gap-3">
                <button onClick={() => toggle(s.id)} aria-label={isPicked ? "Deselect" : "Select"}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] transition ${
                    isPicked ? "border-cyan-400 bg-cyan-400 text-black" : "border-white/20 text-transparent group-hover:border-white/40"}`}>
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-white" title={pretty(s.name)}>{pretty(s.name)}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${meta.chip}`}>{meta.label}</span>
                    {s.body_chars ? <span className="text-[10px] text-zinc-600">{Math.round(s.body_chars / 100) / 10}k chars</span> : null}
                  </div>
                </div>
              </div>

              <p className={`mt-3 flex-1 text-xs leading-relaxed text-zinc-400 ${isOpen ? "" : "line-clamp-3"}`}>
                {s.description ?? <span className="text-zinc-600">No description in its SKILL.md.</span>}
              </p>
              {isOpen && s.trigger_hint && (
                <p className="mt-2 rounded-lg bg-white/[0.03] p-2 text-[11px] leading-relaxed text-zinc-500">{s.trigger_hint}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-3">
                {(s.description?.length ?? 0) > 130 || s.trigger_hint ? (
                  <button onClick={() => setOpenId(isOpen ? null : s.id)} className="rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200">
                    {isOpen ? "less" : "more"}
                  </button>
                ) : null}
                <button onClick={() => void copy(shareText([s]), "Copied, ready to send")}
                  className="rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200">
                  Copy for client
                </button>
                <a href={s.html_url} target="_blank" rel="noreferrer"
                  className="ml-auto rounded-md px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-400/10">
                  GitHub ↗
                </a>
              </div>
            </article>
          );
        })}
        {rows.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">
            Nothing matches. {skills.length === 0 && "Press Refresh from GitHub to build the library."}
          </p>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
