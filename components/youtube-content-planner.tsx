"use client";

import { useMemo, useState } from "react";
import { YOUTUBE_STAGES, type YouTubeFormat, type YouTubeStage } from "@/lib/youtube";

type PlannerItem = {
  id: string;
  title: string;
  scheduled_date: string | null;
  status: string;
  media_urls: string[];
  video_script: string | null;
  drafts: Record<string, string>;
  meta: Record<string, unknown>;
  updated_at?: string | null;
};

type PatchInput = { title?: string; format?: YouTubeFormat; targetDate?: string | null; stage?: YouTubeStage; viewer?: string; promise?: string; primaryKeyword?: string; openingHook?: string; mediaUrl?: string };

const metaString = (item: PlannerItem, key: string) => typeof item.meta?.[key] === "string" ? item.meta[key] as string : "";
const stageOf = (item: PlannerItem) => YOUTUBE_STAGES.includes(item.meta?.video_stage as YouTubeStage) ? item.meta.video_stage as YouTubeStage : "idea";
const formatOf = (item: PlannerItem): YouTubeFormat => item.meta?.youtube_format === "short" ? "short" : "long_form";

export default function YouTubeContentPlanner({ items, loading, error, onCreated, onUpdated }: {
  items: PlannerItem[];
  loading?: boolean;
  error?: string | null;
  onCreated: (item: PlannerItem) => void;
  onUpdated: (item: PlannerItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<YouTubeFormat>("long_form");
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<"all" | YouTubeFormat>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openPackageId, setOpenPackageId] = useState<string | null>(null);

  const rows = useMemo(() => items.filter((item) => {
    if (formatFilter !== "all" && formatOf(item) !== formatFilter) return false;
    const search = query.trim().toLowerCase();
    return !search || `${item.title} ${metaString(item, "target_viewer")} ${metaString(item, "promise")} ${metaString(item, "primary_keyword")}`.toLowerCase().includes(search);
  }), [items, query, formatFilter]);

  async function createIdea() {
    if (!title.trim() || creating) return;
    setCreating(true); setMessage(null);
    try {
      const response = await fetch("/api/youtube/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim(), format }) });
      const data = await response.json();
      if (!response.ok || !data.item) throw new Error(data.error ?? "Could not create the idea");
      onCreated(data.item as PlannerItem); setTitle(""); setMessage("Idea added to YouTube production.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the idea"); }
    finally { setCreating(false); }
  }

  async function patchItem(id: string, patch: PatchInput) {
    if (savingId || generatingId) return;
    const current = items.find((item) => item.id === id);
    if (!current?.updated_at) { setMessage("This item has no revision token. Refresh before saving."); return; }
    setSavingId(id); setMessage(null);
    try {
      const response = await fetch("/api/youtube/content", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, expectedUpdatedAt: current.updated_at, ...patch }) });
      const data = await response.json();
      if (!response.ok || !data.item) throw new Error(data.error ?? "Could not save the change");
      onUpdated(data.item as PlannerItem);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the change"); }
    finally { setSavingId(null); }
  }

  async function generatePackage(id: string) {
    if (savingId || generatingId) return;
    const current = items.find((item) => item.id === id);
    if (!current?.updated_at) { setMessage("This item has no revision token. Refresh before generating."); return; }
    setGeneratingId(id); setMessage("Building titles, script, SEO, chapters, and thumbnail brief…");
    try {
      const response = await fetch("/api/youtube/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, expectedUpdatedAt: current.updated_at }) });
      const data = await response.json();
      if (!response.ok || !data.item) throw new Error(data.error ?? "Could not generate the package");
      onUpdated(data.item as PlannerItem); setOpenPackageId(id); setMessage("Your record-ready YouTube package is ready.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate the package"); }
    finally { setGeneratingId(null); }
  }

  return (
    <section className="space-y-4" aria-labelledby="youtube-production-title">
      <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-400">Idea to published</p><h2 id="youtube-production-title" className="mt-1 text-xl font-black text-white">YouTube production spreadsheet</h2><p className="mt-1 text-xs text-zinc-500">Every row is a shared SalesOS Content record. Build the idea, package it for your board-led shooting style, then move it through production.</p></div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
          <input aria-label="New YouTube idea" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createIdea(); }} placeholder="Add a YouTube idea or working title…" className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none" />
          <select aria-label="New idea format" value={format} onChange={(event) => setFormat(event.target.value as YouTubeFormat)} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-zinc-300"><option value="long_form">Long-form</option><option value="short">Short</option></select>
          <button type="button" onClick={() => void createIdea()} disabled={!title.trim() || creating} className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">{creating ? "Adding…" : "+ Add idea"}</button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input aria-label="Search YouTube production" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ideas, viewers, promises, or keywords…" className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none" />
        <select aria-label="Filter production format" value={formatFilter} onChange={(event) => setFormatFilter(event.target.value as "all" | YouTubeFormat)} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300"><option value="all">All formats</option><option value="long_form">Long-form</option><option value="short">Shorts</option></select>
      </div>
      {message && <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{message}</p>}

      {loading ? <div className="rounded-2xl border border-zinc-800 p-8 text-center text-sm text-zinc-400">Loading YouTube production…</div> : error ? <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center text-sm text-rose-200">{error}</div> : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <div className="overflow-x-auto"><table className="w-full min-w-[1850px] border-collapse text-left"><thead className="bg-zinc-950/95"><tr className="border-b border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-500"><th className="min-w-[280px] px-3 py-3">Working title</th><th className="w-32 px-3 py-3">Format</th><th className="w-36 px-3 py-3">Stage</th><th className="w-36 px-3 py-3">Target date</th><th className="min-w-[220px] px-3 py-3">Viewer</th><th className="min-w-[260px] px-3 py-3">Promise</th><th className="min-w-[200px] px-3 py-3">Primary keyword</th><th className="min-w-[260px] px-3 py-3">Opening hook</th><th className="w-40 px-3 py-3">Package</th></tr></thead>
          <tbody className="divide-y divide-zinc-800/80">{rows.map((item) => { const busy = savingId === item.id || generatingId === item.id; const hasPackage = Boolean(item.meta?.youtube_package); return <tr key={item.id} className="align-top hover:bg-red-500/[0.03]">
            <td className="px-3 py-2"><input defaultValue={item.title} key={`${item.id}-${item.title}`} aria-label={`Working title: ${item.title}`} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== item.title) void patchItem(item.id, { title: value }); }} disabled={Boolean(savingId || generatingId)} className="w-full rounded-lg border border-transparent bg-transparent px-2 py-2 text-xs font-bold text-white hover:border-zinc-800 focus:border-red-500 focus:bg-zinc-950 focus:outline-none" /></td>
            <td className="px-3 py-2"><select aria-label={`Format for ${item.title}`} value={formatOf(item)} onChange={(event) => void patchItem(item.id, { format: event.target.value as YouTubeFormat })} disabled={Boolean(savingId || generatingId)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-300"><option value="long_form">Long-form</option><option value="short">Short</option></select></td>
            <td className="px-3 py-2"><select aria-label={`Stage for ${item.title}`} value={stageOf(item)} onChange={(event) => void patchItem(item.id, { stage: event.target.value as YouTubeStage })} disabled={Boolean(savingId || generatingId)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-300">{YOUTUBE_STAGES.map((stage) => <option key={stage} value={stage}>{stage[0].toUpperCase() + stage.slice(1)}</option>)}</select></td>
            <td className="px-3 py-2"><input type="date" aria-label={`Target date for ${item.title}`} value={item.scheduled_date ?? ""} onChange={(event) => void patchItem(item.id, { targetDate: event.target.value || null })} disabled={Boolean(savingId || generatingId)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-300" /></td>
            <EditableCell item={item} field="viewer" value={metaString(item, "target_viewer")} onSave={patchItem} disabled={Boolean(savingId || generatingId)} />
            <EditableCell item={item} field="promise" value={metaString(item, "promise")} onSave={patchItem} disabled={Boolean(savingId || generatingId)} />
            <EditableCell item={item} field="primaryKeyword" value={metaString(item, "primary_keyword")} onSave={patchItem} disabled={Boolean(savingId || generatingId)} />
            <EditableCell item={item} field="openingHook" value={metaString(item, "opening_hook")} onSave={patchItem} disabled={Boolean(savingId || generatingId)} />
            <td className="px-3 py-2"><button type="button" onClick={() => void generatePackage(item.id)} disabled={Boolean(savingId || generatingId)} className="w-full rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">{generatingId === item.id ? "Building…" : hasPackage ? "Regenerate" : "Generate package"}</button>{hasPackage && <button type="button" onClick={() => setOpenPackageId(openPackageId === item.id ? null : item.id)} className="mt-1 w-full rounded-lg border border-zinc-700 px-3 py-2 text-[10px] font-bold text-zinc-300">{openPackageId === item.id ? "Hide package" : "View package"}</button>}{busy && <p className="mt-1 text-center text-[9px] text-zinc-600">Saving…</p>}</td>
          </tr>; })}</tbody></table></div>
          {rows.length === 0 && <div className="p-8 text-center text-sm text-zinc-500">No YouTube ideas match this view.</div>}
        </div>
      )}

      {openPackageId && (() => { const item = items.find((candidate) => candidate.id === openPackageId); const pkg = item?.meta?.youtube_package as Record<string, unknown> | undefined; if (!item || !pkg) return null; return <section className="rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-red-400">Record-ready package</p><h3 className="mt-1 text-lg font-black text-white">{String(pkg.recommendedTitle ?? item.title)}</h3></div><button type="button" onClick={() => setOpenPackageId(null)} className="text-xs text-zinc-500">Close</button></div><div className="mt-4 grid gap-3 lg:grid-cols-2"><PackageBlock title="Opening hook" value={pkg.openingHook} /><PackageBlock title="Thumbnail" value={`${String(pkg.thumbnailText ?? "")}\n${String(pkg.thumbnailBrief ?? "")}`} /><PackageBlock title="Framework" value={pkg.framework} /><PackageBlock title="SEO description" value={pkg.seoDescription} /></div><details className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"><summary className="cursor-pointer text-xs font-bold text-white">Full spoken script and directions</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-300">{item.video_script}</pre></details></section>; })()}
    </section>
  );
}

function EditableCell({ item, field, value, onSave, disabled }: { item: PlannerItem; field: "viewer" | "promise" | "primaryKeyword" | "openingHook"; value: string; onSave: (id: string, patch: PatchInput) => Promise<void>; disabled: boolean }) {
  return <td className="px-3 py-2"><textarea defaultValue={value} key={`${item.id}-${field}-${value}`} aria-label={`${field} for ${item.title}`} onBlur={(event) => { const next = event.target.value.trim(); if (next !== value) void onSave(item.id, { [field]: next }); }} disabled={disabled} rows={2} className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-2 text-xs leading-relaxed text-zinc-300 hover:border-zinc-800 focus:border-red-500 focus:bg-zinc-950 focus:outline-none" /></td>;
}

function PackageBlock({ title, value }: { title: string; value: unknown }) { return <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{title}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{typeof value === "string" ? value : "Unavailable"}</p></div>; }
