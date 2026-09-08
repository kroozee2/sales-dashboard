"use client";

/**
 * The Create board: idea → script → thumbnail → a time to film it.
 *
 * The spreadsheet is still there behind a toggle, and it is the right tool for
 * editing twelve fields across twenty rows. It is the wrong tool for the
 * question you actually open this tab with, which is "what is the next thing I
 * do to get a video made". Each card answers that in one line.
 */

import { useMemo, useState } from "react";
import {
  PIPELINE_STEPS, buildPipeline, nextStep, readiness, readinessScore,
  stageOf, YOUTUBE_STAGES,
  type PipelineItem, type PipelineStep, type YouTubeFormat, type YouTubeStage,
} from "@/lib/youtube";

export type CreateItem = PipelineItem & {
  status: string;
  drafts: Record<string, string>;
  updated_at?: string | null;
};

export type PatchInput = {
  title?: string; format?: YouTubeFormat; targetDate?: string | null; stage?: YouTubeStage;
  viewer?: string; promise?: string; primaryKeyword?: string; openingHook?: string;
  mediaUrl?: string; shootAt?: string | null;
};

const TONE: Record<string, { text: string; pill: string; rule: string; bar: string }> = {
  amber: { text: "text-amber-300", pill: "border-amber-500/30 bg-amber-500/10 text-amber-300", rule: "bg-amber-500/20", bar: "from-amber-500 to-orange-400" },
  blue: { text: "text-blue-300", pill: "border-blue-500/30 bg-blue-500/10 text-blue-300", rule: "bg-blue-500/20", bar: "from-blue-500 to-cyan-400" },
  red: { text: "text-red-300", pill: "border-red-500/30 bg-red-500/10 text-red-300", rule: "bg-red-500/20", bar: "from-red-500 to-orange-500" },
  violet: { text: "text-violet-300", pill: "border-violet-500/30 bg-violet-500/10 text-violet-300", rule: "bg-violet-500/20", bar: "from-violet-500 to-fuchsia-400" },
  emerald: { text: "text-emerald-300", pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", rule: "bg-emerald-500/20", bar: "from-emerald-500 to-teal-400" },
};

const metaString = (item: CreateItem, key: string) =>
  typeof item.meta?.[key] === "string" ? (item.meta[key] as string) : "";

/** "2026-09-12T15:00:00Z" → the value a datetime-local input wants. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function shootLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function YouTubePipeline({
  items, loading, error, busyId, onPatch, onGenerate, onCreate, onOpenPackage,
}: {
  items: CreateItem[];
  loading?: boolean;
  error?: string | null;
  busyId: string | null;
  onPatch: (id: string, patch: PatchInput) => void;
  onGenerate: (id: string) => void;
  onCreate: (title: string, format: YouTubeFormat) => void;
  onOpenPackage: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<YouTubeFormat>("long_form");
  const board = useMemo(() => buildPipeline(items), [items]);
  const [showPublished, setShowPublished] = useState(false);

  const submit = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), format);
    setTitle("");
  };

  if (loading) return <p className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-10 text-center text-sm text-zinc-400">Loading the pipeline…</p>;
  if (error) return <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center text-sm text-rose-200">{error}</p>;

  const readyToShoot = items.filter((item) => stageOf(item) !== "published" && nextStep(item) === null);

  return (
    <div className="space-y-5">
      {/* Capture — the fastest possible path from thought to row */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_150px_auto]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="New video idea — say it the way you'd say it out loud…"
            aria-label="New YouTube idea"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none"
          />
          <select value={format} onChange={(e) => setFormat(e.target.value as YouTubeFormat)} aria-label="Format"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-zinc-300 focus:border-red-500 focus:outline-none">
            <option value="long_form">🎥 Long-form</option>
            <option value="short">⚡ Short</option>
          </select>
          <button type="button" onClick={submit} disabled={!title.trim()}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black text-white transition-colors hover:bg-red-500 disabled:opacity-40">
            + Add idea
          </button>
        </div>
      </div>

      {/* What's actually shootable, and when */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Booked to shoot" emoji="🎬" count={board.booked.length}>
          {board.booked.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-600">
              Nothing in the calendar yet. Set a shoot time on a card and it appears here.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {board.booked.slice(0, 5).map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-40 flex-shrink-0 text-[11px] font-bold text-red-300">{shootLabel(String(item.meta.shoot_at))}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{item.title}</span>
                  <ReadyDots item={item} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Ready to film" emoji="✅" count={readyToShoot.length}>
          {readyToShoot.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-600">
              A video is ready when it has an angle, a script, a thumbnail and a time.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {readyToShoot.slice(0, 5).map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{item.title}</span>
                  <span className="flex-shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">All four done</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* The lanes */}
      {board.lanes.map((lane) => {
        const tone = TONE[lane.tone] ?? TONE.blue;
        return (
          <section key={lane.key}>
            <div className="mb-2.5 flex items-center gap-2.5">
              <h3 className={`text-sm font-black ${tone.text}`}>{lane.emoji} {lane.label}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone.pill}`}>{lane.items.length}</span>
              <div className={`h-px flex-1 ${tone.rule}`} />
            </div>
            {lane.items.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-800 px-4 py-5 text-center text-xs text-zinc-700">Nothing here.</p>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {lane.items.map((item) => (
                  <Card key={item.id} item={item} tone={tone.bar} busy={busyId === item.id}
                    onPatch={onPatch} onGenerate={onGenerate} onOpenPackage={onOpenPackage} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {board.published.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowPublished((v) => !v)} className="group mb-2.5 flex w-full items-center gap-2.5 text-left">
            <h3 className="text-sm font-black text-zinc-500 transition-colors group-hover:text-zinc-300">
              {showPublished ? "▾" : "▸"} 📺 Published
            </h3>
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-500">{board.published.length}</span>
            <div className="h-px flex-1 bg-zinc-800/70" />
          </button>
          {showPublished && (
            <div className="grid gap-3 opacity-60 xl:grid-cols-2">
              {board.published.map((item) => (
                <Card key={item.id} item={item} tone="from-zinc-600 to-zinc-500" busy={busyId === item.id}
                  onPatch={onPatch} onGenerate={onGenerate} onOpenPackage={onOpenPackage} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Panel({ title, emoji, count, children }: { title: string; emoji: string; count: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
        <h3 className="text-sm font-black text-white">{emoji} {title}</h3>
        <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-500">{count}</span>
      </header>
      {children}
    </section>
  );
}

const STEP_LABEL: Record<PipelineStep, string> = { angle: "Angle", script: "Script", thumbnail: "Thumbnail", shoot: "Shoot" };

function ReadyDots({ item }: { item: CreateItem }) {
  const state = readiness(item);
  return (
    <span className="flex flex-shrink-0 gap-1">
      {PIPELINE_STEPS.map((step) => (
        <span key={step.key} title={`${STEP_LABEL[step.key]}: ${state[step.key] ? "done" : "not yet"}`}
          className={`h-1.5 w-4 rounded-full ${state[step.key] ? "bg-emerald-400" : "bg-zinc-700"}`} />
      ))}
    </span>
  );
}

function Card({ item, tone, busy, onPatch, onGenerate, onOpenPackage }: {
  item: CreateItem; tone: string; busy: boolean;
  onPatch: (id: string, patch: PatchInput) => void;
  onGenerate: (id: string) => void;
  onOpenPackage: (id: string) => void;
}) {
  const state = readiness(item);
  const pct = readinessScore(item) * 100;
  const next = nextStep(item);
  const modelled = item.meta?.modelled_from as Record<string, unknown> | undefined;
  const hasPackage = Boolean(item.meta?.youtube_package);
  const shootAt = typeof item.meta?.shoot_at === "string" ? item.meta.shoot_at : "";
  const format = item.meta?.youtube_format === "short" ? "short" : "long_form";
  const [expanded, setExpanded] = useState(false);

  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl border bg-zinc-900/70 transition-colors ${next === null ? "border-emerald-500/30" : "border-zinc-800 hover:border-zinc-700"}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <input
              defaultValue={item.title}
              key={`${item.id}-${item.title}`}
              aria-label={`Title: ${item.title}`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== item.title) onPatch(item.id, { title: v }); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-white hover:border-zinc-800 focus:border-red-500 focus:bg-zinc-950 focus:outline-none"
            />
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] text-zinc-500">
              <span>{format === "short" ? "⚡ Short" : "🎥 Long-form"}</span>
              {modelled?.channel ? <><span className="text-zinc-700">·</span><span className="text-red-300">modelled on {String(modelled.channel)}</span></> : null}
              {next === null ? <><span className="text-zinc-700">·</span><span className="font-bold text-emerald-400">ready to film</span></>
                : <><span className="text-zinc-700">·</span><span className="text-amber-300">next: {STEP_LABEL[next]}</span></>}
            </p>
          </div>
          <select
            value={stageOf(item)}
            onChange={(e) => onPatch(item.id, { stage: e.target.value as YouTubeStage })}
            aria-label={`Stage for ${item.title}`}
            disabled={busy}
            className="flex-shrink-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] font-semibold text-zinc-300 focus:border-red-500 focus:outline-none"
          >
            {YOUTUBE_STAGES.map((stage) => <option key={stage} value={stage}>{stage[0].toUpperCase() + stage.slice(1)}</option>)}
          </select>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {PIPELINE_STEPS.map((step) => (
            <span key={step.key} title={step.hint}
              className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${
                state[step.key]
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-800 bg-zinc-950 text-zinc-600"
              }`}>
              {state[step.key] ? "✓" : step.emoji} {STEP_LABEL[step.key]}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onGenerate(item.id)} disabled={busy}
            className="rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-3 py-1.5 text-[11px] font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? "Working…" : hasPackage ? "↻ Rewrite script" : "✨ Write the script"}
          </button>
          {hasPackage && (
            <button type="button" onClick={() => onOpenPackage(item.id)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[11px] font-bold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white">
              📄 Open package
            </button>
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            🎬
            <input
              type="datetime-local"
              value={shootAt ? toLocalInput(shootAt) : ""}
              onChange={(e) => onPatch(item.id, { shootAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              aria-label={`Shoot time for ${item.title}`}
              disabled={busy}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300 focus:border-red-500 focus:outline-none"
            />
          </label>
          <button type="button" onClick={() => setExpanded((v) => !v)}
            className="ml-auto text-[11px] text-zinc-600 transition-colors hover:text-zinc-300">
            {expanded ? "Hide details" : "Details"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-zinc-800 bg-zinc-950/50 p-4">
          {modelled ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Modelled from</p>
              <a href={String(modelled.videoUrl ?? "#")} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-bold text-white hover:text-red-200">
                {String(modelled.videoTitle ?? "")} ↗
              </a>
              {typeof modelled.whyItWorked === "string" && <p className="mt-2 text-[11px] leading-relaxed text-zinc-400"><span className="font-bold text-zinc-300">Why it worked:</span> {modelled.whyItWorked}</p>}
              {typeof modelled.differentiator === "string" && <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400"><span className="font-bold text-zinc-300">What only you can say:</span> {modelled.differentiator}</p>}
            </div>
          ) : null}

          <Field label="Who it's for" value={metaString(item, "target_viewer")} onSave={(v) => onPatch(item.id, { viewer: v })} disabled={busy} />
          <Field label="What they get" value={metaString(item, "promise")} onSave={(v) => onPatch(item.id, { promise: v })} disabled={busy} />
          <Field label="Opening hook (spoken)" value={metaString(item, "opening_hook")} onSave={(v) => onPatch(item.id, { openingHook: v })} disabled={busy} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-600">Publish target</label>
              <input type="date" value={item.scheduled_date ?? ""} disabled={busy}
                onChange={(e) => onPatch(item.id, { targetDate: e.target.value || null })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 focus:border-red-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-600">Thumbnail URL</label>
              <input
                defaultValue={item.media_urls?.[0] ?? ""}
                key={`${item.id}-thumb-${item.media_urls?.[0] ?? ""}`}
                placeholder="Paste from the Thumbnail Studio below"
                disabled={busy}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (item.media_urls?.[0] ?? "")) onPatch(item.id, { mediaUrl: v }); }}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 focus:border-red-500 focus:outline-none" />
            </div>
          </div>

          {item.media_urls?.[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.media_urls[0]} alt="" className="h-28 w-auto rounded-xl border border-zinc-800 object-cover" />
          )}
        </div>
      )}
    </article>
  );
}

function Field({ label, value, onSave, disabled }: { label: string; value: string; onSave: (v: string) => void; disabled: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</label>
      <textarea
        defaultValue={value}
        key={`${label}-${value}`}
        rows={2}
        disabled={disabled}
        onBlur={(e) => { const next = e.target.value.trim(); if (next !== value) onSave(next); }}
        className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs leading-relaxed text-zinc-300 focus:border-red-500 focus:outline-none"
      />
    </div>
  );
}
