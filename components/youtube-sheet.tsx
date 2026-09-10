"use client";

/**
 * YouTube production, as a spreadsheet in the order work actually moves.
 *
 * The old table was nine columns and 1,850 pixels wide, ungrouped, so an idea
 * you had not shot sat next to a video that was already live. Rows are grouped
 * by stage now — idea, planning, recording, editing, ready, published — because
 * the stage is the thing that tells you what to do with a row.
 *
 * The column that did not exist is the one that matters most once the camera is
 * off: paste the link to what you shot, and the sidebar writes the listing from
 * the real transcript rather than from the plan.
 */

import { useMemo, useState } from "react";
import { YOUTUBE_STAGES, type YouTubeFormat, type YouTubeStage } from "@/lib/youtube";
import { parseVideoId, studioUrl } from "@/lib/youtube-seo";
import type { SeoPackage } from "@/lib/youtube-seo";

export type SheetItem = {
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

export type SheetPatch = {
  title?: string; format?: YouTubeFormat; targetDate?: string | null; stage?: YouTubeStage;
  viewer?: string; promise?: string; primaryKeyword?: string; openingHook?: string; mediaUrl?: string;
};

const STAGE_META: Record<YouTubeStage, { label: string; icon: string; dot: string; blurb: string }> = {
  idea: { label: "Ideas", icon: "💡", dot: "bg-zinc-500", blurb: "Nothing written yet" },
  planning: { label: "Scripted", icon: "📝", dot: "bg-blue-500", blurb: "Has a package, ready to shoot" },
  recording: { label: "Shooting", icon: "🎬", dot: "bg-amber-500", blurb: "In front of the camera" },
  editing: { label: "Editing", icon: "✂️", dot: "bg-violet-500", blurb: "Cut, not out yet" },
  ready: { label: "Ready to post", icon: "🚀", dot: "bg-emerald-500", blurb: "Listing written, waiting on upload" },
  published: { label: "Published", icon: "✅", dot: "bg-emerald-600", blurb: "Live on the channel" },
};

const metaString = (item: SheetItem, key: string) =>
  typeof item.meta?.[key] === "string" ? (item.meta[key] as string) : "";
const stageOf = (item: SheetItem): YouTubeStage =>
  YOUTUBE_STAGES.includes(item.meta?.video_stage as YouTubeStage) ? (item.meta.video_stage as YouTubeStage) : "idea";
const formatOf = (item: SheetItem): YouTubeFormat => (item.meta?.youtube_format === "short" ? "short" : "long_form");
const seoOf = (item: SheetItem): SeoPackage | null =>
  item.meta?.youtube_seo && typeof item.meta.youtube_seo === "object" ? (item.meta.youtube_seo as SeoPackage) : null;
const videoUrlOf = (item: SheetItem) => item.media_urls?.[0] ?? "";

const cell =
  "w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xs text-zinc-300 hover:border-zinc-800 focus:border-red-500 focus:bg-zinc-950 focus:outline-none";

export default function YouTubeSheet({ items, loading, error, onCreated, onUpdated, studioHref }: {
  items: SheetItem[];
  loading?: boolean;
  error?: string | null;
  onCreated: (item: SheetItem) => void;
  onUpdated: (item: SheetItem) => void;
  studioHref: string;
}) {
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<YouTubeFormat>("long_form");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) => !search ||
      `${item.title} ${metaString(item, "target_viewer")} ${metaString(item, "promise")} ${metaString(item, "primary_keyword")}`
        .toLowerCase().includes(search));
  }, [items, query]);

  const sections = useMemo(
    () => YOUTUBE_STAGES.map((stage) => ({ stage, items: rows.filter((item) => stageOf(item) === stage) })),
    [rows],
  );

  async function createIdea() {
    if (!title.trim() || creating) return;
    setCreating(true); setMessage(null);
    try {
      const response = await fetch("/api/youtube/content", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), format }),
      });
      const data = await response.json();
      if (!response.ok || !data.item) throw new Error(data.error ?? "Could not add the idea");
      onCreated(data.item as SheetItem); setTitle("");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not add the idea"); }
    finally { setCreating(false); }
  }

  async function patchItem(id: string, patch: SheetPatch) {
    const current = items.find((item) => item.id === id);
    if (!current?.updated_at) { setMessage("This row has no revision token. Refresh before saving."); return; }
    setBusyId(id); setMessage(null);
    try {
      const response = await fetch("/api/youtube/content", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, expectedUpdatedAt: current.updated_at, ...patch }),
      });
      const data = await response.json();
      if (!response.ok || !data.item) throw new Error(data.error ?? "Could not save the change");
      onUpdated(data.item as SheetItem);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not save the change"); }
    finally { setBusyId(null); }
  }

  const open = openId ? items.find((item) => item.id === openId) ?? null : null;

  return (
    <section className="space-y-4" aria-labelledby="youtube-sheet-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-400">Idea to published</p>
          <h2 id="youtube-sheet-title" className="mt-1 text-xl font-black text-white">YouTube production</h2>
          <p className="mt-1 text-xs text-zinc-500">Every row moves left to right. Paste the link once it&rsquo;s shot and the listing writes itself from the transcript.</p>
        </div>
        <a href={studioHref} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-bold text-zinc-200 transition-colors hover:border-red-500 hover:text-white">
          ▶️ YouTube Studio ↗
        </a>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="grid gap-2 md:grid-cols-[1fr_150px_auto]">
          <input aria-label="New YouTube idea" value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createIdea(); }}
            placeholder="Add an idea or working title…"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none" />
          <select aria-label="New idea format" value={format} onChange={(e) => setFormat(e.target.value as YouTubeFormat)}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-zinc-300">
            <option value="long_form">Long-form</option><option value="short">Short</option>
          </select>
          <button type="button" onClick={() => void createIdea()} disabled={!title.trim() || creating}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white hover:bg-red-500 disabled:opacity-50">
            {creating ? "Adding…" : "+ Add idea"}
          </button>
        </div>
      </div>

      <input aria-label="Search YouTube production" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search ideas, viewers, promises, keywords…"
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none" />

      {message && <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{message}</p>}

      {loading ? (
        <div className="rounded-2xl border border-zinc-800 p-8 text-center text-sm text-zinc-400">Loading YouTube production…</div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center text-sm text-rose-200">{error}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead className="bg-zinc-950/95">
                <tr className="border-b border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  <th className="min-w-[260px] px-3 py-3">Title</th>
                  <th className="w-24 px-3 py-3">Format</th>
                  <th className="w-32 px-3 py-3">Stage</th>
                  <th className="w-32 px-3 py-3">Target</th>
                  <th className="w-16 px-3 py-3 text-center" title="Has a written script and package">Script</th>
                  <th className="min-w-[220px] px-3 py-3">Shot video link</th>
                  <th className="w-32 px-3 py-3">Listing</th>
                  <th className="w-14 px-2 py-3" />
                </tr>
              </thead>
              {sections.map(({ stage, items: sectionItems }) => (
                <tbody key={stage}>
                  <tr className="border-y border-zinc-800 bg-zinc-950/80">
                    <td colSpan={8} className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${STAGE_META[stage].dot}`} />
                        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-300">
                          {STAGE_META[stage].icon} {STAGE_META[stage].label}
                        </span>
                        <span className="text-[11px] text-zinc-500">{sectionItems.length}</span>
                        <span className="text-[11px] text-zinc-700">{STAGE_META[stage].blurb}</span>
                      </span>
                    </td>
                  </tr>
                  {sectionItems.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-2 text-[11px] text-zinc-700">Nothing here.</td></tr>
                  ) : sectionItems.map((item, index) => (
                    <Row key={item.id} item={item} striped={index % 2 === 1} busy={busyId === item.id}
                      onPatch={patchItem} onOpen={() => setOpenId(item.id)} />
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      )}

      {open && (
        <VideoDrawer item={open} onClose={() => setOpenId(null)} onUpdated={onUpdated}
          onPatch={patchItem} busy={busyId === open.id} />
      )}
    </section>
  );
}

function Row({ item, striped, busy, onPatch, onOpen }: {
  item: SheetItem; striped: boolean; busy: boolean;
  onPatch: (id: string, patch: SheetPatch) => void; onOpen: () => void;
}) {
  const link = videoUrlOf(item);
  const videoId = parseVideoId(link);
  const seo = seoOf(item);
  const hasScript = Boolean(item.video_script || item.meta?.youtube_package);

  return (
    <tr className={`group align-middle transition-colors hover:bg-red-500/[0.03] ${striped ? "bg-zinc-900/30" : ""} ${busy ? "opacity-60" : ""}`}>
      <td className="px-2 py-1.5">
        <input defaultValue={item.title} key={`${item.id}-${item.title}`} aria-label={`Title for ${item.title}`}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== item.title) onPatch(item.id, { title: v }); }}
          className={`${cell} font-bold text-white`} />
      </td>
      <td className="px-2 py-1.5">
        <select aria-label={`Format for ${item.title}`} value={formatOf(item)}
          onChange={(e) => onPatch(item.id, { format: e.target.value as YouTubeFormat })}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-300">
          <option value="long_form">Long</option><option value="short">Short</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select aria-label={`Stage for ${item.title}`} value={stageOf(item)}
          onChange={(e) => onPatch(item.id, { stage: e.target.value as YouTubeStage })}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-300">
          {YOUTUBE_STAGES.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input type="date" aria-label={`Target date for ${item.title}`} value={item.scheduled_date ?? ""}
          onChange={(e) => onPatch(item.id, { targetDate: e.target.value || null })}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-300" />
      </td>
      <td className="px-2 py-1.5 text-center">
        <span title={hasScript ? "Script and package written" : "No script yet"}
          className={`text-xs ${hasScript ? "" : "opacity-25"}`}>{hasScript ? "📝" : "—"}</span>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <input defaultValue={link} key={`${item.id}-link-${link}`} placeholder="Paste the YouTube link…"
            aria-label={`Shot video link for ${item.title}`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== link) onPatch(item.id, { mediaUrl: v }); }}
            className={`${cell} ${videoId ? "text-emerald-300" : "text-zinc-400"}`} />
          {videoId && (
            <a href={studioUrl(videoId)} target="_blank" rel="noreferrer" title="Open in YouTube Studio"
              className="flex-shrink-0 rounded px-1 text-[11px] text-zinc-600 hover:text-red-300">↗</a>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <button type="button" onClick={onOpen}
          className={`w-full rounded-lg px-2 py-1.5 text-[10px] font-black transition-colors ${
            seo ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              : videoId ? "bg-gradient-to-r from-red-600 to-orange-500 text-white"
              : "border border-zinc-800 text-zinc-600"}`}>
          {seo ? "✓ Written" : videoId ? "Write SEO" : "Needs link"}
        </button>
      </td>
      <td className="px-2 py-1.5 text-center">
        <button type="button" onClick={onOpen} aria-label={`Open ${item.title}`}
          className="text-xs text-zinc-700 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100">→</button>
      </td>
    </tr>
  );
}

/**
 * The sidebar. Everything you paste into YouTube, with a copy button beside it,
 * because a listing you have to retype is a listing you will not use.
 */
function VideoDrawer({ item, onClose, onUpdated, onPatch, busy }: {
  item: SheetItem; onClose: () => void; onUpdated: (item: SheetItem) => void;
  onPatch: (id: string, patch: SheetPatch) => void; busy: boolean;
}) {
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const link = videoUrlOf(item);
  const videoId = parseVideoId(link);
  const seo = seoOf(item);
  const pkg = item.meta?.youtube_package as Record<string, unknown> | undefined;

  async function writeSeo() {
    if (!videoId || working) return;
    setWorking(true); setProblem(null);
    try {
      const response = await fetch("/api/youtube/seo", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, videoUrl: link }),
      });
      const data = await response.json();
      if (!response.ok || !data.item) throw new Error(data.error ?? "Could not write the listing");
      onUpdated(data.item as SheetItem);
    } catch (caught) { setProblem(caught instanceof Error ? caught.message : "Could not write the listing"); }
    finally { setWorking(false); }
  }

  const description = seo
    ? [seo.description, seo.chapters.length ? ["Chapters:", ...seo.chapters.map((c) => `${c.time} ${c.label}`)].join("\n") : ""]
        .filter(Boolean).join("\n\n")
    : "";

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside role="dialog" aria-label={`${item.title} listing`}
        className="flex h-full w-full max-w-2xl flex-col border-l border-zinc-800 bg-zinc-950">
        <header className="border-b border-zinc-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-400">{STAGE_META[stageOf(item)].label}</p>
              <h3 className="mt-0.5 truncate text-lg font-bold text-white">{item.title}</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="text-2xl leading-none text-zinc-500 hover:text-white">&times;</button>
          </div>
          <div className="mt-3 flex gap-2">
            <input defaultValue={link} key={`drawer-${item.id}-${link}`} placeholder="Paste the YouTube link…"
              aria-label="Shot video link"
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== link) onPatch(item.id, { mediaUrl: v }); }}
              className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:border-red-500 focus:outline-none" />
            <button type="button" onClick={() => void writeSeo()} disabled={!videoId || working || busy}
              className="flex-shrink-0 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-3.5 py-2 text-xs font-black text-white disabled:opacity-40">
              {working ? "Reading…" : seo ? "Rewrite" : "Write SEO"}
            </button>
          </div>
          {!videoId && link && <p className="mt-2 text-[11px] text-amber-300">That does not look like a YouTube link.</p>}
          {working && <p className="mt-2 text-[11px] text-zinc-500">Pulling the transcript and writing the listing. This takes a minute.</p>}
          {problem && <p role="alert" className="mt-2 text-[11px] text-rose-300">{problem}</p>}
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {seo ? (
            <>
              <Field label="Title" value={seo.title} hint={`${seo.title.length}/100`} />
              <Field label="Description" value={description} multiline hint={`${description.length}/5000`} />
              {seo.tags.length > 0 && <Field label="Tags" value={seo.tags.join(", ")} hint={`${seo.tags.join(",").length}/500`} />}
              {seo.thumbnailText && <Field label="Thumbnail text" value={seo.thumbnailText} />}
              {seo.pinnedComment && <Field label="Pinned comment" value={seo.pinnedComment} multiline />}
              {seo.alternateTitles.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Other titles</p>
                  <ul className="mt-2 space-y-1">
                    {seo.alternateTitles.map((alt) => (
                      <li key={alt} className="flex items-start gap-2 text-xs text-zinc-400"><span className="text-zinc-700">•</span>{alt}</li>
                    ))}
                  </ul>
                </div>
              )}
              {seo.shortsHooks.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Worth cutting as Shorts</p>
                  <ul className="mt-2 space-y-1.5">
                    {seo.shortsHooks.map((hook) => <li key={hook} className="text-xs leading-relaxed text-zinc-400">&ldquo;{hook}&rdquo;</li>)}
                  </ul>
                </div>
              )}
              {videoId && (
                <a href={studioUrl(videoId)} target="_blank" rel="noreferrer"
                  className="block rounded-xl bg-zinc-800 px-4 py-2.5 text-center text-xs font-black text-white transition-colors hover:bg-zinc-700">
                  Open this video in YouTube Studio ↗
                </a>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
              <p className="text-sm text-zinc-500">
                {videoId ? "Ready. Hit Write SEO and the listing comes from what you actually said on camera."
                  : "Paste the link to the video you shot, and the listing gets written from its transcript."}
              </p>
            </div>
          )}

          {pkg && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <summary className="cursor-pointer text-xs font-bold text-white">The script you shot from</summary>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-400">{item.video_script}</pre>
            </details>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, hint, multiline }: { label: string; value: string; hint?: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</p>
        <div className="flex items-center gap-2">
          {hint && <span className="text-[10px] tabular-nums text-zinc-700">{hint}</span>}
          <button type="button"
            onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="rounded-lg border border-zinc-700 px-2 py-0.5 text-[10px] font-bold text-zinc-300 hover:border-zinc-500">
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      </div>
      <p className={`text-xs leading-relaxed text-zinc-300 ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</p>
    </div>
  );
}
