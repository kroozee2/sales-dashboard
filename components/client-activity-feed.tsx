"use client";

import { useMemo, useState } from "react";
import {
  activityKind, groupByDay, since, summariseEngagement,
  type ActivityRow,
} from "@/lib/client-activity";

// What clients did in the members app, on the Clients dashboard.
//
// The dashboard could always tell you a client's status. It could never tell
// you whether they had opened the thing they bought. This is that: the live
// feed out of Helm's activity_log, with the rollup above it.
//
// Everything here is derived from the payload's own clock rather than the
// browser's, so the counts cannot disagree with the rest of the page.

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "using", label: "📱 Using the app" },
  { key: "building", label: "🛠 Building" },
  { key: "progress", label: "✅ Progress" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

export function ClientActivityFeed({ activity, generatedAt }: { activity: ActivityRow[]; generatedAt: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const asOf = useMemo(() => new Date(generatedAt), [generatedAt]);

  const summary = useMemo(() => summariseEngagement(activity, asOf, 30), [activity, asOf]);

  const shown = useMemo(() => {
    const clientOnly = activity.filter((row) => activityKind(row.type).side === "client");
    if (filter === "all") return clientOnly;
    return clientOnly.filter((row) => activityKind(row.type).bucket === filter);
  }, [activity, filter]);

  const days = useMemo(() => groupByDay(shown, asOf, 60), [shown, asOf]);
  const peak = Math.max(1, ...summary.perDay.map((d) => d.count));

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950">
      <header className="flex flex-col gap-3 border-b border-zinc-800 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-black text-white">In the members app</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            What clients have actually been doing. Last 30 days.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Figure value={summary.activeClients} label="active clients" tone="text-emerald-300" />
          <Figure value={summary.actions} label="actions" tone="text-white" />
        </div>
      </header>

      {/* 30-day shape. Bars, because a quiet week should look quiet. */}
      <div className="flex items-end gap-[3px] border-b border-zinc-800/70 px-4 py-3" aria-hidden>
        {summary.perDay.map((day) => (
          <span
            key={day.day}
            title={`${day.day}: ${day.count}`}
            className={`flex-1 rounded-sm ${day.count > 0 ? "bg-emerald-500/70" : "bg-zinc-800"}`}
            style={{ height: `${Math.max(3, Math.round((day.count / peak) * 36))}px` }}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 divide-x divide-zinc-800/70 border-b border-zinc-800/70">
        <Bucket label="Using the app" value={summary.byBucket.using} hint="logins, AI, trainings" tone="text-sky-300" />
        <Bucket label="Building" value={summary.byBucket.building} hint="offers, content, projects" tone="text-amber-300" />
        <Bucket label="Progress" value={summary.byBucket.progress} hint="tasks, numbers, proof" tone="text-emerald-300" />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-zinc-800/70 p-3" role="group" aria-label="Filter activity">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            aria-pressed={filter === option.key}
            className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
              filter === option.key
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="max-h-[26rem] overflow-auto">
        {days.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">Nothing yet for that filter.</p>
        ) : (
          days.map((day) => (
            <div key={day.day}>
              <p className="sticky top-0 z-10 bg-zinc-950/95 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500 backdrop-blur">
                {day.label}
              </p>
              <ul className="divide-y divide-zinc-800/50">
                {day.rows.map((row) => {
                  const kind = activityKind(row.type);
                  return (
                    <li key={row.id} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-900/60">
                      <span aria-hidden className="mt-0.5 w-5 shrink-0 text-center text-sm">{kind.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-200">
                          {row.clientName && <span className="font-bold text-white">{row.clientName} </span>}
                          <span className={kind.tone}>{kind.label}</span>
                        </span>
                        {row.summary && (
                          <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{row.summary}</span>
                        )}
                      </span>
                      <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-zinc-600">{since(row.at, asOf)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Figure({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="text-right">
      <p className={`text-2xl font-black tabular-nums leading-none ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}

function Bucket({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className={`text-xl font-black tabular-nums ${value > 0 ? tone : "text-zinc-700"}`}>{value}</p>
      <p className="truncate text-[11px] font-bold text-zinc-400">{label}</p>
      <p className="truncate text-[10px] text-zinc-600">{hint}</p>
    </div>
  );
}
