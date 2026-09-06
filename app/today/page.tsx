"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SubTabs } from "@/components/sub-tabs";
import { usePerson } from "@/lib/use-person";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Entry {
  id: string;
  entry_date: string;
  person: string;
  outreaches: number;
  responses: number;
  call_offers: number;
  low_ticket_offers: number;
  low_ticket_revenue: number;
  total_revenue: number;
  notes: string | null;
}

type NumKey = "outreaches" | "responses" | "call_offers" | "low_ticket_offers" | "low_ticket_revenue" | "total_revenue";

const METRICS: { key: NumKey; label: string; short: string; emoji: string; money: boolean; accent: string; color: string }[] = [
  { key: "outreaches", label: "Outreaches", short: "Outreach", emoji: "📤", money: false, accent: "text-blue-400", color: "#60a5fa" },
  { key: "responses", label: "Responses", short: "Responses", emoji: "💬", money: false, accent: "text-cyan-400", color: "#22d3ee" },
  { key: "call_offers", label: "Call Offers", short: "Call offers", emoji: "📞", money: false, accent: "text-violet-400", color: "#a78bfa" },
  { key: "low_ticket_offers", label: "Low-Ticket Offers", short: "LT offers", emoji: "🏷️", money: false, accent: "text-amber-400", color: "#fbbf24" },
  { key: "low_ticket_revenue", label: "Low-Ticket Rev", short: "LT rev", emoji: "💵", money: true, accent: "text-emerald-400", color: "#34d399" },
  { key: "total_revenue", label: "Total Rev", short: "Total rev", emoji: "💰", money: true, accent: "text-emerald-400", color: "#10b981" },
];

const PEOPLE = ["Andrew", "Jameson"] as const;
const personEmoji = (p: string) => (p === "Jameson" ? "🧑" : "🧔");

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];
function fmtMoney(n: number) {
  if (Math.abs(n) >= 10000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function periodStart(key: string): string | null {
  const now = new Date();
  if (key === "today") return todayStr();
  if (key === "week") {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon-based
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    return d.toISOString().split("T")[0];
  }
  if (key === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  return null; // all
}
function fmtDayLabel(d: string) {
  const dt = new Date(d + "T12:00");
  const t = todayStr();
  if (d === t) return "Today";
  const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (d === y) return "Yesterday";
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function lastNDates(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}
const fmtTick = (d: string) => { const dt = new Date(d + "T12:00"); return `${dt.getMonth() + 1}/${dt.getDate()}`; };

// ─── Editable number cell ─────────────────────────────────────────────────────
function NumCell({ value, money, onCommit }: { value: number; money: boolean; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <div className="relative">
      {money && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600 text-xs pointer-events-none">$</span>}
      <input
        type="number"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => { const n = Number(v) || 0; if (n !== value) onCommit(n); setV(String(n)); }}
        className={`w-full bg-transparent hover:bg-zinc-800 focus:bg-zinc-800 border border-transparent hover:border-zinc-700 focus:border-blue-500 rounded-lg py-1.5 text-sm text-white text-right focus:outline-none transition-colors tabular-nums ${money ? "pl-5 pr-2" : "px-2"}`}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TodayPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [person] = usePerson();
  const [period, setPeriod] = useState<string>("today");
  const [saving, setSaving] = useState(false);
  const [chartMetric, setChartMetric] = useState<NumKey>("outreaches");

  const load = useCallback(async () => {
    const res = await fetch("/api/prospecting");
    const j = await res.json() as { entries?: Entry[] };
    setEntries(j.entries ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(async (id: string, field: string, value: unknown) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
    await fetch("/api/prospecting", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, [field]: value }) });
  }, []);

  async function addEntry() {
    setSaving(true);
    const p = person === "all" ? "Andrew" : person;
    const res = await fetch("/api/prospecting", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_date: todayStr(), person: p }),
    });
    const j = await res.json() as { entry?: Entry };
    if (j.entry) setEntries((prev) => [j.entry!, ...prev]);
    setSaving(false);
  }

  async function del(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await fetch("/api/prospecting", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  // Rows for the grid: filter by person (all dates so you can edit history)
  const gridRows = useMemo(
    () => entries.filter((e) => person === "all" || e.person === person),
    [entries, person]
  );

  // Dashboard aggregates: filter by person + period
  const dash = useMemo(() => {
    const start = periodStart(period);
    const scope = entries.filter((e) =>
      (person === "all" || e.person === person) && (!start || e.entry_date >= start)
    );
    const totals = Object.fromEntries(METRICS.map((m) => [m.key, scope.reduce((s, e) => s + (Number(e[m.key]) || 0), 0)])) as Record<NumKey, number>;
    const respRate = totals.outreaches > 0 ? (totals.responses / totals.outreaches) * 100 : 0;
    return { totals, respRate, sessions: scope.length };
  }, [entries, person, period]);

  // Daily trend for the selected metric (person-filtered)
  const chartData = useMemo(() => {
    const scope = entries.filter((e) => person === "all" || e.person === person);
    const sums: Record<string, number> = {};
    for (const e of scope) sums[e.entry_date] = (sums[e.entry_date] ?? 0) + (Number(e[chartMetric]) || 0);
    let dates: string[];
    if (period === "all") {
      dates = Object.keys(sums).sort();
      if (dates.length <= 1) dates = lastNDates(7);
    } else {
      dates = lastNDates(period === "month" ? 30 : 7);
    }
    return dates.map((d) => ({ date: d, label: fmtTick(d), value: sums[d] ?? 0 }));
  }, [entries, person, period, chartMetric]);
  const chartMeta = METRICS.find((m) => m.key === chartMetric)!;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <SubTabs group="tasks" />
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">📊 KPIs</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Log every prospecting session. Punch in your numbers when you finish a block.</p>
        </div>
        <button onClick={() => void addEntry()} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0 disabled:opacity-50">
          <span className="text-base leading-none">+</span> {saving ? "Adding…" : "Log session"}
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-end gap-3 mb-4 flex-wrap">
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === p.key ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        {METRICS.map((m) => (
          <div key={m.key} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-500 text-[11px] uppercase tracking-wide flex items-center gap-1">{m.emoji} {m.short}</p>
            <p className={`font-bold text-2xl mt-1 tabular-nums ${m.accent}`}>
              {m.money ? fmtMoney(dash.totals[m.key]) : dash.totals[m.key].toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mb-7 text-xs">
        <span className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
          📈 Response rate <span className="text-cyan-400 font-bold">{dash.respRate.toFixed(0)}%</span>
        </span>
        <span className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
          🗂️ Sessions logged <span className="text-white font-bold">{dash.sessions}</span>
        </span>
      </div>

      {/* Trend chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-7">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-white font-semibold text-sm flex items-center gap-1.5">📊 Daily trend <span className="text-zinc-600 font-normal">· {chartMeta.label}</span></h2>
          <div className="flex gap-1.5 flex-wrap">
            {METRICS.map((m) => (
              <button key={m.key} onClick={() => setChartMetric(m.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${chartMetric === m.key ? "border-transparent text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}
                style={chartMetric === m.key ? { backgroundColor: m.color + "33", borderColor: m.color + "66", color: m.color } : undefined}>
                {m.emoji} {m.short}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={chartMeta.money ? 48 : 32}
              tickFormatter={(v: number) => (chartMeta.money ? fmtMoney(v) : String(v))} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "#ffffff08" }}
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#a1a1aa" }}
              formatter={(v) => (chartMeta.money ? fmtMoney(Number(v)) : String(v))}
              labelFormatter={(l, p) => (Array.isArray(p) && p[0] ? fmtDayLabel((p[0].payload as { date: string }).date) : String(l))}
            />
            <Bar name={chartMeta.label} dataKey="value" fill={chartMeta.color} radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Editable grid */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-600">
                <th className="text-left font-semibold px-4 py-2.5 w-[130px]">Date</th>
                <th className="text-left font-semibold px-2 py-2.5 w-[110px]">Person</th>
                {METRICS.map((m) => (
                  <th key={m.key} className="text-right font-semibold px-2 py-2.5">{m.short}</th>
                ))}
                <th className="w-9" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={METRICS.length + 3} className="text-center text-zinc-600 py-10 animate-pulse">Loading…</td></tr>
              ) : gridRows.length === 0 ? (
                <tr><td colSpan={METRICS.length + 3} className="text-center text-zinc-600 py-10">No sessions yet. Hit &ldquo;Log session&rdquo; after your next prospecting block.</td></tr>
              ) : gridRows.map((e) => {
                const isToday = e.entry_date === todayStr();
                return (
                  <tr key={e.id} className={`border-b border-zinc-800/60 group hover:bg-zinc-800/20 transition-colors ${isToday ? "bg-blue-600/[0.04]" : ""}`}>
                    <td className="px-3 py-1.5">
                      <input type="date" value={e.entry_date} onChange={(ev) => void patch(e.id, "entry_date", ev.target.value)}
                        className="w-full bg-transparent hover:bg-zinc-800 border border-transparent hover:border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer transition-colors" title={fmtDayLabel(e.entry_date)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={e.person} onChange={(ev) => void patch(e.id, "person", ev.target.value)}
                        className="w-full bg-transparent hover:bg-zinc-800 border border-transparent hover:border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer transition-colors">
                        {PEOPLE.map((p) => <option key={p} value={p} className="bg-zinc-900">{personEmoji(p)} {p}</option>)}
                      </select>
                    </td>
                    {METRICS.map((m) => (
                      <td key={m.key} className="px-1 py-1.5">
                        <NumCell value={Number(e[m.key]) || 0} money={m.money} onCommit={(n) => void patch(e.id, m.key, n)} />
                      </td>
                    ))}
                    <td className="px-1">
                      <button onClick={() => void del(e.id)} className="text-zinc-700 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all text-sm px-1">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {gridRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-700 text-sm font-bold">
                  <td className="px-4 py-2.5 text-zinc-500 text-xs uppercase tracking-wide" colSpan={2}>Totals ({person === "all" ? "both" : person})</td>
                  {METRICS.map((m) => {
                    const sum = gridRows.reduce((s, e) => s + (Number(e[m.key]) || 0), 0);
                    return <td key={m.key} className={`px-2 py-2.5 text-right tabular-nums ${m.accent}`}>{m.money ? fmtMoney(sum) : sum.toLocaleString()}</td>;
                  })}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <div className="mt-3">
        <button onClick={() => void addEntry()} disabled={saving}
          className="w-full py-2.5 border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-50">
          + Add a session row
        </button>
      </div>
    </div>
  );
}
