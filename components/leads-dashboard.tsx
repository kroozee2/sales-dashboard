"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Leads → Dashboard. Two questions, month by month: how many new leads came in
// and where from, and how many calls got booked and where from.

type Bucket = { key: string; label: string; leads: number; calls: number };
type Slice = { name: string; count: number };
type Data = {
  period: "month" | "quarter" | "year";
  buckets: Bucket[];
  totals: { leads: number; calls: number };
  lead_sources: Slice[];
  booking_sources: Slice[];
  lead_types: Slice[];
  scan: { scanned: number; skipped_instagram: number; leads_scanned_back_to: string | null };
  calls_counted_by: string;
  error?: string;
};

const PERIODS = [
  { key: "month", label: "Monthly" },
  { key: "quarter", label: "Quarterly" },
  { key: "year", label: "Annual" },
] as const;

const BAR = ["bg-sky-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-lime-500"];

function Breakdown({ title, note, slices, empty }: { title: string; note: string; slices: Slice[]; empty: string }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mb-3 text-[11px] text-zinc-500">{note}</p>
      {slices.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-600">{empty}</p>
      ) : (
        <div className="space-y-2.5">
          {slices.map((s, i) => {
            const pct = total ? Math.round((s.count / total) * 100) : 0;
            return (
              <div key={s.name}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-zinc-300">{s.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                    <span className="font-bold text-zinc-300">{s.count}</span> · {pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className={cn("h-full rounded-full", BAR[i % BAR.length])} style={{ width: `${Math.max(pct, 1.5)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LeadsDashboard() {
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/leads/dashboard?period=${p}`, { cache: "no-store" });
      const json = (await res.json()) as Data;
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the dashboard");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(period); }, [period, load]);

  const buckets = data?.buckets ?? [];
  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.leads, b.calls)));
  // A bucket older than the lead scan has no figure — not a zero.
  const backTo = data?.scan.leads_scanned_back_to?.slice(0, 7) ?? null;
  const unscanned = (b: Bucket) => !!backTo && b.leads === 0 && b.key < backTo;

  const conversion = data && data.totals.leads > 0
    ? Math.round((data.totals.calls / data.totals.leads) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">📊 Leads Dashboard</h2>
          <p className="text-xs text-zinc-400">Where leads come from, and what turns into a booked call.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-zinc-900 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn("rounded-lg px-4 py-1.5 text-xs font-bold transition-colors",
                period === p.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white")}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
          <p className="text-sm text-rose-200">{error}</p>
          <button onClick={() => void load(period)} className="mt-3 rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs font-bold text-rose-100">Try again</button>
        </div>
      ) : loading && !data ? (
        <p className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60 py-20 text-center text-sm text-zinc-500">
          Reading GoHighLevel and your sales calls…
        </p>
      ) : data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { emoji: "🌱", label: "New leads", value: data.totals.leads, tone: "text-sky-300", sub: `across ${buckets.length} ${period}s` },
              { emoji: "📞", label: "Calls booked", value: data.totals.calls, tone: "text-violet-300", sub: "by call date" },
              { emoji: "🎯", label: "Lead → call", value: conversion === null ? "—" : `${conversion}%`, tone: "text-emerald-300", sub: "of leads booked" },
              { emoji: "🏆", label: "Top source", value: data.lead_sources[0]?.name ?? "—", tone: "text-amber-300", sub: data.lead_sources[0] ? `${data.lead_sources[0].count} leads` : "", small: true },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{k.emoji} {k.label}</p>
                <p className={cn("mt-1 font-black tabular-nums", k.tone, k.small ? "truncate text-lg" : "text-3xl")}>{k.value}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-white">Leads in, calls booked</p>
              <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-sky-500" />New leads</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-violet-500" />Calls booked</span>
              </div>
            </div>
            <div className="flex items-end gap-1.5 overflow-x-auto no-scrollbar" style={{ height: 190 }}>
              {buckets.map((b) => (
                <div key={b.key} className="flex min-w-[42px] flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-[150px] w-full items-end justify-center gap-1">
                    <div
                      title={unscanned(b) ? "Not scanned this far back" : `${b.leads} new leads`}
                      className={cn("w-1/2 rounded-t transition-all", unscanned(b) ? "bg-zinc-800" : "bg-sky-500 hover:bg-sky-400")}
                      style={{ height: unscanned(b) ? 3 : `${Math.max((b.leads / peak) * 100, b.leads ? 2 : 0)}%` }}
                    />
                    <div
                      title={`${b.calls} calls booked`}
                      className="w-1/2 rounded-t bg-violet-500 transition-all hover:bg-violet-400"
                      style={{ height: `${Math.max((b.calls / peak) * 100, b.calls ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap text-[10px] text-zinc-500">{b.label}</span>
                  <span className="text-[10px] tabular-nums text-zinc-600">
                    {unscanned(b) ? "–" : b.leads}/{b.calls}
                  </span>
                </div>
              ))}
            </div>
            {backTo && (
              <p className="mt-3 text-[11px] text-zinc-500">
                Lead counts reach back to {new Date(`${backTo}-01T12:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })} —
                greyed bars are months the scan didn&apos;t cover, not months with no leads.
              </p>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Breakdown
              title="Where leads came from"
              note={`GoHighLevel opt-ins · ${data.scan.skipped_instagram} Instagram excluded of ${data.scan.scanned} scanned`}
              slices={data.lead_sources}
              empty="No opt-ins in this window."
            />
            <Breakdown
              title="Where they booked"
              note="Booking source on your sales calls"
              slices={data.booking_sources}
              empty="No booked calls in this window."
            />
            <Breakdown
              title="What kind of lead"
              note="Prospect quality once they reach a call"
              slices={data.lead_types}
              empty="Nothing rated in this window."
            />
          </div>

          <p className="text-[11px] text-zinc-600">
            Calls are counted by the date of the call. Your records don&apos;t carry a booking date —
            it&apos;s empty on all 837 rows — so counting by &ldquo;booked in month X&rdquo; isn&apos;t possible yet.
          </p>
        </>
      )}
    </div>
  );
}
