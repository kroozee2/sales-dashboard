"use client";

import { useMemo, useState } from "react";
import {
  buildInstagramPerformanceBoard,
  type InstagramPostedContent,
} from "@/lib/instagram-performance";

const formatNumber = (value: number | null) => value === null ? "Unavailable" : new Intl.NumberFormat("en-US").format(value);

function performanceTone(label: string) {
  if (label.startsWith("#1 ")) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (label.startsWith("#2 ") || label.startsWith("#3 ")) return "border-pink-500/40 bg-pink-500/10 text-pink-300";
  return "border-zinc-700 bg-zinc-800 text-zinc-400";
}

export function InstagramPerformanceSpreadsheet({ posts, loading = false, error = null }: {
  posts: InstagramPostedContent[];
  loading?: boolean;
  error?: string | null;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => buildInstagramPerformanceBoard(posts), [posts]);
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(normalized));
  }, [query, rows]);

  return (
    <section className="space-y-4 pt-2" aria-labelledby="instagram-performance-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pink-400">Rolling performance</p>
          <h2 id="instagram-performance-title" className="mt-1 text-lg font-black text-white">
            Instagram Performance Spreadsheet
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Past 90 days. Each Reel name comes from its hook or headline, with public metrics shown exactly when available.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search hooks or headlines…"
            className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-pink-500 focus:outline-none sm:w-64"
          />
          <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-bold text-zinc-400">
            {filteredRows.length} posts
          </span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="text-sm font-bold text-white">Loading Instagram performance…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <p className="text-sm font-bold text-rose-200">Instagram performance is unavailable.</p>
          <p className="mt-1 text-xs text-rose-300/70">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="text-sm font-bold text-white">No Instagram posts are synced yet.</p>
          <p className="mt-1 text-xs text-zinc-500">Use Sync Instagram above to load the latest 90 days.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <div className="overflow-x-auto">
            <table className="min-w-[1040px] w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                <tr className="border-b border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  <th className="w-28 px-4 py-3">Date</th>
                  <th className="min-w-[320px] px-4 py-3">Reel name</th>
                  <th className="w-24 px-4 py-3">Format</th>
                  <th className="w-36 px-4 py-3">Performance</th>
                  <th className="w-24 px-4 py-3 text-right">Views</th>
                  <th className="w-24 px-4 py-3 text-right">Likes</th>
                  <th className="w-24 px-4 py-3 text-right">Comments</th>
                  <th className="w-28 px-4 py-3 text-right">Engagement</th>
                  <th className="w-24 px-4 py-3 text-right">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="group hover:bg-pink-500/[0.04]">
                    <td className="whitespace-nowrap px-4 py-3 text-[11px] text-zinc-500">
                      {new Date(row.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold leading-relaxed text-white">{row.name}</p>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-semibold capitalize text-zinc-400">
                      {row.mediaType === "video" ? "🎬 Reel" : row.mediaType === "carousel" ? "🎠 Carousel" : "🖼️ Post"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${performanceTone(row.performanceLabel)}`}>
                        {row.performanceLabel}
                      </span>
                      {row.performanceRank !== null && <p className="mt-1 text-[9px] text-zinc-600">Ranked by {row.performanceBasis}</p>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-black text-white">{formatNumber(row.views)}</td>
                    <td className="px-4 py-3 text-right text-xs font-black text-pink-300">{formatNumber(row.likes)}</td>
                    <td className="px-4 py-3 text-right text-xs font-black text-purple-300">{formatNumber(row.comments)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-300">
                      {row.engagementRate === null ? "Unavailable" : `${row.engagementRate}%`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.postUrl ? (
                        <a href={row.postUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 px-3 py-2 text-[10px] font-black text-white transition-all hover:brightness-110">
                          Open ↗
                        </a>
                      ) : (
                        <span className="text-[10px] text-zinc-700">Unavailable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length === 0 && (
            <div className="border-t border-zinc-800 p-8 text-center text-xs text-zinc-500">No hooks or headlines match that search.</div>
          )}
        </div>
      )}
    </section>
  );
}
