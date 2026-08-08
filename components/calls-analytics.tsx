"use client";

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { SalesCall } from "@/lib/supabase-calls";

// ─── Color map ────────────────────────────────────────────────────────────────
const RESULT_COLORS: Record<string, string> = {
  "✅ Sale":          "#10b981",
  "📣 Follow Up":    "#f59e0b",
  "🔜 Upcoming":     "#3b82f6",
  "❌ Did Not Close":"#ef4444",
  "👻 No Show":      "#71717a",
};

const TYPE_COLORS: Record<string, string> = {
  "📞 Sales Call":   "#8b5cf6",
  "🔍 Triage Call":  "#06b6d4",
  "🎓 Coaching Call":"#10b981",
  "🤝 JV Call":      "#f59e0b",
  "👥 Group Call":   "#ec4899",
};

function shortLabel(s: string) {
  return s.replace(/^[^\s]+\s/, ""); // strip leading emoji
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleString("en-US", { month: "short" })} '${String(d.getFullYear()).slice(2)}`;
}

function sortedMonths(keys: string[]): string[] {
  return keys.sort((a, b) => {
    const parse = (s: string) => {
      const [mon, yr] = s.split(" '");
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return Number(yr) * 12 + months.indexOf(mon);
    };
    return parse(a) - parse(b);
  });
}

const tooltipStyle = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: "12px",
  color: "#fff",
  fontSize: 12,
};

function formatRevenue(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

// ─── Stats Bar (extended) ─────────────────────────────────────────────────────
export function ExtendedStatsBar({ calls }: { calls: SalesCall[] }) {
  const booked = calls.length;
  const showed = calls.filter((c) => c.showed).length;
  const completed = calls.filter((c) => c.result && !c.result.includes("Upcoming") && !c.result.includes("No Show"));
  const sales = calls.filter((c) => c.result?.includes("Sale")).length;
  const offerMade = calls.filter((c) => c.offer_made || !!c.offer).length;
  const enrolled = calls.filter((c) => c.success === true).length;
  const totalRevenue = calls.reduce((s, c) => s + (c.deal_amount ?? c.new_revenue ?? 0), 0);
  const showRate = booked ? Math.round((showed / booked) * 100) : 0;
  const closeRate = completed.length ? Math.round((sales / completed.length) * 100) : 0;
  const offerRate = completed.length ? Math.round((offerMade / completed.length) * 100) : 0;

  const stats = [
    {
      emoji: "📞",
      label: "Calls Booked",
      value: booked.toLocaleString(),
      color: "text-white",
      sub: `${showed} showed · ${showRate}% show rate`,
      accent: "from-zinc-800 to-zinc-900",
      border: "border-zinc-700/50",
    },
    {
      emoji: "✅",
      label: "Showed Up",
      value: showed.toLocaleString(),
      color: "text-blue-300",
      sub: `${showRate}% of booked`,
      accent: "from-blue-950/60 to-zinc-900",
      border: "border-blue-700/30",
    },
    {
      emoji: "🎯",
      label: "Enrolled",
      value: enrolled.toLocaleString(),
      color: "text-emerald-300",
      sub: enrolled > 0 ? `${Math.round((enrolled / (showed || 1)) * 100)}% of showed` : "—",
      accent: "from-emerald-950/50 to-zinc-900",
      border: "border-emerald-700/30",
    },
    {
      emoji: "🔥",
      label: "Close Rate",
      value: `${closeRate}%`,
      color: closeRate >= 25 ? "text-emerald-300" : closeRate >= 15 ? "text-amber-300" : "text-red-400",
      sub: `${sales} sales · ${completed.length} completed`,
      accent: closeRate >= 25 ? "from-emerald-950/40 to-zinc-900" : "from-amber-950/40 to-zinc-900",
      border: closeRate >= 25 ? "border-emerald-700/30" : "border-amber-700/30",
    },
    {
      emoji: "💼",
      label: "Offer Made Rate",
      value: `${offerRate}%`,
      color: "text-violet-300",
      sub: `${offerMade} offers made`,
      accent: "from-violet-950/40 to-zinc-900",
      border: "border-violet-700/30",
    },
    {
      emoji: "💰",
      label: "Total Revenue",
      value: formatRevenue(totalRevenue),
      color: "text-emerald-300",
      sub: `$${totalRevenue.toLocaleString()} exact`,
      accent: "from-emerald-950/60 to-zinc-900",
      border: "border-emerald-600/40",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
      {stats.map(({ emoji, label, value, color, sub, accent, border }) => (
        <div
          key={label}
          className={`relative bg-gradient-to-b ${accent} border ${border} rounded-2xl p-4 overflow-hidden`}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base leading-none">{emoji}</span>
            <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider leading-tight">{label}</p>
          </div>
          <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
          {sub && <p className="text-[11px] text-zinc-500 mt-1.5 leading-tight">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Results Breakdown Bar ────────────────────────────────────────────────────
export function ResultsChart({ calls }: { calls: SalesCall[] }) {
  const counts: Record<string, number> = {};
  calls.forEach((c) => {
    const k = c.result ?? "No Result";
    counts[k] = (counts[k] ?? 0) + 1;
  });

  const data = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([result, count]) => ({ result: shortLabel(result), count, full: result }));

  return (
    <ChartCard title="Results Breakdown">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="result" tick={{ fill: "#71717a", fontSize: 11 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#27272a" }} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.full} fill={RESULT_COLORS[d.full] ?? "#8b5cf6"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Success % Pie ────────────────────────────────────────────────────────────
export function SuccessPie({ calls }: { calls: SalesCall[] }) {
  const yes = calls.filter((c) => c.success === true).length;
  const no = calls.filter((c) => c.success === false).length;
  const total = yes + no;
  const pct = total ? Math.round((yes / total) * 100) : 0;

  const data = [
    { name: "Enrolled", value: yes },
    { name: "Did Not Enroll", value: no },
  ];

  return (
    <ChartCard title="Success Rate">
      <div className="flex items-center gap-6">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
              <Cell fill="#10b981" />
              <Cell fill="#ef4444" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-3">
          <div>
            <p className="text-3xl font-bold text-emerald-400">{pct}%</p>
            <p className="text-xs text-zinc-500">success rate</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-zinc-400"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />{yes} enrolled</p>
            <p className="text-xs text-zinc-400"><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1.5" />{no} did not</p>
          </div>
        </div>
      </div>
    </ChartCard>
  );
}

// ─── Revenue by Month ─────────────────────────────────────────────────────────
export function RevenueByMonth({ calls }: { calls: SalesCall[] }) {
  const byMonth: Record<string, number> = {};
  calls.forEach((c) => {
    if (!c.call_date) return;
    const rev = c.deal_amount ?? c.new_revenue ?? 0;
    if (!rev) return;
    const k = monthKey(c.call_date);
    byMonth[k] = (byMonth[k] ?? 0) + rev;
  });

  const data = sortedMonths(Object.keys(byMonth)).slice(-24).map((k) => ({
    month: k,
    revenue: byMonth[k],
  }));

  if (data.length === 0) return null;

  return (
    <ChartCard title="Revenue by Month" wide>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
          <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Bookings by Month ────────────────────────────────────────────────────────
export function BookingsByMonth({ calls }: { calls: SalesCall[] }) {
  const byMonth: Record<string, Record<string, number>> = {};
  const types = new Set<string>();

  calls.forEach((c) => {
    if (!c.call_date) return;
    const k = monthKey(c.call_date);
    const t = c.call_type ?? "Other";
    types.add(t);
    if (!byMonth[k]) byMonth[k] = {};
    byMonth[k][t] = (byMonth[k][t] ?? 0) + 1;
  });

  const months = sortedMonths(Object.keys(byMonth)).slice(-18);
  const data = months.map((k) => ({ month: k, ...byMonth[k] }));
  const typeList = [...types];

  if (data.length === 0) return null;

  return (
    <ChartCard title="Bookings by Month" wide>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#27272a" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#71717a" }} formatter={(v) => shortLabel(v)} />
          {typeList.map((t) => (
            <Bar key={t} dataKey={t} stackId="a" fill={TYPE_COLORS[t] ?? "#8b5cf6"} radius={typeList.indexOf(t) === typeList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Call Results by Month ────────────────────────────────────────────────────
export function ResultsByMonth({ calls }: { calls: SalesCall[] }) {
  const byMonth: Record<string, Record<string, number>> = {};
  const results = new Set<string>();

  calls.forEach((c) => {
    if (!c.call_date || !c.result) return;
    const k = monthKey(c.call_date);
    results.add(c.result);
    if (!byMonth[k]) byMonth[k] = {};
    byMonth[k][c.result] = (byMonth[k][c.result] ?? 0) + 1;
  });

  const months = sortedMonths(Object.keys(byMonth)).slice(-18);
  const data = months.map((k) => ({ month: k, ...byMonth[k] }));
  const resultList = [...results];

  if (data.length === 0) return null;

  return (
    <ChartCard title="Call Results by Month" wide>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#27272a" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#71717a" }} formatter={(v) => shortLabel(v)} />
          {resultList.map((r, i) => (
            <Bar key={r} dataKey={r} stackId="a" fill={RESULT_COLORS[r] ?? "#8b5cf6"} radius={i === resultList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Chart Card wrapper ───────────────────────────────────────────────────────
function ChartCard({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-4 ${wide ? "col-span-2" : ""}`}>
      <p className="text-sm font-semibold text-white mb-4">{title}</p>
      {children}
    </div>
  );
}
