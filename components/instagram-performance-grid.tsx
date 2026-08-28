"use client";

import { useMemo } from "react";
import {
  buildInstagramPerformanceBoard,
  type InstagramPostedContent,
} from "@/lib/instagram-performance";

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);

function performanceTone(label: string) {
  if (label === "Top performer") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (label === "Top 25%") return "border-pink-500/40 bg-pink-500/10 text-pink-300";
  if (label === "Above average") return "border-sky-500/40 bg-sky-500/10 text-sky-300";
  return "border-zinc-700 bg-zinc-800 text-zinc-400";
}

export function InstagramPerformanceGrid({ posts }: { posts: InstagramPostedContent[] }) {
  const rows = useMemo(() => buildInstagramPerformanceBoard(posts), [posts]);

  return (
    <section className="space-y-4 pt-2" aria-labelledby="instagram-performance-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pink-400">Rolling performance</p>
          <h2 id="instagram-performance-title" className="mt-1 text-lg font-black text-white">
            Past 90 Days of Instagram Content
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Exact public views, likes, and comments. Performance is ranked against posts using the same metric.
          </p>
        </div>
        <span className="w-fit rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] font-bold text-zinc-400">
          {rows.length} posts
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="text-sm font-bold text-white">No Instagram posts are synced yet.</p>
          <p className="mt-1 text-xs text-zinc-500">Use Sync Instagram above to load the latest 90 days.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.id} className="flex min-h-[360px] flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-lg shadow-black/10 transition-colors hover:border-pink-500/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span>{row.mediaType === "video" ? "🎬" : row.mediaType === "carousel" ? "🎠" : "🖼️"}</span>
                  <time dateTime={row.postedAt}>
                    {new Date(row.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </time>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${performanceTone(row.performanceLabel)}`}>
                  {row.performanceLabel}
                </span>
              </div>

              <div className="mt-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Name / description</p>
                <h3 className="mt-1 line-clamp-2 text-sm font-black leading-snug text-white">{row.name}</h3>
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-[11px] leading-relaxed text-zinc-500">{row.description}</p>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-pink-400">Hook</p>
                <p className="mt-1 line-clamp-3 text-xs font-semibold leading-relaxed text-zinc-200">“{row.hook}”</p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-zinc-950 p-2.5">
                  <p className="text-sm font-black text-white">{formatNumber(row.views)}</p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase text-zinc-600">Views</p>
                </div>
                <div className="rounded-xl bg-zinc-950 p-2.5">
                  <p className="text-sm font-black text-pink-300">{formatNumber(row.likes)}</p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase text-zinc-600">Likes</p>
                </div>
                <div className="rounded-xl bg-zinc-950 p-2.5">
                  <p className="text-sm font-black text-purple-300">{formatNumber(row.comments)}</p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase text-zinc-600">Comments</p>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <p className="text-[10px] text-zinc-500">
                  #{row.performanceRank} of {row.performanceGroupSize} by {row.performanceBasis}
                  {row.engagementRate !== null ? ` • ${row.engagementRate}% engagement` : ""}
                </p>
                {row.postUrl ? (
                  <a href={row.postUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 px-3 py-2 text-[10px] font-black text-white transition-all hover:brightness-110">
                    Open post ↗
                  </a>
                ) : (
                  <span className="text-[10px] text-zinc-700">Link unavailable</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
