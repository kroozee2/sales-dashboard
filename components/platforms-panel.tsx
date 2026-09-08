"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Marketing → Platforms. How big the audience is, and which way it is moving.

type Point = { date: string; followers: number | null };
type Platform = {
  key: string; label: string; emoji: string; unit: string; handle: string | null;
  followers: number | null; posts: number | null; total_views: number | null;
  captured_on: string | null; change: number | null; series: Point[];
  basis: "snapshots" | "youtube-analytics" | null;
  detail: string | null;
};
type MonthPlatform = {
  platform: string; posts: number; views: number; engagement: number;
  avg_views: number; followers: number | null; followers_change: number | null;
};
type Month = {
  month: string; label: string; platforms: MonthPlatform[];
  totals: { posts: number; views: number; engagement: number };
};
type Data = {
  range: string;
  platforms: Platform[];
  monthly: Month[];
  totals: { audience: number; change: number; tracking_since: string | null; days_of_history: number };
  error?: string;
};

const RANGES = [
  { key: "all", label: "All time" },
  { key: "year", label: "Year" },
  { key: "quarter", label: "Quarter" },
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
] as const;

const ACCENT: Record<string, { bar: string; text: string; ring: string }> = {
  instagram: { bar: "bg-pink-500", text: "text-pink-300", ring: "border-pink-500/30" },
  youtube: { bar: "bg-red-500", text: "text-red-300", ring: "border-red-500/30" },
  facebook: { bar: "bg-blue-500", text: "text-blue-300", ring: "border-blue-500/30" },
  skool: { bar: "bg-amber-500", text: "text-amber-300", ring: "border-amber-500/30" },
};

const n = (v: number | null | undefined) => (v == null ? "—" : new Intl.NumberFormat("en-US").format(v));
const signed = (v: number | null) => (v == null ? null : `${v > 0 ? "+" : ""}${new Intl.NumberFormat("en-US").format(v)}`);

// A line through the stored points. One point is a dot, not a line — drawing a
// flat line through a single reading would imply a trend that isn't measured.
function Spark({ series, color }: { series: Point[]; color: string }) {
  const pts = series.filter((p) => p.followers != null) as { date: string; followers: number }[];
  if (pts.length === 0) return <div className="h-10" />;
  if (pts.length === 1) {
    return (
      <div className="flex h-10 items-center gap-2">
        <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
        <span className="text-[10px] text-zinc-600">first reading — the line starts here</span>
      </div>
    );
  }
  const vals = pts.map((p) => p.followers);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const d = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * 100;
    const y = 100 - ((p.followers - lo) / span) * 100;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" className={color.replace("bg-", "text-")} />
    </svg>
  );
}

export function PlatformsPanel() {
  // All time first: the only window with a number for every platform today.
  const [range, setRange] = useState<"all" | "week" | "month" | "quarter" | "year">("all");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (r: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/marketing/platforms?range=${r}`, { cache: "no-store" });
      const json = (await res.json()) as Data;
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load platforms");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(range); }, [range, load]);

  async function capture() {
    setSyncing(true); setNote(null);
    try {
      const res = await fetch("/api/marketing/platforms", { method: "POST" });
      const j = (await res.json()) as { captured?: number; failures?: { platform: string; reason: string }[]; error?: string };
      if (j.error) throw new Error(j.error);
      const failed = (j.failures ?? []).map((f) => f.platform).join(", ");
      setNote(`Captured ${j.captured} platform${j.captured === 1 ? "" : "s"}${failed ? ` · could not read ${failed}` : ""}`);
      await load(range);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Capture failed");
    } finally { setSyncing(false); }
  }

  const history = data?.totals.days_of_history ?? 0;
  // Say which platforms the headline change actually covers, so a number that
  // only reflects YouTube is never read as the whole audience moving.
  const measured = (data?.platforms ?? []).filter((p) => p.change != null).map((p) => p.label);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-zinc-900 p-1">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={cn("rounded-lg px-4 py-1.5 text-xs font-bold transition-colors",
                range === r.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white")}>
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={() => void capture()} disabled={syncing}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50">
          {syncing ? "Reading platforms…" : "↻ Capture today"}
        </button>
      </div>

      {note && <p role="status" className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{note}</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">{error}</p>}

      {loading && !data ? (
        <p className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60 py-16 text-center text-sm text-zinc-500">Reading your audience…</p>
      ) : data && (
        <>
          <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Total audience</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-4xl font-black tabular-nums text-white">{n(data.totals.audience)}</span>
              {data.totals.change !== 0 && (
                <span className={cn("text-sm font-bold", data.totals.change > 0 ? "text-emerald-400" : "text-rose-400")}>
                  {signed(data.totals.change)} {data.range === "all" ? "all time" : `this ${data.range}`}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {measured.length === 0
                ? "No growth measured for this window yet — daily readings start today."
                : `Growth measured for ${measured.join(" and ")}. The rest fills in as daily readings accrue.`}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.platforms.map((p) => {
              const a = ACCENT[p.key] ?? ACCENT.skool;
              const connected = p.followers != null;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setOpen(open === p.key ? null : p.key)}
                  aria-expanded={open === p.key}
                  className={cn(
                    "rounded-2xl border bg-zinc-900/60 p-4 text-left transition-colors hover:bg-zinc-900",
                    connected ? a.ring : "border-dashed border-zinc-800",
                    open === p.key && "ring-1 ring-blue-500/40",
                  )}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-black text-white">{p.emoji} {p.label}</span>
                    {p.change != null && p.change !== 0 && (
                      <span className={cn("text-xs font-bold", p.change > 0 ? "text-emerald-400" : "text-rose-400")}>{signed(p.change)}</span>
                    )}
                  </div>
                  {connected ? (
                    <>
                      <p className={cn("mt-1 text-3xl font-black tabular-nums", a.text)}>{n(p.followers)}</p>
                      <p className="text-[11px] text-zinc-500">{p.unit}{p.handle ? ` · ${p.handle}` : ""}</p>
                      {p.change != null ? (
                        <p className="mt-1.5 text-[11px] text-zinc-400">
                          <span className={cn("font-bold", p.change > 0 ? "text-emerald-400" : p.change < 0 ? "text-rose-400" : "text-zinc-400")}>
                            {signed(p.change)}
                          </span>{" "}
                          {p.detail ?? (p.basis === "snapshots" ? "from daily readings" : "")}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[11px] text-zinc-600">No growth figure for this window yet</p>
                      )}
                      <div className="mt-2"><Spark series={p.series} color={a.bar} /></div>
                      {(p.posts != null || p.total_views != null) && (
                        <p className="mt-1 text-[11px] text-zinc-600">
                          {p.posts != null ? `${n(p.posts)} posts` : ""}
                          {p.posts != null && p.total_views != null ? " · " : ""}
                          {p.total_views != null ? `${n(p.total_views)} views` : ""}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-2xl font-black text-zinc-700">—</p>
                      <p className="text-[11px] text-zinc-500">{p.unit}</p>
                      <p className="mt-2 text-[11px] leading-relaxed text-amber-300/70">
                        Not connected. The public group URL returns 404, so member count can&apos;t be read yet.
                      </p>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {open && (() => {
            const p = data.platforms.find((x) => x.key === open);
            if (!p) return null;
            return <GrowthDetail platform={p} range={data.range} onClose={() => setOpen(null)} />;
          })()}

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-sm font-black text-white">Share of audience</p>
            <p className="mb-3 text-[11px] text-zinc-500">Where the {n(data.totals.audience)} people actually are.</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-zinc-800">
              {data.platforms.filter((p) => p.followers).map((p) => (
                <div key={p.key} className={cn("h-full", (ACCENT[p.key] ?? ACCENT.skool).bar)}
                  style={{ width: `${((p.followers ?? 0) / (data.totals.audience || 1)) * 100}%` }}
                  title={`${p.label}: ${n(p.followers)}`} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {data.platforms.filter((p) => p.followers).map((p) => (
                <span key={p.key} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span className={cn("h-2 w-2 rounded-sm", (ACCENT[p.key] ?? ACCENT.skool).bar)} />
                  {p.label} {Math.round(((p.followers ?? 0) / (data.totals.audience || 1)) * 100)}%
                </span>
              ))}
            </div>
          </div>

          <MonthlyTable months={data.monthly ?? []} />
        </>
      )}
    </div>
  );
}


// Month by month, per platform. Followers fill in as snapshots accrue; posts,
// views and engagement are real history from the posted content itself.
function MonthlyTable({ months }: { months: Month[] }) {
  const [metric, setMetric] = useState<"views" | "posts" | "engagement" | "avg_views">("views");
  const KEYS = ["instagram", "youtube", "facebook"] as const;
  const METRICS = [
    { key: "views", label: "Views" },
    { key: "posts", label: "Posts" },
    { key: "engagement", label: "Engagement" },
    { key: "avg_views", label: "Avg / post" },
  ] as const;

  const cell = (m: Month, k: string) => {
    const p = m.platforms.find((x) => x.platform === k);
    return p ? (p[metric] as number) : 0;
  };
  const peak = Math.max(1, ...months.flatMap((m) => KEYS.map((k) => cell(m, k))));
  const monthTotal = (m: Month) =>
    metric === "avg_views"
      ? (m.totals.posts ? Math.round(m.totals.views / m.totals.posts) : 0)
      : (m.totals[metric as "views" | "posts" | "engagement"] ?? 0);

  if (months.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 p-4">
        <div>
          <p className="text-sm font-black text-white">Growth by month</p>
          <p className="text-[11px] text-zinc-500">Every platform, month by month. Newest first.</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-950 p-0.5">
          {METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors",
                metric === m.key ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white")}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/50 text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2 text-left font-bold">Month</th>
              {KEYS.map((k) => (
                <th key={k} className="px-3 py-2 text-right font-bold">
                  <span className={ACCENT[k].text}>{k === "instagram" ? "📸 Instagram" : k === "youtube" ? "▶️ YouTube" : "👍 Facebook"}</span>
                </th>
              ))}
              <th className="px-4 py-2 text-right font-bold text-zinc-300">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {months.map((m) => (
              <tr key={m.month} className="transition-colors hover:bg-zinc-800/30">
                <td className="whitespace-nowrap px-4 py-2 font-semibold text-zinc-200">{m.label}</td>
                {KEYS.map((k) => {
                  const v = cell(m, k);
                  return (
                    <td key={k} className="px-3 py-2 text-right">
                      <span className={cn("tabular-nums", v ? "text-zinc-200" : "text-zinc-700")}>{n(v)}</span>
                      {/* A bar in the cell, so a column scans as a shape not a wall of digits. */}
                      <span className="mt-1 block h-0.5 w-full overflow-hidden rounded-full bg-zinc-800">
                        <span className={cn("block h-full rounded-full", ACCENT[k].bar)} style={{ width: `${(v / peak) * 100}%` }} />
                      </span>
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-right font-bold tabular-nums text-white">{n(monthTotal(m))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-600">
        Posts, views and engagement come from what actually published. Follower counts per month
        begin once there are snapshots to compare — today is the first.
      </p>
    </div>
  );
}


// Clicking a platform opens this: the gain or loss for the window you picked,
// what it is built from, and every reading taken so far.
function GrowthDetail({ platform: p, range, onClose }: { platform: Platform; range: string; onClose: () => void }) {
  const a = ACCENT[p.key] ?? ACCENT.skool;
  const window = range === "all" ? "all time" : `this ${range}`;
  const readings = p.series.filter((x) => x.followers != null) as { date: string; followers: number }[];

  return (
    <div className={cn("rounded-2xl border bg-zinc-900/80 p-5", a.ring)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">{p.emoji} {p.label}</p>
          <p className="text-[11px] text-zinc-500">{p.handle ?? "not connected"}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-xl leading-none text-zinc-500 hover:text-white">×</button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Now</p>
          <p className={cn("mt-1 text-2xl font-black tabular-nums", a.text)}>{n(p.followers)}</p>
          <p className="text-[11px] text-zinc-600">{p.unit}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Change {window}</p>
          <p className={cn("mt-1 text-2xl font-black tabular-nums",
            p.change == null ? "text-zinc-700" : p.change > 0 ? "text-emerald-400" : p.change < 0 ? "text-rose-400" : "text-zinc-300")}>
            {p.change == null ? "—" : signed(p.change)}
          </p>
          <p className="text-[11px] text-zinc-600">
            {p.change == null ? "not measured yet" : p.basis === "youtube-analytics" ? "from YouTube Analytics" : "from daily readings"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Readings</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-zinc-300">{readings.length}</p>
          <p className="text-[11px] text-zinc-600">{readings.length < 2 ? "two needed for a trend" : `since ${readings[0].date}`}</p>
        </div>
      </div>

      {/* The gained/lost split, where the platform reports it. */}
      {p.detail && (
        <p className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-xs text-emerald-100/80">
          {p.detail}
        </p>
      )}

      {p.change == null && (
        <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-100/80">
          {p.followers == null
            ? "This platform isn't connected, so there is nothing to measure yet."
            : p.key === "youtube"
              ? "YouTube reports its subscriber movement for one 365-day window, so it answers Year and All time. Shorter windows need the daily readings, which start today."
              : "Nothing recorded this platform's audience before today, so there is no earlier number to compare against. Capture a reading each day and this fills in — a week from now, Week works."}
        </p>
      )}

      {readings.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Every reading</p>
          <div className="divide-y divide-zinc-800/70 overflow-hidden rounded-xl border border-zinc-800">
            {[...readings].reverse().slice(0, 12).map((r, i, arr) => {
              const prev = arr[i + 1];
              const delta = prev ? r.followers - prev.followers : null;
              return (
                <div key={r.date} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-zinc-400">{new Date(`${r.date}T12:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="font-bold tabular-nums text-zinc-200">{n(r.followers)}</span>
                    {delta !== null && (
                      <span className={cn("w-14 text-right tabular-nums", delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-zinc-600")}>
                        {delta === 0 ? "—" : signed(delta)}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
