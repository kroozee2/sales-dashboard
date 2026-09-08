"use client";

import { PostedTab, type Posted } from "@/components/posted-table";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import GraphicsStudio from "@/components/graphics-studio";
import YouTubeContentPlanner from "@/components/youtube-content-planner";
import YouTubePerformanceTable from "@/components/youtube-performance-table";
import { aggregateYouTubeDashboard, sortYouTubeVideos, type YouTubeVideo } from "@/lib/youtube";

type Tab = "dashboard" | "long-form" | "shorts" | "create";
type AnalyticsResponse = {
  account: { id: string; name: string; handle: string; url: string };
  dateRange: { start: string; end: string; label: string };
  provenance: { source: string; scope: string; lastSyncedAt: string | null; complete: boolean; note: string };
  capabilities: { publicMetrics: boolean; privateAnalytics: boolean; unavailable: string[] };
  ownerAnalytics: null | {
    startDate: string; endDate: string; fetchedAt: string;
    metrics: { views: number; estimatedMinutesWatched: number; averageViewDuration: number; averageViewPercentage: number; subscribersGained: number; subscribersLost: number; subscribersNet: number };
    trafficSources: Array<{ type: string; views: number }>;
  };
  videos: YouTubeVideo[];
};
type PlannerItem = Parameters<typeof YouTubeContentPlanner>[0]["items"][number];

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "long-form", label: "Long-form", icon: "🎥" },
  { key: "shorts", label: "Shorts", icon: "⚡" },
  { key: "create", label: "Create", icon: "✍️" },
];

export default function YouTubePage() {
  const [posted, setPosted] = useState<Posted[]>([]);
  const loadPosted = useCallback(async () => {
    const res = await fetch("/api/content/posted");
    const json = (await res.json()) as { posted?: Posted[] };
    setPosted(json.posted ?? []);
  }, []);
  useEffect(() => { void loadPosted(); }, [loadPosted]);

  const [tab, setTab] = useState<Tab>("dashboard");
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function loadAnalytics() {
    setAnalyticsLoading(true); setAnalyticsError(null);
    try {
      const response = await fetch("/api/youtube/analytics", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "YouTube analytics request failed");
      setAnalytics(data as AnalyticsResponse);
    } catch (error) { setAnalyticsError(error instanceof Error ? error.message : "YouTube analytics request failed"); }
    finally { setAnalyticsLoading(false); }
  }

  async function loadContent() {
    setContentLoading(true); setContentError(null);
    try {
      const response = await fetch("/api/youtube/content", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "YouTube production request failed");
      setItems(data.items ?? []);
    } catch (error) { setContentError(error instanceof Error ? error.message : "YouTube production request failed"); }
    finally { setContentLoading(false); }
  }

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([loadAnalytics(), loadContent()]));
  }, []);

  async function syncYouTube() {
    if (syncing) return;
    setSyncing(true); setSyncMessage("Starting verified YouTube public-data sync…");
    try {
      let started: { started?: boolean; pendingStart?: boolean; error?: string } | null = null;
      while (!started?.started) {
        const startResponse = await fetch("/api/content/posted/sync-start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform: "youtube" }) });
        started = await startResponse.json() as { started?: boolean; pendingStart?: boolean; error?: string };
        if (!startResponse.ok && !started.pendingStart) throw new Error(started.error ?? "YouTube sync could not start");
        if (!started.started) await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const pollResponse = await fetch("/api/content/posted/sync-poll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform: "youtube" }) });
        const polled = await pollResponse.json() as { done?: boolean; synced?: number; error?: string };
        if (!pollResponse.ok) throw new Error(polled.error ?? "YouTube sync failed");
        if (polled.done) { setSyncMessage(`YouTube sync complete. ${polled.synced ?? 0} verified rows refreshed.`); await loadAnalytics(); break; }
        setSyncMessage("Syncing long-form videos and Shorts…");
      }
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : "YouTube sync failed"); }
    finally { setSyncing(false); }
  }

  const videos = analytics?.videos ?? [];
  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header className="overflow-hidden rounded-3xl border border-red-500/20 bg-gradient-to-br from-red-950/50 via-zinc-950 to-zinc-900 p-5 sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-2xl shadow-lg shadow-red-950">▶</div><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-400">Marketing command center</p><h1 className="text-2xl font-black tracking-tight sm:text-3xl">YouTube Studio</h1></div></div><p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">See what is working, turn the next idea into a record-ready package, and create the thumbnail without leaving SalesOS.</p><a href="https://www.youtube.com/@andrewkroeze999" target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-red-300 hover:text-red-200">Andrew Kroeze · @andrewkroeze999 ↗</a></div>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center"><div className="rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-[10px] text-zinc-500"><span className="font-bold text-zinc-300">Public source:</span> {analytics?.provenance.source ?? "Loading"}<br /><span className="font-bold text-zinc-300">Public sync:</span> {analytics?.provenance.lastSyncedAt ? new Date(analytics.provenance.lastSyncedAt).toLocaleString() : "Unavailable"}{analytics?.ownerAnalytics && <><br /><span className="font-bold text-emerald-300">Authenticated source:</span> YouTube Analytics API<br /><span className="font-bold text-emerald-300">Owner sync:</span> {new Date(analytics.ownerAnalytics.fetchedAt).toLocaleString()}</>}</div><button type="button" onClick={() => void syncYouTube()} disabled={syncing} className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white hover:bg-red-500 disabled:opacity-50">{syncing ? "Syncing…" : "↻ Sync YouTube"}</button></div>
          </div>
          {syncMessage && <p role="status" className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{syncMessage}</p>}
        </header>

        <nav aria-label="YouTube workspace" className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/70 p-1.5">
          {TABS.map((entry) => <button key={entry.key} type="button" onClick={() => setTab(entry.key)} aria-current={tab === entry.key ? "page" : undefined} className={`min-w-max flex-1 rounded-xl px-4 py-2.5 text-xs font-black transition-colors ${tab === entry.key ? "bg-red-600 text-white shadow-lg" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"}`}>{entry.icon} {entry.label}</button>)}
        </nav>

        {tab === "dashboard" && (
          <div className="space-y-8">
            <Dashboard analytics={analytics} videos={videos} loading={analyticsLoading} error={analyticsError} />
            {/* What actually went out, moved here from the Content page's
                YouTube tab so the channel's numbers and its posts sit together. */}
            <section className="border-t border-zinc-800 pt-8">
              <PostedTab posted={posted} onChanged={loadPosted} lockPlatform="youtube" />
            </section>
          </div>
        )}
        {tab === "long-form" && <YouTubePerformanceTable videos={videos} format="long_form" loading={analyticsLoading} error={analyticsError} />}
        {tab === "shorts" && <YouTubePerformanceTable videos={videos} format="short" loading={analyticsLoading} error={analyticsError} />}
        {tab === "create" && <div className="space-y-10"><YouTubeContentPlanner items={items} loading={contentLoading} error={contentError} onCreated={(item) => setItems((current) => [item, ...current])} onUpdated={(item) => setItems((current) => current.map((candidate) => candidate.id === item.id ? item : candidate))} /><section className="border-t border-zinc-800 pt-8"><div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-400">1280 × 720</p><h2 className="mt-1 text-xl font-black text-white">YouTube Thumbnail Studio</h2><p className="mt-1 text-xs text-zinc-500">Generate phone-readable thumbnails with your face, a style reference, and automatic Graphics Library saving.</p></div><GraphicsStudio /></section></div>}
      </div>
    </main>
  );
}

function Dashboard({ analytics, videos, loading, error }: { analytics: AnalyticsResponse | null; videos: YouTubeVideo[]; loading: boolean; error: string | null }) {
  const summary = useMemo(() => aggregateYouTubeDashboard(videos), [videos]);
  const long = videos.filter((video) => video.format === "long_form");
  const shorts = videos.filter((video) => video.format === "short");
  const topLong = sortYouTubeVideos(long, "best")[0];
  const topShort = sortYouTubeVideos(shorts, "best")[0];
  const ownerAverageDurationSeconds = Math.round(analytics?.ownerAnalytics?.metrics.averageViewDuration ?? 0);
  if (loading) return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-10 text-center text-sm text-zinc-400">Loading YouTube dashboard…</div>;
  if (error) return <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-10 text-center"><p className="font-bold text-rose-200">YouTube dashboard unavailable</p><p className="mt-1 text-xs text-rose-300/70">{error}</p></div>;
  if (!analytics) return null;
  return <div className="space-y-6">
    {analytics.capabilities.publicMetrics ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Uploads" value={String(summary.uploads)} detail={`${long.length} long-form · ${shorts.length} Shorts`} /><Kpi label="Public views" value={summary.views === null ? "Unavailable" : new Intl.NumberFormat("en-US").format(summary.views)} detail="Lifetime counters on uploads from this period" /><Kpi label="Likes" value={summary.likes === null ? "Unavailable" : new Intl.NumberFormat("en-US").format(summary.likes)} detail="Verified public snapshot" /><Kpi label="Comments" value={summary.comments === null ? "Unavailable" : new Intl.NumberFormat("en-US").format(summary.comments)} detail="Verified public snapshot" /></div> : <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-6 text-center"><p className="font-bold text-amber-100">Public YouTube snapshot unavailable</p><p className="mt-1 text-xs text-amber-100/60">Authenticated owner metrics below remain independent and date-bounded.</p></div>}
    {analytics.ownerAnalytics ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Watch time" value={`${(analytics.ownerAnalytics.metrics.estimatedMinutesWatched / 60).toFixed(1)}h`} detail={`${analytics.ownerAnalytics.startDate} to ${analytics.ownerAnalytics.endDate} · authenticated`} /><Kpi label="Average % viewed" value={`${analytics.ownerAnalytics.metrics.averageViewPercentage.toFixed(1)}%`} detail={`Average view duration ${Math.floor(ownerAverageDurationSeconds / 60)}:${String(ownerAverageDurationSeconds % 60).padStart(2, "0")}`} /><Kpi label="Subscribers gained" value={`+${new Intl.NumberFormat("en-US").format(analytics.ownerAnalytics.metrics.subscribersGained)}`} detail={`${analytics.ownerAnalytics.metrics.subscribersLost} lost · net ${analytics.ownerAnalytics.metrics.subscribersNet >= 0 ? "+" : ""}${analytics.ownerAnalytics.metrics.subscribersNet}`} /><Kpi label="Impressions CTR" value="Unavailable" privateMetric detail="Not imported by this integration" /></div>
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5"><div className="flex gap-3"><span className="text-xl">✓</span><div><h2 className="text-sm font-black text-emerald-100">Authenticated YouTube Analytics connected</h2><p className="mt-1 text-xs leading-relaxed text-emerald-100/60">Watch time, average viewing, subscriber changes, and traffic sources are read-only and date-bounded. Thumbnail impressions and CTR are not imported by this integration, so they remain unavailable rather than estimated.</p></div></div></section>
      {analytics.ownerAnalytics.trafficSources.length > 0 && <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Traffic sources</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{analytics.ownerAnalytics.trafficSources.slice(0, 6).map((source) => <div key={source.type} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-xs"><span className="text-zinc-400">{source.type.replaceAll("_", " ")}</span><span className="font-black text-white">{new Intl.NumberFormat("en-US").format(source.views)}</span></div>)}</div></section>}
    </> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Watch time" value="Studio required" privateMetric /><Kpi label="Average % viewed" value="Studio required" privateMetric /><Kpi label="Subscribers gained" value="Studio required" privateMetric /><Kpi label="Impressions CTR" value="Studio required" privateMetric /></div>
      <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5"><div className="flex gap-3"><span className="text-xl">🔒</span><div><h2 className="text-sm font-black text-amber-100">Connect authenticated YouTube Analytics for full Studio KPIs</h2><p className="mt-1 text-xs leading-relaxed text-amber-100/60">Public snapshots cannot provide watch time, retention, subscribers gained, impressions, click-through rate, or traffic sources. These remain unavailable rather than estimated. The read-only Analytics connection is the next integration step.</p></div></div></section>
    </>}
    <div className="grid gap-4 lg:grid-cols-2"><TopCard title="Top long-form" video={topLong} /><TopCard title="Top Short" video={topShort} /></div>
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Data trust</p><p className="mt-2 text-sm font-bold text-white">{analytics?.dateRange.label ?? "Past 365 days"}</p><p className="mt-1 text-xs leading-relaxed text-zinc-500">{analytics?.provenance.scope}. {analytics?.provenance.note}</p></div>
  </div>;
}

function Kpi({ label, value, detail, privateMetric = false }: { label: string; value: string; detail?: string; privateMetric?: boolean }) { return <div className={`rounded-2xl border p-4 ${privateMetric ? "border-zinc-800 bg-zinc-900/30" : "border-zinc-800 bg-zinc-900/70"}`}><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</p><p className={`mt-2 text-2xl font-black ${privateMetric ? "text-zinc-600" : "text-white"}`}>{value}</p><p className="mt-1 text-[10px] text-zinc-600">{detail ?? "Authenticated Studio metric unavailable"}</p></div>; }
function TopCard({ title, video }: { title: string; video?: YouTubeVideo }) { return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-red-400">{title}</p>{video ? <div className="mt-3 flex gap-3">{video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" className="h-20 w-32 rounded-xl object-cover" />}<div><p className="line-clamp-2 text-sm font-bold text-white">{video.title}</p><p className="mt-2 text-xs text-zinc-500">{video.views === null ? "Views unavailable" : `${new Intl.NumberFormat("en-US").format(video.views)} public views`}</p>{video.url && <a href={video.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-bold text-red-300">Watch ↗</a>}</div></div> : <p className="mt-3 text-sm text-zinc-600">No synced video available.</p>}</div>; }
