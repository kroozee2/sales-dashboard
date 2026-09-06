"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { sortYouTubeVideos, type YouTubeFormat, type YouTubeSort, type YouTubeVideo } from "@/lib/youtube";

const number = (value: number | null) => value === null ? "Unavailable" : new Intl.NumberFormat("en-US").format(value);
const percent = (value: number | null) => value === null ? "Unavailable" : `${value.toFixed(1)}%`;
const duration = (seconds: number | null) => {
  if (seconds === null) return "Unavailable";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
};

export default function YouTubePerformanceTable({ videos, format, loading, error }: {
  videos: YouTubeVideo[];
  format: YouTubeFormat;
  loading?: boolean;
  error?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<YouTubeSort>("recent");
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return sortYouTubeVideos(videos.filter((video) => video.format === format && (!search || video.title.toLowerCase().includes(search))), sort);
  }, [videos, format, query, sort]);
  const label = format === "short" ? "Shorts" : "Long-form";

  return (
    <section className="space-y-4" aria-labelledby={`youtube-${format}-title`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-400">Past 365 days</p>
          <h2 id={`youtube-${format}-title`} className="mt-1 text-xl font-black text-white">{label} performance</h2>
          <p className="mt-1 max-w-2xl text-xs text-zinc-500">Public lifetime counters for videos published in this window. Studio-only KPIs remain unavailable until authenticated Analytics is connected.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label={`Search ${label}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search video titles…" className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none sm:w-64" />
          <select aria-label={`Sort ${label}`} value={sort} onChange={(event) => setSort(event.target.value as YouTubeSort)} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 focus:border-red-500 focus:outline-none">
            <option value="recent">Most recent</option>
            <option value="best">Best performing</option>
          </select>
        </div>
      </div>

      {loading ? <StateCard title={`Loading ${label.toLowerCase()} performance…`} /> : error ? <StateCard title="YouTube performance is unavailable" detail={error} error /> : videos.filter((video) => video.format === format).length === 0 ? <StateCard title={`No ${label.toLowerCase()} videos are synced for this period.`} detail="Use Sync YouTube to refresh the verified public snapshot." /> : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                <tr className="border-b border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  <th className="w-28 px-3 py-3">Published</th><th className="min-w-[340px] px-3 py-3">Video</th><th className="w-24 px-3 py-3">Duration</th><th className="w-24 px-3 py-3 text-right">Views</th><th className="w-24 px-3 py-3 text-right">Views/day</th><th className="w-20 px-3 py-3 text-right">Likes</th><th className="w-24 px-3 py-3 text-right">Comments</th><th className="w-28 px-3 py-3 text-right">Engagement</th><th className="w-28 px-3 py-3 text-right">Watch time</th><th className="w-24 px-3 py-3 text-right">Avg viewed</th><th className="w-24 px-3 py-3 text-right">Subs gained</th><th className="w-20 px-3 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {rows.map((video) => {
                  const age = Math.max(1, Math.floor((now - Date.parse(video.publishedAt)) / 86_400_000));
                  const interactions = video.likes === null && video.comments === null ? null : (video.likes ?? 0) + (video.comments ?? 0);
                  const engagement = video.views && interactions !== null ? interactions / video.views * 100 : null;
                  return (
                    <tr key={video.id} className="hover:bg-red-500/[0.04]">
                      <td className="whitespace-nowrap px-3 py-3 text-[11px] text-zinc-500">{new Date(video.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td className="px-3 py-3"><div className="flex items-center gap-3">{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="h-12 w-20 rounded-lg bg-black object-cover" /> : <div className="h-12 w-20 rounded-lg bg-zinc-800" />}<div><p className="line-clamp-2 text-xs font-bold text-white">{video.title}</p><p className="mt-1 text-[10px] text-zinc-600">{age} day{age === 1 ? "" : "s"} old</p></div></div></td>
                      <td className="px-3 py-3 text-xs text-zinc-400">{duration(video.durationSeconds)}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-white">{number(video.periodViews ?? video.views)}</td>
                      <td className="px-3 py-3 text-right text-xs text-red-300">{video.views === null ? "Unavailable" : (video.views / age).toFixed(1)}</td>
                      <td className="px-3 py-3 text-right text-xs text-zinc-300">{number(video.likes)}</td>
                      <td className="px-3 py-3 text-right text-xs text-zinc-300">{number(video.comments)}</td>
                      <td className="px-3 py-3 text-right text-xs text-zinc-300">{percent(engagement)}</td>
                      <td className="px-3 py-3 text-right text-[10px] text-zinc-600">{video.watchMinutes === null ? "Studio required" : `${(video.watchMinutes / 60).toFixed(1)}h`}</td>
                      <td className="px-3 py-3 text-right text-[10px] text-zinc-600">{video.averageViewPercentage === null ? "Studio required" : percent(video.averageViewPercentage)}</td>
                      <td className="px-3 py-3 text-right text-[10px] text-zinc-600">{video.subscribersGained === null ? "Studio required" : number(video.subscribersGained)}</td>
                      <td className="px-3 py-3 text-right">{video.url ? <a href={video.url} target="_blank" rel="noreferrer" className="rounded-lg bg-red-600 px-3 py-2 text-[10px] font-black text-white hover:bg-red-500">Watch ↗</a> : <span className="text-[10px] text-zinc-700">Unavailable</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="border-t border-zinc-800 p-8 text-center text-xs text-zinc-500">No video titles match that search.</div>}
        </div>
      )}
    </section>
  );
}

function StateCard({ title, detail, error = false }: { title: string; detail?: string; error?: boolean }) {
  return <div role={error ? "alert" : undefined} className={`rounded-2xl border p-8 text-center ${error ? "border-rose-500/30 bg-rose-500/10" : "border-zinc-800 bg-zinc-900/50"}`}><p className={`text-sm font-bold ${error ? "text-rose-200" : "text-white"}`}>{title}</p>{detail && <p className={`mt-1 text-xs ${error ? "text-rose-300/70" : "text-zinc-500"}`}>{detail}</p>}</div>;
}
