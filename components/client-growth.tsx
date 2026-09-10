"use client";

/**
 * The money picture, the way Helm's Dashboards shows it.
 *
 * Sales OS's Dashboard counted clients and drew health bars, which the Members
 * list already tells you. What it could not answer is whether the book is
 * growing. These are the check-ins the clients file each month: cash collected,
 * new revenue, NPS, and whether anyone is filling them in.
 */

import type { GrowthSummary } from "@/lib/clients";

const money = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);

const TONE: Record<"good" | "watch" | "risk", string> = {
  good: "bg-emerald-500",
  watch: "bg-amber-500",
  risk: "bg-rose-500",
};

export default function ClientGrowth({ growth }: { growth: GrowthSummary }) {
  const hasMoney = growth.months.some((m) => m.cash > 0 || m.newRevenue > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart title="Cash collected by month" points={growth.months} pick={(m) => m.cash} colour="from-emerald-500 to-emerald-400" />
        <Chart title="New revenue by month" points={growth.months} pick={(m) => m.newRevenue} colour="from-blue-500 to-blue-400" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Contact recency" detail="Active clients, by how long since anyone spoke to them">
          <div className="space-y-2">
            {growth.recency.map((band) => {
              const total = growth.recency.reduce((sum, b) => sum + b.count, 0);
              const pct = total ? Math.round((band.count / total) * 100) : 0;
              return (
                <div key={band.label}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-zinc-400">{band.label}</span>
                    <span className="tabular-nums text-zinc-500"><b className="text-white">{band.count}</b> · {pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div className={`h-full rounded-full ${TONE[band.tone]} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Check-in compliance" detail="Active clients who filed this month">
          <p className="text-4xl font-bold tabular-nums text-white">{growth.compliance.pct}<span className="text-lg text-zinc-600">%</span></p>
          <p className="mt-1 text-xs text-zinc-500">
            {growth.compliance.submitted} of {growth.compliance.expected} filed
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className={`h-full rounded-full transition-[width] duration-500 ${growth.compliance.pct >= 60 ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${growth.compliance.pct}%` }} />
          </div>
        </Panel>

        <Panel title="Average NPS" detail="Latest score across active clients">
          {growth.averageNps === null ? (
            <p className="text-sm text-zinc-600">No scores recorded yet.</p>
          ) : (
            <>
              <p className={`text-4xl font-bold tabular-nums ${growth.averageNps >= 9 ? "text-emerald-300" : growth.averageNps >= 7 ? "text-amber-300" : "text-rose-300"}`}>
                {growth.averageNps}<span className="text-lg text-zinc-600">/10</span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">Each client&rsquo;s most recent scored month</p>
            </>
          )}
        </Panel>
      </div>

      {!hasMoney && (
        <p className="text-center text-xs text-zinc-600">
          No cash or revenue recorded on any check-in yet — the charts fill in as clients file them.
        </p>
      )}
    </div>
  );
}

function Panel({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mb-3 mt-0.5 text-[11px] text-zinc-600">{detail}</p>
      {children}
    </div>
  );
}

/**
 * Bars scaled to the tallest month in view. A fixed ceiling would flatten a
 * good year into nothing; scaling to the data is what makes the shape readable.
 */
function Chart({ title, points, pick, colour }: {
  title: string; points: GrowthSummary["months"]; pick: (m: GrowthSummary["months"][number]) => number; colour: string;
}) {
  const top = points.reduce((max, point) => Math.max(max, pick(point)), 0);
  const total = points.reduce((sum, point) => sum + pick(point), 0);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
        <p className="text-sm font-bold tabular-nums text-white">{money(total)}</p>
      </div>
      {points.length === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-600">No check-ins filed yet.</p>
      ) : (
        <div className="mt-4 flex h-32 items-end gap-1.5">
          {points.map((point) => {
            const value = pick(point);
            const height = top > 0 ? Math.max(2, Math.round((value / top) * 100)) : 2;
            return (
              <div key={point.key} className="group flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">
                  {value > 0 ? money(value) : ""}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div className={`w-full rounded-t bg-gradient-to-t ${colour} transition-[height] duration-500`}
                    style={{ height: `${height}%` }} title={`${point.label}: ${money(value)}`} />
                </div>
                <span className="text-[10px] text-zinc-600">{point.label.split(" ")[0]}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
