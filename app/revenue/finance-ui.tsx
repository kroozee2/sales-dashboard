"use client";

/**
 * Presentational building blocks for the Finances section.
 *
 * Kept apart from finances-workspace.tsx so the workspace stays about data and
 * these stay about pixels. Everything here is pure — props in, markup out.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// ─── Money ────────────────────────────────────────────────────────────────────

/** Compact, for headline numbers where the shape matters more than the cents. */
export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${sign}$${Math.round(v / 1_000)}K`;
  if (v >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(v).toLocaleString()}`;
}

/** Every dollar, for tables and totals you might reconcile against Stripe. */
export function moneyExact(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Trend pill ───────────────────────────────────────────────────────────────

/**
 * Up isn't always good — for churn or refunds a rise is bad — so the caller
 * says which direction counts as a win.
 */
export function DeltaPill({ pct, suffix, goodWhen = "up", size = "sm" }: {
  pct: number | null;
  suffix?: string;
  goodWhen?: "up" | "down";
  size?: "sm" | "lg";
}) {
  if (pct === null || !Number.isFinite(pct)) {
    return <span className={`text-zinc-600 ${size === "lg" ? "text-sm" : "text-[11px]"}`}>— no prior data</span>;
  }
  const rising = pct >= 0;
  const good = goodWhen === "up" ? rising : !rising;
  const tone = Math.abs(pct) < 0.5
    ? "bg-zinc-800 text-zinc-400 border-zinc-700"
    : good
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-bold ${tone} ${
      size === "lg" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]"
    }`}>
      <span aria-hidden>{rising ? "▲" : "▼"}</span>
      {Math.abs(pct) >= 999 ? "999+" : Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%
      {suffix && <span className="font-medium opacity-70">{suffix}</span>}
    </span>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

export function Sparkline({ data, color, height = 34 }: { data: number[]; color: string; height?: number }) {
  const rows = useMemo(() => data.map((v, i) => ({ i, v })), [data]);
  if (!data.some((v) => v > 0)) {
    return <div style={{ height }} className="flex items-end"><div className="h-px w-full bg-zinc-800" /></div>;
  }
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

export function StatCard({ label, value, sub, delta, deltaSuffix, goodWhen, accent, spark, onClick, children }: {
  label: string;
  value: string;
  sub?: ReactNode;
  delta?: number | null;
  deltaSuffix?: string;
  goodWhen?: "up" | "down";
  accent: string;          // tailwind text colour for the value
  spark?: { data: number[]; color: string };
  onClick?: () => void;
  children?: ReactNode;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition-colors ${
        onClick ? "hover:border-zinc-700 hover:bg-zinc-900" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        {delta !== undefined && <DeltaPill pct={delta} suffix={deltaSuffix} goodWhen={goodWhen} />}
      </div>
      <p className={`mt-1.5 text-2xl font-extrabold tabular-nums leading-none ${accent}`}>{value}</p>
      {sub && <div className="mt-1.5 text-[11px] leading-snug text-zinc-500">{sub}</div>}
      {spark && <div className="-mx-1 mt-2.5"><Sparkline data={spark.data} color={spark.color} /></div>}
      {children}
    </Tag>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function Panel({ title, emoji, right, subtitle, children, className = "" }: {
  title: string; emoji?: string; right?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            {emoji && <span aria-hidden>{emoji}</span>}{title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

// ─── Chart chrome ─────────────────────────────────────────────────────────────

const AXIS = { fill: "#71717a", fontSize: 11 };
const TOOLTIP_STYLE = {
  background: "#09090b",
  border: "1px solid #3f3f46",
  borderRadius: 12,
  fontSize: 12,
  padding: "8px 10px",
} as const;

/** One tooltip style for every chart here, so hovering feels the same everywhere. */
function ChartTooltip({ active, payload, label, hideZero = true }: {
  active?: boolean;
  payload?: { name?: string; dataKey?: string | number; value?: number; color?: string }[];
  label?: string | number;
  hideZero?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => !hideZero || Number(p.value) !== 0);
  if (!rows.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p className="mb-1 font-semibold text-zinc-200">{label}</p>
      {rows.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-zinc-400">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto font-bold tabular-nums text-white">{moneyExact(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

export interface MixBar {
  label: string;
  revenue: number;
  high: number;
  low: number;
  recurring: number;
  prev: number | null;
}

/**
 * Where the money came from, bar by bar, with the previous period drawn as a
 * line behind it. Stacking the three sources answers "what kind of month is
 * this?" without a second chart.
 */
export function RevenueMixChart({ bars, showPrev, height = 280 }: { bars: MixBar[]; showPrev: boolean; height?: number }) {
  const hasPrev = showPrev && bars.some((b) => b.prev !== null);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => money(Number(v))} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
        <Bar dataKey="high" name="High ticket" stackId="a" fill="#a855f7" maxBarSize={44} />
        <Bar dataKey="low" name="Low ticket" stackId="a" fill="#3b82f6" maxBarSize={44} />
        <Bar dataKey="recurring" name="Recurring" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={44} />
        {hasPrev && (
          <Line type="monotone" dataKey="prev" name="Last period" stroke="#f59e0b" strokeWidth={2}
            strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface PacePoint {
  label: string;
  cumulative: number | null;
  prevCumulative: number | null;
  projected: number | null;
}

/**
 * The race against last period. A cumulative curve is the one chart that says
 * "ahead or behind, right now" at a glance — the daily bars never do.
 */
export function PaceChart({ points, goal, height = 240 }: { points: PacePoint[]; goal?: number | null; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="paceNow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => money(Number(v))} />
        <Tooltip content={<ChartTooltip hideZero={false} />} />
        {goal ? (
          <ReferenceLine y={goal} stroke="#f59e0b" strokeDasharray="5 4"
            label={{ value: `Goal ${money(goal)}`, position: "insideTopLeft", fill: "#f59e0b", fontSize: 11 }} />
        ) : null}
        <Area type="monotone" dataKey="prevCumulative" name="Last period" stroke="#52525b" strokeWidth={1.5}
          strokeDasharray="4 3" fill="none" dot={false} isAnimationActive={false} connectNulls />
        <Area type="monotone" dataKey="projected" name="On pace for" stroke="#a1a1aa" strokeWidth={1.5}
          strokeDasharray="2 4" fill="none" dot={false} isAnimationActive={false} connectNulls />
        <Area type="monotone" dataKey="cumulative" name="This period" stroke="#3b82f6" strokeWidth={2.5}
          fill="url(#paceNow)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const MIX_COLORS = ["#a855f7", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#64748b"];

/** Which offers actually carried the period. */
export function OfferMix({ slices, height = 200 }: { slices: { name: string; value: number }[]; height?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) return <p className="py-10 text-center text-xs text-zinc-600">No sales in this period yet.</p>;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="w-full sm:w-[46%]" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
              {slices.map((s, i) => <Cell key={s.name} fill={MIX_COLORS[i % MIX_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip hideZero={false} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: MIX_COLORS[i % MIX_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-zinc-300">{s.name}</span>
            <span className="font-bold tabular-nums text-white">{money(s.value)}</span>
            <span className="w-9 text-right tabular-nums text-zinc-600">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A plain horizontal bar list — for renewals by week, top customers, and such. */
export function BarList({ rows, color = "#3b82f6", format = money }: {
  rows: { label: string; value: number; hint?: string }[];
  color?: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-8 text-center text-xs text-zinc-600">Nothing here yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-zinc-300">{r.label}</span>
            <span className="flex-shrink-0 font-bold tabular-nums text-white">{format(r.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
          </div>
          {r.hint && <p className="mt-0.5 text-[10px] text-zinc-600">{r.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

// ─── Spreadsheet ──────────────────────────────────────────────────────────────

export type SortDir = "asc" | "desc";

// Written out rather than interpolated so Tailwind can see the class names.
const HIDE_BELOW: Record<string, string> = {
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
  "2xl": "hidden 2xl:table-cell",
};

export interface SheetColumn<T> {
  key: string;
  label: string;
  /** Value used for sorting and CSV. */
  value: (row: T) => string | number | null;
  /** Cell contents; falls back to the sort value. */
  render?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Tailwind width class, e.g. "w-28". */
  width?: string;
  sortable?: boolean;
  /** Drop this column on narrower screens so the money column never clips. */
  hideBelow?: "lg" | "xl" | "2xl";
  /** Long free text: clipped with an ellipsis instead of widening the row. */
  truncate?: boolean;
}

export function useSheetSort<T>(columns: SheetColumn<T>[], initialKey: string, initialDir: SortDir = "desc") {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  const toggle = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sort = (rows: T[]): T[] => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      if (av === bv) return 0;
      if (av === null || av === "") return 1;   // blanks always sink
      if (bv === null || bv === "") return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  };

  return { sortKey, sortDir, toggle, sort };
}

/** Download what's on screen — same rows, same order, same filters. */
export function downloadCsv<T>(filename: string, columns: SheetColumn<T>[], rows: T[]) {
  const escape = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [
    columns.map((c) => escape(c.label)).join(","),
    ...rows.map((r) => columns.map((c) => escape(c.value(r))).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A dense, sortable table.
 *
 * Header and body are one table on purpose: two tables side by side drift out
 * of alignment as soon as a cell's content changes width. The header sticks to
 * the top of the scroll container instead.
 */
export function Sheet<T>({ columns, rows, rowKey, sortKey, sortDir, onSort, onRowClick, empty = "Nothing to show." }: {
  columns: SheetColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  onRowClick?: (row: T) => void;
  empty?: string;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-zinc-950">
            {columns.map((c) => {
              const active = c.key === sortKey;
              return (
                <th
                  key={c.key}
                  onClick={c.sortable === false ? undefined : () => onSort(c.key)}
                  className={`border-b border-zinc-800 bg-zinc-950 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider ${c.width ?? ""} ${c.hideBelow ? HIDE_BELOW[c.hideBelow] : ""} ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"} ${
                    c.sortable === false ? "text-zinc-600" : "cursor-pointer select-none text-zinc-500 hover:text-zinc-300"
                  } ${active ? "text-blue-300" : ""}`}
                >
                  {c.label}
                  {active && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-zinc-600">{empty}</td>
            </tr>
          ) : rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`transition-colors ${onRowClick ? "cursor-pointer hover:bg-zinc-800/40" : ""}`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap px-3 py-2.5 align-middle ${c.truncate ? "max-w-[240px] overflow-hidden text-ellipsis" : ""} ${c.width ?? ""} ${c.hideBelow ? HIDE_BELOW[c.hideBelow] : ""} ${
                    c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : "text-left"
                  }`}
                >
                  {c.render ? c.render(row) : <span className="text-zinc-300">{c.value(row) ?? "—"}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Search + CSV, the two controls every one of these sheets needs. */
export function SheetToolbar({ query, onQuery, placeholder, count, total, onExport, children }: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  count: number;
  total?: number;
  onExport?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3">
      <div className="relative min-w-[180px] flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">🔍</span>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
        />
      </div>
      {children}
      <p className="text-xs text-zinc-500">
        <span className="font-bold text-zinc-300">{count}</span> row{count === 1 ? "" : "s"}
        {total !== undefined && <> · <span className="font-bold text-white">{moneyExact(total)}</span></>}
      </p>
      {onExport && (
        <button
          onClick={onExport}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
        >
          ⬇ CSV
        </button>
      )}
    </div>
  );
}

/** Small pill row used for in-sheet filters (All / New / Renewal, and so on). */
export function FilterPills<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            value === o.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1 opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Nudges the eye to the money column without shouting. */
export function AmountCell({ amount, tone = "white" }: { amount: number; tone?: "white" | "blue" | "purple" | "emerald" }) {
  const cls = { white: "text-white", blue: "text-blue-300", purple: "text-purple-300", emerald: "text-emerald-300" }[tone];
  return <span className={`font-bold tabular-nums ${cls}`}>{moneyExact(amount)}</span>;
}

export function TypeBadge({ recurring }: { recurring: boolean }) {
  return recurring ? (
    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">🔁 Renewal</span>
  ) : (
    <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">✨ New</span>
  );
}

/** A totals row that stays put while you scroll a long sheet. */
export function SheetFooterBar({ items }: { items: { label: string; value: string; tone?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-zinc-800 bg-zinc-950/60 px-4 py-3">
      {items.map((i) => (
        <div key={i.label} className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{i.label}</span>
          <span className={`text-sm font-bold tabular-nums ${i.tone ?? "text-white"}`}>{i.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Simple month/day bar chart used under the low-ticket sheet. */
export function MiniBars({ bars, color = "#3b82f6", height = 150 }: {
  bars: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  if (!bars.some((b) => b.value > 0)) return <p className="py-10 text-center text-xs text-zinc-600">No activity in this period.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={bars} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => money(Number(v))} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
        <Bar dataKey="value" name="Revenue" fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
