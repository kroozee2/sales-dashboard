"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * Competitor research, built around one question: which of their videos beat
 * their own channel, and what is the version of that we should make?
 *
 * Raw view counts across channels of different sizes are noise. A video at 4×
 * its own channel's median is signal — that is the idea working, separate from
 * the audience it landed in front of. So every number here is relative to the
 * channel it came from, and the primary action on any video is "model this",
 * which names why it worked before proposing ours.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScoredVideo } from "@/lib/youtube-research";
import type { YouTubeFormat } from "@/lib/youtube";

type ChannelSummary = {
  tracked: number; longCount: number; shortCount: number;
  medianLongViews: number; medianShortViews: number;
  uploadsPerMonth: number | null; lastPublishedDays: number | null;
};

type ResearchChannel = {
  id: string; handle: string; name: string; channel_url: string;
  subscribers: number | null; total_views: number | null; video_count: number | null;
  why_watch: string | null; last_synced_at: string | null; last_sync_error: string | null;
  summary: ChannelSummary; videos: ScoredVideo[]; outliers: ScoredVideo[];
};

type Angle = {
  whyItWorked: string; ourAngle: string; title: string; alternateTitles: string[];
  viewer: string; promise: string; openingHook: string; primaryKeyword: string;
  thumbnailText: string; differentiator: string;
};

const nf = new Intl.NumberFormat("en-US");
const compact = (n: number | null) =>
  n === null ? "—" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : nf.format(n);

const ageLabel = (days: number | null) =>
  days === null ? "" : days < 31 ? `${days}d ago` : days < 365 ? `${Math.round(days / 30)}mo ago` : `${(days / 365).toFixed(1)}y ago`;

export default function YouTubeResearch({ onModelled }: { onModelled?: () => void }) {
  const [channels, setChannels] = useState<ResearchChannel[]>([]);
  const [outliers, setOutliers] = useState<ScoredVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<"outliers" | string>("outliers");
  const [modellingId, setModellingId] = useState<string | null>(null);
  const [angle, setAngle] = useState<{ video: ScoredVideo; angle: Angle; saved: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/youtube/research", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Research is unavailable");
      setChannels(data.competitors ?? []);
      setOutliers(data.outliers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research is unavailable");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function sync() {
    if (syncing) return;
    setSyncing(true);
    setMessage("Pulling recent uploads from each channel. This takes a couple of minutes.");
    try {
      const response = await fetch("/api/youtube/research/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Refresh failed");
      const failed = (data.results ?? []).filter((r: { error?: string }) => r.error);
      setMessage(failed.length
        ? `Refreshed ${data.synced} videos. ${failed.map((r: { handle: string }) => r.handle).join(", ")} did not respond.`
        : `Refreshed ${data.synced} videos across ${data.results?.length ?? 0} channels.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Refresh failed");
    } finally { setSyncing(false); }
  }

  async function model(video: ScoredVideo, createIdea: boolean, format: YouTubeFormat) {
    if (modellingId) return;
    setModellingId(video.video_id);
    setMessage(createIdea ? "Working out why it landed, then writing our version…" : "Working out why it landed…");
    try {
      const response = await fetch("/api/youtube/research/model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.video_id, createIdea, format }),
      });
      const data = await response.json();
      if (!response.ok || !data.angle) throw new Error(data.error ?? "Could not model that video");
      setAngle({ video, angle: data.angle as Angle, saved: Boolean(data.item) });
      setMessage(data.item ? "Added to Create as an idea." : null);
      if (data.item) onModelled?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not model that video");
    } finally { setModellingId(null); }
  }

  const lastSync = useMemo(() => {
    const stamps = channels.map((c) => c.last_synced_at).filter((s): s is string => !!s).sort();
    return stamps.length ? new Date(stamps[stamps.length - 1]) : null;
  }, [channels]);

  const shown = view === "outliers" ? outliers : (channels.find((c) => c.id === view)?.videos ?? []);
  const sorted = view === "outliers" ? shown : [...shown].sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-400">Research</p>
          <h2 className="mt-1 text-xl font-black text-white">Who to model, and what to take</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
            Every video is scored against its own channel, not against yours. A 3× is the idea working, separate from the
            audience it landed in front of. Model the reason it worked, not the topic.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastSync && <span className="text-[11px] text-zinc-600">Last refresh {lastSync.toLocaleDateString()}</span>}
          <button type="button" onClick={() => void sync()} disabled={syncing}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-red-500 disabled:opacity-50">
            {syncing ? "Refreshing…" : "↻ Refresh channels"}
          </button>
        </div>
      </div>

      {message && <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{message}</p>}

      {/* Channel cards — their normal, so a multiple means something */}
      <div className="grid gap-3 lg:grid-cols-3">
        {channels.map((channel) => (
          <article key={channel.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <a href={channel.channel_url} target="_blank" rel="noreferrer" className="text-sm font-black text-white hover:text-red-300">
                  {channel.name} ↗
                </a>
                <p className="text-[11px] text-zinc-600">@{channel.handle}</p>
              </div>
              <p className="flex-shrink-0 text-right">
                <span className="block text-lg font-black text-white">{compact(channel.subscribers)}</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">subs</span>
              </p>
            </div>
            {channel.why_watch && <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{channel.why_watch}</p>}
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-800 pt-3">
              <Stat label="Their normal" value={compact(channel.summary.medianLongViews || null)} hint="median long-form" />
              <Stat label="Cadence" value={channel.summary.uploadsPerMonth === null ? "—" : `${channel.summary.uploadsPerMonth}/mo`} hint="from tracked uploads" />
              <Stat label="Last post" value={channel.summary.lastPublishedDays === null ? "—" : `${channel.summary.lastPublishedDays}d`} hint="ago" />
            </dl>
            {channel.last_sync_error && (
              <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                Last refresh failed: {channel.last_sync_error}
              </p>
            )}
          </article>
        ))}
      </div>

      {/* What to look at */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-1">
        <button type="button" onClick={() => setView("outliers")}
          className={`rounded-xl px-4 py-2 text-xs font-black transition-colors ${view === "outliers" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white"}`}>
          🔥 Best bets ({outliers.length})
        </button>
        {channels.map((channel) => (
          <button key={channel.id} type="button" onClick={() => setView(channel.id)}
            className={`rounded-xl px-4 py-2 text-xs font-black transition-colors ${view === channel.id ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white"}`}>
            {channel.name} ({channel.summary.tracked})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-10 text-center text-sm text-zinc-400">Loading research…</p>
      ) : error ? (
        <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center text-sm text-rose-200">{error}</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
          <p className="text-sm font-bold text-zinc-300">No videos tracked yet</p>
          <p className="mt-1 text-xs text-zinc-600">Hit “Refresh channels” to pull their recent uploads. It takes a couple of minutes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((video) => (
            <VideoRow key={`${video.competitorId}-${video.video_id}`} video={video}
              busy={modellingId === video.video_id} onModel={model} />
          ))}
        </div>
      )}

      {angle && <AngleSheet state={angle} onClose={() => setAngle(null)} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="text-[9px] font-black uppercase tracking-wide text-zinc-600">{label}</dt>
      <dd className="text-sm font-black text-white">{value}</dd>
      <p className="text-[9px] text-zinc-700">{hint}</p>
    </div>
  );
}

function VideoRow({ video, busy, onModel }: {
  video: ScoredVideo;
  busy: boolean;
  onModel: (video: ScoredVideo, createIdea: boolean, format: YouTubeFormat) => void;
}) {
  const multiple = video.multiple;
  const hot = multiple !== null && multiple >= 2;
  return (
    <article className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 transition-colors hover:border-zinc-700">
      {video.thumbnail_url && (
        <img src={video.thumbnail_url} alt="" loading="lazy" className="h-16 w-28 flex-shrink-0 rounded-xl object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <a href={video.url ?? "#"} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-bold text-white hover:text-red-300">
          {video.title}
        </a>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
          <span className="text-zinc-400">{video.competitorName}</span>
          <span className="text-zinc-700">·</span>
          <span>{video.view_count === null ? "views unknown" : `${nf.format(video.view_count)} views`}</span>
          {video.ageDays !== null && <><span className="text-zinc-700">·</span><span>{ageLabel(video.ageDays)}</span></>}
          {video.viewsPerDay !== null && <><span className="text-zinc-700">·</span><span>{compact(Math.round(video.viewsPerDay))}/day</span></>}
          {video.is_short && <><span className="text-zinc-700">·</span><span>⚡ Short</span></>}
        </p>
      </div>
      {multiple !== null && (
        <span title="Views as a multiple of this channel's own median"
          className={`flex-shrink-0 rounded-lg border px-2 py-1 text-[11px] font-black ${
            hot ? "border-red-500/40 bg-red-500/15 text-red-300" : "border-zinc-700 bg-zinc-800/60 text-zinc-400"
          }`}>
          {multiple.toFixed(1)}× their normal
        </span>
      )}
      <div className="flex flex-shrink-0 gap-1.5">
        <button type="button" onClick={() => onModel(video, false, video.is_short ? "short" : "long_form")} disabled={busy}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[11px] font-bold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50">
          {busy ? "…" : "Why it worked"}
        </button>
        <button type="button" onClick={() => onModel(video, true, video.is_short ? "short" : "long_form")} disabled={busy}
          className="rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-3 py-1.5 text-[11px] font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          Model this →
        </button>
      </div>
    </article>
  );
}

function AngleSheet({ state, onClose }: { state: { video: ScoredVideo; angle: Angle; saved: boolean }; onClose: () => void }) {
  const { video, angle, saved } = state;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-zinc-700 bg-zinc-900 sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-400">
              {saved ? "Added to Create" : "Angle only, not saved"}
            </p>
            <h3 className="mt-0.5 text-lg font-black text-white">{angle.title}</h3>
            <a href={video.url ?? "#"} target="_blank" rel="noreferrer" className="text-[11px] text-zinc-500 hover:text-red-300">
              modelled on {video.competitorName}: {video.title} ↗
            </a>
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 text-2xl leading-none text-zinc-500 hover:text-white">&times;</button>
        </header>
        <div className="space-y-3 p-5">
          <Block title="Why theirs worked" body={angle.whyItWorked} tone="zinc" />
          <Block title="Our angle on it" body={angle.ourAngle} tone="red" />
          <Block title="What only you can say" body={angle.differentiator} tone="emerald" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Block title="Who it's for" body={angle.viewer} tone="zinc" />
            <Block title="What they get" body={angle.promise} tone="zinc" />
          </div>
          <Block title="Opening hook, spoken" body={angle.openingHook} tone="zinc" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Block title="Thumbnail text" body={angle.thumbnailText} tone="zinc" />
            <Block title="Primary keyword" body={angle.primaryKeyword} tone="zinc" />
          </div>
          {angle.alternateTitles.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Other titles</p>
              <ul className="mt-2 space-y-1">
                {angle.alternateTitles.map((title) => <li key={title} className="text-xs text-zinc-300">{title}</li>)}
              </ul>
            </div>
          )}
          {saved && (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              This is now an idea in Create, with the source video attached. Write the script from there.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ title, body, tone }: { title: string; body: string; tone: "zinc" | "red" | "emerald" }) {
  const border = tone === "red" ? "border-red-500/25 bg-red-500/[0.05]" : tone === "emerald" ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-zinc-800 bg-zinc-950/60";
  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-200">{body}</p>
    </div>
  );
}
