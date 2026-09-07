"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildResearchLinks,
  slugifyCompetitorName,
  type ContentCompetitor,
  type CompetitorWatchStatus,
} from "@/lib/content-competitors";

const STATUS_META: Record<CompetitorWatchStatus, { label: string; classes: string }> = {
  active: { label: "Active study", classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  watching: { label: "Watchlist", classes: "border-blue-500/40 bg-blue-500/10 text-blue-300" },
  paused: { label: "Paused", classes: "border-zinc-700 bg-zinc-800 text-zinc-400" },
};

interface AddForm {
  name: string;
  focus: string;
  whyFit: string;
  pillars: string;
  signaturePattern: string;
  andrewAdaptation: string;
  websiteUrl: string;
}

const EMPTY_ADD: AddForm = {
  name: "",
  focus: "",
  whyFit: "",
  pillars: "",
  signaturePattern: "",
  andrewAdaptation: "",
  websiteUrl: "",
};

export default function CompetitorResearch({ onIdeaSaved }: { onIdeaSaved?: () => void }) {
  const [creators, setCreators] = useState<ContentCompetitor[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CompetitorWatchStatus>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState<AddForm>(EMPTY_ADD);

  useEffect(() => {
    fetch("/api/content/competitors")
      .then(async (response) => {
        const data = await response.json() as { creators?: ContentCompetitor[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load creator research");
        const next = data.creators ?? [];
        setCreators(next);
        setSelectedId(next[0]?.id ?? "");
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Could not load creator research"))
      .finally(() => setLoading(false));
  }, []);

  const selected = creators.find((creator) => creator.id === selectedId) ?? creators[0] ?? null;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return creators.filter((creator) => {
      const matchesStatus = statusFilter === "all" || creator.watchStatus === statusFilter;
      const haystack = [creator.name, creator.focus, creator.whyFit, ...creator.pillars].join(" ").toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [creators, query, statusFilter]);

  async function persistCreator(creator: ContentCompetitor, successMessage: string): Promise<boolean> {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/content/competitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator }),
      });
      const data = await response.json() as { creators?: ContentCompetitor[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save research");
      const next = data.creators ?? creators;
      setCreators(next);
      setSelectedId(creator.id);
      if (successMessage) {
        setMessage(successMessage);
        window.setTimeout(() => setMessage(""), 2500);
      }
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save research");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateSelected(patch: Partial<ContentCompetitor>) {
    if (!selected) return;
    setCreators((current) => current.map((creator) => creator.id === selected.id ? { ...creator, ...patch } : creator));
  }

  async function changeStatus(status: CompetitorWatchStatus) {
    if (!selected) return;
    await persistCreator({ ...selected, watchStatus: status }, "Watchlist updated");
  }

  async function saveNotes() {
    if (!selected) return;
    await persistCreator(selected, "Research notes saved");
  }

  async function saveToIdeas() {
    if (!selected) return;
    const persisted = await persistCreator(selected, "");
    if (!persisted) return;
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    const researchText = [
      `CONTENT MODEL: ${selected.name}`,
      `Pattern worth studying: ${selected.signaturePattern}`,
      `Andrew's adaptation: ${selected.andrewAdaptation}`,
      selected.notes.trim() ? `Research notes: ${selected.notes.trim()}` : "",
      "Create an original 7-Figure CEO angle from this pattern. Do not copy the creator's wording or ideas.",
    ].filter(Boolean).join("\n\n");
    try {
      const response = await fetch("/api/content/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: researchText }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save the idea");
      setMessage("Saved to Content Ideas");
      onIdeaSaved?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save the idea");
    } finally {
      setSaving(false);
    }
  }

  async function addCreator() {
    if (!add.name.trim() || !add.focus.trim()) {
      setErrorMessage("Add a name and focus first");
      return;
    }
    const baseId = slugifyCompetitorName(add.name);
    const id = creators.some((creator) => creator.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
    const creator: ContentCompetitor = {
      id,
      name: add.name.trim(),
      focus: add.focus.trim(),
      whyFit: add.whyFit.trim() || "Added to study how this creator earns attention and turns expertise into demand.",
      pillars: add.pillars.split(",").map((pillar) => pillar.trim()).filter(Boolean),
      signaturePattern: add.signaturePattern.trim() || "Capture the recurring hook, structure, proof, and call to action used in their strongest content.",
      andrewAdaptation: add.andrewAdaptation.trim() || "Translate the useful structure into Andrew's warm, proof-led voice and the 7-Figure CEO methodology.",
      notes: "",
      watchStatus: "watching",
      websiteUrl: add.websiteUrl.trim() || undefined,
    };
    const saved = await persistCreator(creator, `${creator.name} added to the watchlist`);
    if (!saved) return;
    setAdd(EMPTY_ADD);
    setShowAdd(false);
  }

  if (loading) {
    return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">Loading competitor intelligence…</div>;
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/[0.06] p-6 text-center">
        <p className="font-semibold text-rose-300">Competitor research could not be loaded.</p>
        <p className="mt-1 text-sm text-zinc-400">{loadError}</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-blue-950/40">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300">
              Competitor intelligence
            </div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">Research the pattern. Build the Andrew version.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Track creators serving the same buyer, identify what earns attention, then adapt the structure to Andrew&apos;s voice, proof, and methodology. Never clone the words.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-zinc-700/70 bg-black/20 px-4 py-2 text-center">
              <div className="text-xl font-bold text-white">{creators.length}</div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">models tracked</div>
            </div>
            <button onClick={() => setShowAdd((value) => !value)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500">
              {showAdd ? "Close" : "+ Add creator"}
            </button>
          </div>
        </div>
      </section>

      {showAdd && (
        <section className="rounded-2xl border border-blue-500/30 bg-blue-500/[0.04] p-5">
          <div className="mb-4">
            <h3 className="font-semibold text-white">Add another content model</h3>
            <p className="mt-1 text-xs text-zinc-500">Start with the basics. You can capture deeper observations in their research notes.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={add.name} onChange={(event) => setAdd({ ...add, name: event.target.value })} placeholder="Creator name" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
            <input value={add.focus} onChange={(event) => setAdd({ ...add, focus: event.target.value })} placeholder="Primary focus" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
            <input value={add.pillars} onChange={(event) => setAdd({ ...add, pillars: event.target.value })} placeholder="Content pillars, separated by commas" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none md:col-span-2" />
            <textarea value={add.whyFit} onChange={(event) => setAdd({ ...add, whyFit: event.target.value })} rows={2} placeholder="Why this creator fits Andrew's market" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
            <textarea value={add.signaturePattern} onChange={(event) => setAdd({ ...add, signaturePattern: event.target.value })} rows={2} placeholder="Signature content pattern" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
            <textarea value={add.andrewAdaptation} onChange={(event) => setAdd({ ...add, andrewAdaptation: event.target.value })} rows={2} placeholder="How Andrew should adapt it" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
            <input value={add.websiteUrl} onChange={(event) => setAdd({ ...add, websiteUrl: event.target.value })} placeholder="Official website, optional" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
          </div>
          <button onClick={() => void addCreator()} disabled={saving} className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">Add to watchlist</button>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-600">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creators, pillars, or positioning…" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {(["all", "active", "watching", "paused"] as const).map((status) => (
            <button key={status} onClick={() => setStatusFilter(status)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${statusFilter === status ? "border-blue-500/50 bg-blue-500/15 text-blue-200" : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-white"}`}>
              {status === "all" ? "All" : STATUS_META[status].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,1.08fr)]">
        <section className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {shown.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-600">No creators match this filter.</div>}
          {shown.map((creator) => {
            const active = selected?.id === creator.id;
            const status = STATUS_META[creator.watchStatus];
            return (
              <button key={creator.id} onClick={() => setSelectedId(creator.id)} className={`group rounded-2xl border p-4 text-left transition-all ${active ? "border-blue-500/50 bg-blue-500/[0.08] shadow-[0_0_30px_rgba(37,99,235,0.08)]" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-white">{creator.name}</h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{creator.focus}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.classes}`}>{status.label}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {creator.pillars.slice(0, 3).map((pillar) => <span key={pillar} className="rounded-md bg-zinc-950/60 px-2 py-1 text-[10px] text-zinc-400">{pillar}</span>)}
                </div>
              </button>
            );
          })}
        </section>

        {selected && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 lg:sticky lg:top-4 lg:self-start">
            <div className="border-b border-zinc-800 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <p className="mt-1 text-sm text-blue-300">{selected.focus}</p>
                </div>
                <select value={selected.watchStatus} onChange={(event) => void changeStatus(event.target.value as CompetitorWatchStatus)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold focus:outline-none ${STATUS_META[selected.watchStatus].classes}`}>
                  <option value="active">Active study</option>
                  <option value="watching">Watchlist</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">Why this fits</p>
                <p className="text-sm leading-relaxed text-zinc-300">{selected.whyFit}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3.5">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Signature pattern</p>
                  <p className="text-xs leading-relaxed text-zinc-300">{selected.signaturePattern}</p>
                </div>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3.5">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-400">Andrew&apos;s adaptation</p>
                  <p className="text-xs leading-relaxed text-zinc-300">{selected.andrewAdaptation}</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">Research now</p>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const links = buildResearchLinks(selected.name);
                    return (
                      <>
                        <a href={links.youtube} target="_blank" rel="noreferrer" className="rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/15">YouTube ↗</a>
                        <a href={links.instagram} target="_blank" rel="noreferrer" className="rounded-lg border border-pink-500/25 bg-pink-500/[0.07] px-3 py-2 text-xs font-semibold text-pink-300 hover:bg-pink-500/15">Instagram ↗</a>
                        <a href={links.linkedin} target="_blank" rel="noreferrer" className="rounded-lg border border-sky-500/25 bg-sky-500/[0.07] px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/15">LinkedIn ↗</a>
                        <a href={links.google} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700">Web search ↗</a>
                        {selected.websiteUrl && <a href={selected.websiteUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15">Official site ↗</a>}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">Research notes</label>
                  <span className="text-[10px] text-zinc-600">Hooks, formats, proof, CTAs, links</span>
                </div>
                <textarea value={selected.notes} onChange={(event) => updateSelected({ notes: event.target.value })} rows={6} placeholder="Paste links and capture what worked, why it worked, and how Andrew can make it original…" className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm leading-relaxed text-white placeholder-zinc-700 focus:border-blue-500 focus:outline-none" />
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
                <button onClick={() => void saveNotes()} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50">{saving ? "Saving…" : "Save research"}</button>
                <button onClick={() => void saveToIdeas()} disabled={saving} className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-xs font-bold text-violet-200 hover:bg-violet-500/20 disabled:opacity-50">Send model to Ideas</button>
                {message && <span className="text-xs font-medium text-emerald-400">{message}</span>}
                {errorMessage && <span className="text-xs font-medium text-rose-400">{errorMessage}</span>}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
