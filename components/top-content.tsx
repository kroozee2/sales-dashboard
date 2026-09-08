"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Posted } from "@/components/posted-table";

// Marketing → Posted Content. What actually performed, and how the whole body
// of work is doing underneath it.

const PLATFORM = {
  instagram: { label: "Instagram", emoji: "📸", bar: "bg-pink-500", text: "text-pink-300" },
  youtube: { label: "YouTube", emoji: "▶️", bar: "bg-red-500", text: "text-red-300" },
  facebook: { label: "Facebook", emoji: "👍", bar: "bg-blue-500", text: "text-blue-300" },
} as const;
const meta = (p: string) => PLATFORM[p as keyof typeof PLATFORM] ?? { label: p, emoji: "•", bar: "bg-zinc-500", text: "text-zinc-300" };

const RANGES = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "quarter", label: "Quarter", days: 90 },
  { key: "year", label: "Year", days: 365 },
  { key: "all", label: "All time", days: 100000 },
] as const;

const n = (v: number | null | undefined) => new Intl.NumberFormat("en-US").format(v ?? 0);
const engagement = (p: Posted) => (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.reactions ?? 0);

export function TopContent({ posted }: { posted: Posted[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("quarter");
  const [platform, setPlatform] = useState<string | null>(null);
  const [sort, setSort] = useState<"views" | "engagement">("views");

  const days = RANGES.find((r) => r.key === range)!.days;
  const since = Date.now() - days * 86_400_000;

  const rows = useMemo(() => posted
    // Only real posts. The table also carries a `youtube_owner_analytics` row —
    // a channel-level aggregate, not a post — which would otherwise sit at the
    // top of "best performer" with 95k views and eat half the reach chart.
    .filter((p) => p.platform in PLATFORM)
    .filter((p) => !platform || p.platform === platform)
    .filter((p) => !p.posted_at || new Date(p.posted_at).getTime() >= since), [posted, platform, since]);

  const totals = useMemo(() => rows.reduce((a, p) => ({
    posts: a.posts + 1,
    views: a.views + (p.views ?? 0),
    engagement: a.engagement + engagement(p),
  }), { posts: 0, views: 0, engagement: 0 }), [rows]);

  const avgViews = totals.posts ? Math.round(totals.views / totals.posts) : 0;

  const top = useMemo(() => [...rows]
    .sort((a, b) => (sort === "views" ? (b.views ?? 0) - (a.views ?? 0) : engagement(b) - engagement(a)))
    .slice(0, 10), [rows, sort]);

  const best = top[0];
  const peak = Math.max(1, ...top.map((p) => (sort === "views" ? p.views ?? 0 : engagement(p))));

  // Views by platform, so "who is carrying the reach" is answerable at a glance.
  const byPlatform = useMemo(() => {
    const m = new Map<string, { views: number; posts: number }>();
    for (const p of rows) {
      const cur = m.get(p.platform) ?? { views: 0, posts: 0 };
      m.set(p.platform, { views: cur.views + (p.views ?? 0), posts: cur.posts + 1 });
    }
    return [...m.entries()].sort((a, b) => b[1].views - a[1].views);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-zinc-900 p-1">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                range === r.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white")}>{r.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setPlatform(null)}
            className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", !platform ? "border-blue-500 bg-blue-500/20 text-blue-100" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white")}>
            All
          </button>
          {Object.entries(PLATFORM).map(([k, v]) => (
            <button key={k} onClick={() => setPlatform(platform === k ? null : k)}
              className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", platform === k ? "border-blue-500 bg-blue-500/20 text-blue-100" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white")}>
              {v.emoji} {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Posts", value: n(totals.posts), tone: "text-white" },
          { label: "Total views", value: n(totals.views), tone: "text-sky-300" },
          { label: "Avg views / post", value: n(avgViews), tone: "text-violet-300" },
          { label: "Engagements", value: n(totals.engagement), tone: "text-emerald-300" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-black tabular-nums", k.tone)}>{k.value}</p>
          </div>
        ))}
      </div>

      {best && (
        <a href={best.post_url ?? undefined} target="_blank" rel="noopener noreferrer"
          className="block rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 to-zinc-900 p-5 transition-colors hover:border-amber-500/50">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">🏆 Best performer · this {range === "all" ? "all time" : range}</p>
          <p className="mt-2 line-clamp-2 text-sm font-semibold text-white">{best.text || "Untitled post"}</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-4">
            <span className="text-2xl font-black tabular-nums text-amber-200">{n(best.views)}<span className="ml-1 text-xs font-medium text-amber-300/60">views</span></span>
            <span className="text-sm text-zinc-400">{n(engagement(best))} engagements</span>
            <span className="text-xs text-zinc-500">{meta(best.platform).emoji} {meta(best.platform).label}</span>
            {best.posted_at && <span className="text-xs text-zinc-600">{new Date(best.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
            {avgViews > 0 && best.views != null && (
              <span className="text-xs font-bold text-emerald-400">{(best.views / avgViews).toFixed(1)}× your average</span>
            )}
          </div>
        </a>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-sm font-black text-white">Where the reach comes from</p>
        <p className="mb-3 text-[11px] text-zinc-500">Views by platform over this {range === "all" ? "period" : range}.</p>
        {byPlatform.length === 0 ? <p className="py-4 text-center text-xs text-zinc-600">Nothing posted in this window.</p> : (
          <div className="space-y-2.5">
            {byPlatform.map(([k, v]) => {
              const pct = totals.views ? Math.round((v.views / totals.views) * 100) : 0;
              return (
                <div key={k}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-zinc-300">{meta(k).emoji} {meta(k).label}</span>
                    <span className="tabular-nums text-zinc-500"><span className="font-bold text-zinc-300">{n(v.views)}</span> · {v.posts} posts · {pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className={cn("h-full rounded-full", meta(k).bar)} style={{ width: `${Math.max(pct, 1.5)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <p className="text-sm font-black text-white">Top 10 posts</p>
          <div className="flex gap-1 rounded-lg bg-zinc-950 p-0.5">
            {(["views", "engagement"] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)}
                className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold capitalize", sort === s ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white")}>{s}</button>
            ))}
          </div>
        </div>
        {top.length === 0 ? <p className="py-10 text-center text-sm text-zinc-600">Nothing posted in this window.</p> : (
          <div className="divide-y divide-zinc-800/70">
            {top.map((p, i) => {
              const val = sort === "views" ? p.views ?? 0 : engagement(p);
              return (
                <a key={p.id} href={p.post_url ?? undefined} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-800/40">
                  <span className="w-5 shrink-0 text-xs font-black tabular-nums text-zinc-600">{i + 1}</span>
                  <span className="shrink-0 text-sm">{meta(p.platform).emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-200">{p.text || "Untitled post"}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
                      <div className={cn("h-full rounded-full", meta(p.platform).bar)} style={{ width: `${Math.max((val / peak) * 100, 2)}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-white">{n(val)}</span>
                    <span className="block text-[10px] text-zinc-600">{p.posted_at ? new Date(p.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
