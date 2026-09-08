"use client";

/**
 * The four Finances tabs: Dashboard, Recent Sales, MRR and Low Ticket.
 *
 * Each tab receives the already-fetched data plus the handlers it needs, so the
 * workspace keeps every fetch and mutation in one place and these stay about
 * how the numbers are read.
 */

import { useMemo, useState } from "react";
import { bucketIndex, fullPeriodLength, pctChange, projectTotal } from "@/lib/revenue-periods";
import { collectedManualPayments } from "@/lib/revenue-metrics";
import {
  AmountCell, BarList, DeltaPill, FilterPills, MiniBars, OfferMix, PaceChart, Panel,
  RevenueMixChart, Sheet, SheetFooterBar, SheetToolbar, StatCard, TypeBadge,
  downloadCsv, money, moneyExact, shortDate, useSheetSort,
  type MixBar, type PacePoint, type SheetColumn,
} from "./finance-ui";
import {
  HIGH_TICKET_FLOOR,
  type ChartBar, type FinanceTab, type ManualPayment, type PreviousSummary,
  type RevenueSummary, type SubData, type Subscription, type Transaction,
} from "./finance-types";

// ─── Shared shape ─────────────────────────────────────────────────────────────

export interface FinanceData {
  period: string;
  /** Unix seconds captured when the data was fetched — the "now" every countdown uses. */
  nowTs: number;
  loading: boolean;
  chart: ChartBar[];
  transactions: Transaction[];
  summary: RevenueSummary | null;
  previous: PreviousSummary | null;
  subData: SubData | null;
  manualPayments: ManualPayment[];
}

export interface FinanceHandlers {
  onOpenTx: (tx: Transaction) => void;
  onOpenManual: (p: ManualPayment) => void;
  onOpenSub: (sub: Subscription) => void;
  onEditSub: (sub: Subscription) => void;
  onToggleSub: (sub: Subscription) => void;
  onDeleteSub: (sub: Subscription) => void;
  onEditManual: (p: ManualPayment) => void;
  onMarkCollected: (p: ManualPayment) => void;
  onLogPromise: () => void;
  onLogCollected: () => void;
  onGoTab: (tab: FinanceTab) => void;
  togglingId: string | null;
  deletingId: string | null;
}

// ─── Derived numbers ──────────────────────────────────────────────────────────

/** A one-off manual payment rendered as if it were a Stripe charge. */
function manualAsTransaction(p: ManualPayment): Transaction {
  return {
    id: `manual:${p.id}`,
    name: p.name,
    email: p.email,
    phone: p.phone,
    offer: p.offer || p.source,
    amount: p.amount,
    date: p.payment_date ?? p.created_at.slice(0, 10),
    status: "succeeded",
    customerId: p.ghl_contact_id,
    createdTs: Math.floor(new Date(`${p.payment_date ?? p.created_at.slice(0, 10)}T12:00:00`).getTime() / 1000),
    isSubscriptionCharge: false,
  };
}

const isManual = (tx: Transaction) => tx.id.startsWith("manual:");

/**
 * Stripe charges and hand-logged payments, merged into one period-scoped list.
 *
 * Both feed every tab: money collected outside Stripe is still money collected,
 * and leaving it out is how a dashboard quietly disagrees with the bank.
 */
export function useCollected(data: FinanceData) {
  const { chart, transactions, manualPayments, previous, summary, period } = data;

  return useMemo(() => {
    const edges = chart.map((b) => b.start ?? 0).concat(chart.length ? [chart[chart.length - 1].end ?? 0] : []);
    const hasEdges = edges.length > 1 && edges.every((e) => e > 0);

    const windowStart = hasEdges ? edges[0] : null;
    const windowEnd = hasEdges ? edges[edges.length - 1] : null;
    const inWindow = (ts: number) =>
      windowStart === null || windowEnd === null || (ts >= windowStart && ts < windowEnd);

    // Manual one-offs marked collected, inside this period.
    const manualRows = collectedManualPayments(manualPayments, null)
      .map(manualAsTransaction)
      .filter((t) => (period === "alltime" ? true : inWindow(t.createdTs)));

    const all = [...transactions, ...manualRows].sort((a, b) => b.createdTs - a.createdTs);
    const oneOff = all.filter((t) => !t.isSubscriptionCharge);
    const lowTicket = oneOff.filter((t) => t.amount < HIGH_TICKET_FLOOR);
    const highTicket = oneOff.filter((t) => t.amount >= HIGH_TICKET_FLOOR);
    const renewals = all.filter((t) => t.isSubscriptionCharge);
    const sum = (rows: Transaction[]) => rows.reduce((s, t) => s + t.amount, 0);

    // Bars: Stripe's split plus manual money dropped into the right bucket.
    const bars: MixBar[] = chart.map((b) => ({
      label: b.label,
      revenue: b.revenue,
      high: b.high ?? 0,
      low: b.low ?? 0,
      recurring: b.recurring ?? 0,
      prev: b.prev ?? null,
    }));
    if (hasEdges) {
      for (const t of manualRows) {
        const i = bucketIndex(edges, t.createdTs);
        if (i < 0) continue;
        bars[i].revenue += t.amount;
        if (t.amount >= HIGH_TICKET_FLOOR) bars[i].high += t.amount;
        else bars[i].low += t.amount;
      }
    }

    // Previous period gets the same treatment so the comparison is like-for-like.
    let prevTotal = previous?.total ?? 0;
    const prevBars = previous ? previous.labels.map(() => 0) : [];
    if (previous) {
      for (let i = 0; i < bars.length; i++) {
        if (i < prevBars.length) prevBars[i] = bars[i].prev ?? 0;
      }
      for (const p of collectedManualPayments(manualPayments, null)) {
        const ts = manualAsTransaction(p).createdTs;
        const i = bucketIndex(previous.edges, ts);
        if (i < 0) continue;
        prevBars[i] += p.amount;
        prevTotal += p.amount;
        if (i < bars.length) bars[i].prev = (bars[i].prev ?? 0) + p.amount;
      }
    }

    const total = (summary?.total ?? 0) + sum(manualRows);

    return {
      all, oneOff, lowTicket, highTicket, renewals, bars, prevBars, prevTotal,
      total,
      lowTotal: sum(lowTicket),
      highTotal: sum(highTicket),
      renewalTotal: sum(renewals),
      manualRows,
    };
  }, [chart, transactions, manualPayments, previous, summary, period]);
}

/** Cumulative curves — this period against the same stretch of the last one. */
function buildPace(bars: MixBar[], prevBars: number[], period: string, nowTs: number): { points: PacePoint[]; projection: number | null } {
  let run = 0;
  let prevRun = 0;
  const points: PacePoint[] = bars.map((b, i) => {
    run += b.revenue;
    prevRun += prevBars[i] ?? 0;
    return {
      label: b.label,
      cumulative: Math.round(run),
      prevCumulative: prevBars.length ? Math.round(prevRun) : null,
      projected: null,
    };
  });

  const full = fullPeriodLength(period, new Date(nowTs * 1000));
  const projection = projectTotal(run, bars.length, full);
  if (projection !== null && points.length) {
    // Draw the projection as a straight run from today's total out to the end.
    const perBucket = run / bars.length;
    points[points.length - 1].projected = Math.round(run);
    // The tail is the rest of the period: only the projection is drawn there.
    // `null` ends the collected-so-far area cleanly instead of dropping it to $0.
    for (let i = bars.length; i < full; i++) {
      points.push({
        label: "",
        cumulative: null,
        prevCumulative: null,
        projected: Math.round(run + perBucket * (i - bars.length + 1)),
      });
    }
  }
  return { points, projection };
}

const PERIOD_NOUN: Record<string, string> = {
  mtd: "month", wtd: "week", qtd: "quarter", ytd: "year", alltime: "all time",
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function DashboardTab({ data, handlers }: { data: FinanceData; handlers: FinanceHandlers }) {
  const c = useCollected(data);
  const { period, subData, manualPayments, previous, nowTs } = data;
  const noun = PERIOD_NOUN[period] ?? "period";

  const manualActive = manualPayments.filter((p) => p.payment_type === "recurring" && p.status === "active");
  const manualMrr = manualActive.reduce((s, p) => s + p.amount, 0);
  const totalMrr = (subData?.mrr ?? 0) + manualMrr;

  const promised = manualPayments
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => (a.payment_date ?? "").localeCompare(b.payment_date ?? ""));
  const promisedTotal = promised.reduce((s, p) => s + p.amount, 0);

  const { points, projection } = useMemo(
    () => buildPace(c.bars, c.prevBars, period, nowTs),
    [c.bars, c.prevBars, period, nowTs],
  );

  const newSalesTotal = c.highTotal + c.lowTotal;
  const prevNewSales = (previous?.highTicket ?? 0) + (previous?.lowTicket ?? 0);

  // Which offers carried the period.
  const offerSlices = useMemo(() => {
    // Stripe descriptions are typed by hand, so "7FCEO" and "7fceo" are the same
    // product; group case-insensitively and show the spelling used most.
    const byOffer = new Map<string, { value: number; labels: Map<string, number> }>();
    for (const t of c.oneOff) {
      const key = t.offer.trim().toLowerCase();
      const entry = byOffer.get(key) ?? { value: 0, labels: new Map<string, number>() };
      entry.value += t.amount;
      entry.labels.set(t.offer, (entry.labels.get(t.offer) ?? 0) + 1);
      byOffer.set(key, entry);
    }
    return [...byOffer.values()]
      .map((e) => ({
        name: [...e.labels.entries()].sort((a, b) => b[1] - a[1])[0][0],
        value: Math.round(e.value),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [c.oneOff]);

  const topCustomers = useMemo(() => {
    const byName = new Map<string, number>();
    for (const t of c.all) byName.set(t.name, (byName.get(t.name) ?? 0) + t.amount);
    return [...byName.entries()]
      .map(([label, value]) => ({ label, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [c.all]);

  const biggest = useMemo(() => [...c.oneOff].sort((a, b) => b.amount - a.amount).slice(0, 6), [c.oneOff]);

  const bestBar = useMemo(
    () => c.bars.reduce<MixBar | null>((best, b) => (!best || b.revenue > best.revenue ? b : best), null),
    [c.bars],
  );
  const avgSale = c.oneOff.length ? newSalesTotal / c.oneOff.length : 0;

  // Renewals coming up, grouped into the next four weeks.
  const renewalWeeks = useMemo(() => {
    const active = (subData?.subscriptions ?? []).filter((s) => s.status === "active" && s.nextBillTs);
    const now = nowTs;
    const weeks = [0, 1, 2, 3].map((w) => ({ label: `Week ${w + 1}`, value: 0, hint: "" }));
    for (const s of active) {
      const days = ((s.nextBillTs ?? 0) - now) / 86400;
      if (days < 0 || days > 28) continue;
      const w = Math.min(3, Math.floor(days / 7));
      weeks[w].value += s.monthlyAmount;
    }
    const today = new Date(nowTs * 1000);
    return weeks.map((w, i) => {
      const from = new Date(today.getTime() + i * 7 * 86400000);
      const to = new Date(today.getTime() + ((i + 1) * 7 - 1) * 86400000);
      return { ...w, hint: `${shortDate(from.toISOString().slice(0, 10))} – ${shortDate(to.toISOString().slice(0, 10))}` };
    });
  }, [subData, nowTs]);

  const [mixMode, setMixMode] = useState<"stack" | "compare">("stack");

  if (data.loading && !c.all.length) return <LoadingBlock />;

  return (
    <div className="space-y-4">
      {/* ── Hero: how much, versus what, headed where ─────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950">
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,300px)_1fr] lg:p-6">
          <div className="flex flex-col justify-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Cash collected · this {noun}
            </p>
            <p className="mt-1 text-[42px] font-extrabold leading-none tracking-tight text-white tabular-nums lg:text-5xl">
              {moneyExact(Math.round(c.total))}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DeltaPill pct={pctChange(c.total, c.prevTotal)} suffix={`vs last ${noun}`} size="lg" />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-zinc-800 pt-4">
              <HeroStat label="On pace for" value={projection === null ? "—" : money(projection)}
                hint={projection === null ? "period complete" : `full ${noun}`} tone="text-blue-300" />
              <HeroStat label={`Last ${noun}`} value={money(c.prevTotal)}
                hint={previous ? "same stretch" : "no comparison"} tone="text-zinc-300" />
              <HeroStat label="Avg sale" value={c.oneOff.length ? money(avgSale) : "—"}
                hint={`${c.oneOff.length} new sale${c.oneOff.length === 1 ? "" : "s"}`} tone="text-purple-300" />
              <HeroStat label="Best day" value={bestBar && bestBar.revenue > 0 ? money(bestBar.revenue) : "—"}
                hint={bestBar && bestBar.revenue > 0 ? bestBar.label : "nothing yet"} tone="text-emerald-300" />
            </dl>
          </div>

          <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-400">Pace against last {noun}</p>
              <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                <Legend color="#3b82f6" label="This period" />
                <Legend color="#52525b" label={`Last ${noun}`} dashed />
                {projection !== null && <Legend color="#a1a1aa" label="Projected" dashed />}
              </div>
            </div>
            <PaceChart points={points} height={230} />
          </div>
        </div>
      </section>

      {/* ── The four numbers that matter ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="New sales" value={money(newSalesTotal)} accent="text-purple-300"
          delta={pctChange(newSalesTotal, prevNewSales)}
          sub={`${c.oneOff.length} purchase${c.oneOff.length === 1 ? "" : "s"} · one-off money only`}
          spark={{ data: c.bars.map((b) => b.high + b.low), color: "#a855f7" }}
          onClick={() => handlers.onGoTab("sales")}
        />
        <StatCard
          label="MRR" value={money(totalMrr)} accent="text-emerald-300"
          sub={<>{(subData?.totalActive ?? 0) + manualActive.length} active · {money(totalMrr * 12)} a year</>}
          spark={{ data: c.bars.map((b) => b.recurring), color: "#10b981" }}
          onClick={() => handlers.onGoTab("mrr")}
        />
        <StatCard
          label="Low ticket" value={money(c.lowTotal)} accent="text-blue-300"
          delta={pctChange(c.lowTotal, previous?.lowTicket ?? 0)}
          sub={`${c.lowTicket.length} purchase${c.lowTicket.length === 1 ? "" : "s"} under ${money(HIGH_TICKET_FLOOR)}`}
          spark={{ data: c.bars.map((b) => b.low), color: "#3b82f6" }}
          onClick={() => handlers.onGoTab("low")}
        />
        <StatCard
          label="Promised" value={money(promisedTotal)} accent="text-amber-300"
          sub={promised.length ? `${promised.length} outstanding · not collected yet` : "nothing outstanding"}
          onClick={handlers.onLogPromise}
        />
      </div>

      {/* ── Where the money came from ─────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Revenue mix" emoji="📊"
          subtitle={`High ticket, low ticket and recurring, ${period === "mtd" || period === "wtd" ? "day by day" : "period by period"}`}
          right={
            <FilterPills
              value={mixMode}
              onChange={setMixMode}
              options={[{ key: "stack" as const, label: "Mix" }, { key: "compare" as const, label: `vs last ${noun}` }]}
            />
          }
        >
          <div className="px-2 pb-3 pt-4">
            <RevenueMixChart bars={c.bars} showPrev={mixMode === "compare"} />
            <div className="flex flex-wrap items-center gap-4 px-3 pt-2 text-[10px] text-zinc-500">
              <Legend color="#a855f7" label={`High ticket ${money(c.highTotal)}`} />
              <Legend color="#3b82f6" label={`Low ticket ${money(c.lowTotal)}`} />
              <Legend color="#10b981" label={`Recurring ${money(c.renewalTotal)}`} />
              {mixMode === "compare" && <Legend color="#f59e0b" label={`Last ${noun}`} dashed />}
            </div>
          </div>
        </Panel>

        <Panel title="Offer mix" emoji="🎯" subtitle={`${c.oneOff.length} new sales this ${noun}`}>
          <div className="p-4"><OfferMix slices={offerSlices} /></div>
        </Panel>
      </div>

      {/* ── Who and what ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Biggest sales" emoji="🏆" subtitle={`Top new sales this ${noun}`}
          right={<TabLink onClick={() => handlers.onGoTab("sales")}>All sales →</TabLink>}
        >
          {biggest.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-zinc-600">No sales in this period yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {biggest.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => (isManual(t) ? undefined : handlers.onOpenTx(t))}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800/40"
                  >
                    <span className="w-14 flex-shrink-0 text-[11px] text-zinc-500">{shortDate(t.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{t.name}</span>
                    <span className="hidden flex-shrink-0 truncate text-[11px] text-zinc-600 sm:block sm:max-w-[140px]">{t.offer}</span>
                    <AmountCell amount={t.amount} tone={t.amount >= HIGH_TICKET_FLOOR ? "purple" : "blue"} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top customers" emoji="👑" subtitle={`Most collected this ${noun}`}>
          <div className="p-4"><BarList rows={topCustomers} color="#8b5cf6" /></div>
        </Panel>
      </div>

      {/* ── Money on the way ──────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Promised payments" emoji="📅"
          subtitle={promised.length ? `${money(promisedTotal)} pending` : "No outstanding promises"}
          right={
            <button onClick={handlers.onLogPromise}
              className="rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/25">
              + Log promise
            </button>
          }
        >
          {promised.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-zinc-600">Nothing promised. Log one when a client commits to a date.</p>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {promised.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => handlers.onOpenManual(p)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                    <p className="truncate text-[11px] text-zinc-500">{p.offer || p.source}{p.payment_date && ` · due ${shortDate(p.payment_date)}`}</p>
                  </button>
                  <span className="font-bold tabular-nums text-amber-300">{moneyExact(p.amount)}</span>
                  <button
                    onClick={() => handlers.onMarkCollected(p)}
                    className="flex-shrink-0 rounded-lg border border-emerald-600/30 bg-emerald-600/15 px-2 py-1 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-600/30"
                  >
                    ✓ Collected
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Renewals ahead" emoji="🔁"
          subtitle={`${money(renewalWeeks.reduce((s, w) => s + w.value, 0))} billing over the next 4 weeks`}
          right={<TabLink onClick={() => handlers.onGoTab("mrr")}>All subscriptions →</TabLink>}
        >
          <div className="p-4"><BarList rows={renewalWeeks} color="#10b981" /></div>
        </Panel>
      </div>
    </div>
  );
}

function HeroStat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 text-lg font-bold tabular-nums leading-none ${tone}`}>{value}</dd>
      <p className="mt-0.5 text-[10px] text-zinc-600">{hint}</p>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-4 rounded-full" style={{ background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : color }} />
      {label}
    </span>
  );
}

function TabLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-xs font-semibold text-zinc-500 transition-colors hover:text-blue-300">
      {children}
    </button>
  );
}

function LoadingBlock() {
  return (
    <div className="space-y-4">
      <div className="h-64 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60" />
    </div>
  );
}

// ─── Recent Sales ─────────────────────────────────────────────────────────────

type SalesFilter = "all" | "new" | "renewal" | "high" | "low";

export function RecentSalesTab({ data, handlers }: { data: FinanceData; handlers: FinanceHandlers }) {
  const c = useCollected(data);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SalesFilter>("all");

  const columns: SheetColumn<Transaction>[] = useMemo(() => [
    { key: "date", label: "Date", width: "w-24", value: (t) => t.date,
      render: (t) => <span className="whitespace-nowrap text-zinc-400">{shortDate(t.date)}</span> },
    { key: "name", label: "Customer", truncate: true, value: (t) => t.name,
      render: (t) => <span className="font-semibold text-white">{t.name}</span> },
    { key: "email", label: "Email", hideBelow: "xl", truncate: true, value: (t) => t.email,
      render: (t) => <span className="text-zinc-500">{t.email ?? "—"}</span> },
    { key: "offer", label: "Offer", truncate: true, value: (t) => t.offer,
      render: (t) => <span className="text-zinc-400">{t.offer}</span> },
    { key: "type", label: "Type", width: "w-28", value: (t) => (t.isSubscriptionCharge ? "Renewal" : "New"),
      render: (t) => <TypeBadge recurring={!!t.isSubscriptionCharge} /> },
    { key: "source", label: "Source", width: "w-24", hideBelow: "2xl", value: (t) => (isManual(t) ? "Manual" : "Stripe"),
      render: (t) => <span className="text-[11px] text-zinc-500">{isManual(t) ? "🏦 Manual" : "💳 Stripe"}</span> },
    { key: "amount", label: "Amount", align: "right", width: "w-32", value: (t) => t.amount,
      render: (t) => <AmountCell amount={t.amount} tone={t.amount >= HIGH_TICKET_FLOOR ? "purple" : "blue"} /> },
    { key: "receipt", label: "", width: "w-12", align: "center", sortable: false, value: () => "",
      render: (t) => t.receiptUrl
        ? <a href={t.receiptUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="text-zinc-600 transition-colors hover:text-blue-300" title="Stripe receipt">🧾</a>
        : <span className="text-zinc-800">—</span> },
  ], []);

  const { sortKey, sortDir, toggle, sort } = useSheetSort(columns, "date", "desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return c.all.filter((t) => {
      if (filter === "new" && t.isSubscriptionCharge) return false;
      if (filter === "renewal" && !t.isSubscriptionCharge) return false;
      if (filter === "high" && (t.amount < HIGH_TICKET_FLOOR || t.isSubscriptionCharge)) return false;
      if (filter === "low" && (t.amount >= HIGH_TICKET_FLOOR || t.isSubscriptionCharge)) return false;
      if (!q) return true;
      return `${t.name} ${t.email ?? ""} ${t.offer}`.toLowerCase().includes(q);
    });
  }, [c.all, query, filter]);

  const rows = sort(filtered);
  const total = rows.reduce((s, t) => s + t.amount, 0);

  return (
    <Panel
      title="Recent sales" emoji="🧾"
      subtitle="Every payment collected in this period — Stripe and hand-logged, newest first"
      right={
        <button onClick={handlers.onLogCollected}
          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500">
          + Log collected
        </button>
      }
    >
      <SheetToolbar
        query={query} onQuery={setQuery} placeholder="Search name, email or offer…"
        count={rows.length} total={total}
        onExport={() => downloadCsv(`recent-sales-${data.period}.csv`, columns, rows)}
      >
        <FilterPills
          value={filter} onChange={setFilter}
          options={[
            { key: "all", label: "All", count: c.all.length },
            { key: "new", label: "New", count: c.oneOff.length },
            { key: "renewal", label: "Renewals", count: c.renewals.length },
            { key: "high", label: "High", count: c.highTicket.length },
            { key: "low", label: "Low", count: c.lowTicket.length },
          ]}
        />
      </SheetToolbar>
      <div className="max-h-[calc(100vh-360px)] overflow-y-auto">
        <Sheet
          columns={columns} rows={rows} rowKey={(t) => t.id}
          sortKey={sortKey} sortDir={sortDir} onSort={toggle}
          onRowClick={(t) => (isManual(t) ? undefined : handlers.onOpenTx(t))}
          empty={data.loading ? "Loading…" : "No payments match this filter."}
        />
      </div>
      <SheetFooterBar items={[
        { label: "Shown", value: `${rows.length}` },
        { label: "Total", value: moneyExact(total) },
        { label: "New sales", value: moneyExact(c.highTotal + c.lowTotal), tone: "text-purple-300" },
        { label: "Renewals", value: moneyExact(c.renewalTotal), tone: "text-emerald-300" },
        { label: "Average", value: rows.length ? moneyExact(total / rows.length) : "—", tone: "text-zinc-300" },
      ]} />
    </Panel>
  );
}

// ─── MRR ──────────────────────────────────────────────────────────────────────

interface MrrRow {
  id: string;
  name: string;
  email: string | null;
  offer: string;
  monthly: number;
  interval: string;
  status: string;
  started: string;
  nextBill: string;
  nextBillTs: number | null;
  source: "Stripe" | "Manual";
  sub?: Subscription;
  manual?: ManualPayment;
}

export function MrrTab({ data, handlers }: { data: FinanceData; handlers: FinanceHandlers }) {
  const { subData, manualPayments, nowTs } = data;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "paused" | "all">("active");
  const subsPending = subData === null;

  const rows: MrrRow[] = useMemo(() => {
    const stripeRows: MrrRow[] = (subData?.subscriptions ?? []).map((s) => ({
      id: s.id, name: s.name, email: s.email, offer: s.offer,
      monthly: s.monthlyAmount, interval: s.interval, status: s.status,
      started: s.startDate, nextBill: s.nextBill, nextBillTs: s.nextBillTs,
      source: "Stripe", sub: s,
    }));
    const manualRows: MrrRow[] = manualPayments
      .filter((p) => p.payment_type === "recurring" && p.status !== "cancelled")
      .map((p) => ({
        id: `manual:${p.id}`, name: p.name, email: p.email, offer: p.offer || p.source,
        monthly: p.amount, interval: p.interval_type ?? "month", status: p.status,
        started: p.start_date ?? p.created_at.slice(0, 10),
        nextBill: p.next_bill_date ?? "—",
        nextBillTs: p.next_bill_date ? Math.floor(new Date(`${p.next_bill_date}T12:00:00`).getTime() / 1000) : null,
        source: "Manual", manual: p,
      }));
    return [...stripeRows, ...manualRows];
  }, [subData, manualPayments]);

  const active = useMemo(() => rows.filter((r) => r.status === "active"), [rows]);
  const paused = useMemo(() => rows.filter((r) => r.status === "paused"), [rows]);
  const mrr = active.reduce((s, r) => s + r.monthly, 0);
  const pausedMrr = paused.reduce((s, r) => s + r.monthly, 0);

  const columns: SheetColumn<MrrRow>[] = useMemo(() => [
    { key: "name", label: "Customer", value: (r) => r.name,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{r.name}</p>
          <p className="truncate text-[11px] text-zinc-600 lg:hidden">{r.email ?? r.offer}</p>
        </div>
      ) },
    { key: "email", label: "Email", hideBelow: "xl", truncate: true, value: (r) => r.email,
      render: (r) => <span className="text-zinc-500">{r.email ?? "—"}</span> },
    { key: "offer", label: "Offer", truncate: true, value: (r) => r.offer,
      render: (r) => <span className="text-zinc-400">{r.offer}</span> },
    { key: "monthly", label: "Monthly", align: "right", width: "w-28", value: (r) => r.monthly,
      render: (r) => <AmountCell amount={r.monthly} tone="emerald" /> },
    { key: "annual", label: "Annual", align: "right", width: "w-28", hideBelow: "2xl", value: (r) => r.monthly * 12,
      render: (r) => <span className="tabular-nums text-zinc-500">{moneyExact(r.monthly * 12)}</span> },
    { key: "started", label: "Started", width: "w-28", hideBelow: "2xl", value: (r) => r.started,
      render: (r) => <span className="whitespace-nowrap text-zinc-500">{r.started}</span> },
    { key: "next", label: "Next bill", width: "w-32", value: (r) => r.nextBillTs ?? 0,
      render: (r) => <NextBillCell row={r} nowTs={nowTs} /> },
    { key: "status", label: "Status", width: "w-24", value: (r) => r.status,
      render: (r) => (
        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
          r.status === "active"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
        }`}>
          {r.status === "active" ? "Active" : "Paused"}
        </span>
      ) },
    { key: "source", label: "Via", width: "w-20", hideBelow: "2xl", value: (r) => r.source,
      render: (r) => <span className="text-[11px] text-zinc-500">{r.source === "Stripe" ? "💳 Stripe" : "🏦 Manual"}</span> },
    { key: "actions", label: "", width: "w-32", align: "right", sortable: false, value: () => "",
      render: (r) => r.sub ? (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconBtn title="Edit amount or billing date" onClick={() => handlers.onEditSub(r.sub!)}>✏️</IconBtn>
          <IconBtn title={r.status === "active" ? "Pause" : "Resume"} busy={handlers.togglingId === r.sub.id}
            onClick={() => handlers.onToggleSub(r.sub!)}>{r.status === "active" ? "⏸" : "▶️"}</IconBtn>
          <IconBtn title="Cancel subscription" danger busy={handlers.deletingId === r.sub.id}
            onClick={() => handlers.onDeleteSub(r.sub!)}>🗑</IconBtn>
        </div>
      ) : r.manual ? (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconBtn title="Edit payment" onClick={() => handlers.onEditManual(r.manual!)}>✏️</IconBtn>
        </div>
      ) : null },
  ], [handlers, nowTs]);

  const { sortKey, sortDir, toggle, sort } = useSheetSort(columns, "monthly", "desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return `${r.name} ${r.email ?? ""} ${r.offer}`.toLowerCase().includes(q);
    });
  }, [rows, query, status]);

  const shown = sort(filtered);
  const shownMrr = shown.reduce((s, r) => s + r.monthly, 0);

  // What bills in each of the next four weeks, so cash timing is visible.
  const upcoming = useMemo(() => {
    const now = nowTs;
    const weeks = [0, 1, 2, 3].map((w) => ({ label: `Week ${w + 1}`, value: 0, hint: "" }));
    for (const r of active) {
      if (!r.nextBillTs) continue;
      const days = (r.nextBillTs - now) / 86400;
      if (days < 0 || days > 28) continue;
      weeks[Math.min(3, Math.floor(days / 7))].value += r.monthly;
    }
    const today = new Date(nowTs * 1000);
    return weeks.map((w, i) => ({
      ...w,
      hint: `${shortDate(new Date(today.getTime() + i * 7 * 86400000).toISOString().slice(0, 10))} – ${shortDate(new Date(today.getTime() + ((i + 1) * 7 - 1) * 86400000).toISOString().slice(0, 10))}`,
    }));
  }, [active, nowTs]);

  const bySize = useMemo(() => {
    const tiers = [
      { label: "Under $250/mo", min: 0, max: 250 },
      { label: "$250 – $999/mo", min: 250, max: 1000 },
      { label: "$1K – $2.5K/mo", min: 1000, max: 2500 },
      { label: "$2.5K+/mo", min: 2500, max: Infinity },
    ];
    return tiers.map((t) => ({
      label: t.label,
      value: active.filter((r) => r.monthly >= t.min && r.monthly < t.max).reduce((s, r) => s + r.monthly, 0),
      hint: `${active.filter((r) => r.monthly >= t.min && r.monthly < t.max).length} subscriptions`,
    }));
  }, [active]);

  if (subsPending) return <LoadingBlock />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="MRR" value={moneyExact(mrr)} accent="text-emerald-300"
          sub={`${active.length} active subscription${active.length === 1 ? "" : "s"}`} />
        <StatCard label="Annual run rate" value={money(mrr * 12)} accent="text-white"
          sub="MRR × 12, at today's book" />
        <StatCard label="Average subscription" value={active.length ? moneyExact(mrr / active.length) : "—"}
          accent="text-blue-300" sub="per active customer, per month" />
        <StatCard label="Paused" value={moneyExact(pausedMrr)} accent="text-amber-300" goodWhen="down"
          sub={paused.length ? `${paused.length} paused · resume to recover` : "nothing paused"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Billing over the next 4 weeks" emoji="📆"
          subtitle={`${money(upcoming.reduce((s, w) => s + w.value, 0))} expected`}>
          <div className="p-4"><BarList rows={upcoming} color="#10b981" /></div>
        </Panel>
        <Panel title="MRR by subscription size" emoji="🧱" subtitle="Where the recurring money is concentrated">
          <div className="p-4"><BarList rows={bySize} color="#3b82f6" /></div>
        </Panel>
      </div>

      <Panel title="Subscriptions" emoji="🔁" subtitle="Every recurring payment, Stripe and hand-logged">
        <SheetToolbar
          query={query} onQuery={setQuery} placeholder="Search a subscriber…"
          count={shown.length} total={shownMrr}
          onExport={() => downloadCsv("mrr-subscriptions.csv", columns, shown)}
        >
          <FilterPills
            value={status} onChange={setStatus}
            options={[
              { key: "active", label: "Active", count: active.length },
              { key: "paused", label: "Paused", count: paused.length },
              { key: "all", label: "All", count: rows.length },
            ]}
          />
        </SheetToolbar>
        <div className="max-h-[calc(100vh-420px)] overflow-y-auto">
          <Sheet
            columns={columns} rows={shown} rowKey={(r) => r.id}
            sortKey={sortKey} sortDir={sortDir} onSort={toggle}
            onRowClick={(r) => (r.sub ? handlers.onOpenSub(r.sub) : r.manual ? handlers.onOpenManual(r.manual) : undefined)}
            empty={data.loading ? "Loading…" : "No subscriptions match this filter."}
          />
        </div>
        <SheetFooterBar items={[
          { label: "Shown", value: `${shown.length}` },
          { label: "Monthly", value: moneyExact(shownMrr), tone: "text-emerald-300" },
          { label: "Annual", value: moneyExact(shownMrr * 12) },
        ]} />
      </Panel>
    </div>
  );
}

function NextBillCell({ row, nowTs }: { row: MrrRow; nowTs: number }) {
  if (!row.nextBillTs) return <span className="text-zinc-600">—</span>;
  const days = Math.round((row.nextBillTs - nowTs) / 86400);
  const tone = days <= 3 ? "text-amber-300" : days <= 7 ? "text-blue-300" : "text-zinc-400";
  return (
    <span className="whitespace-nowrap">
      <span className={tone}>{row.nextBill}</span>
      {row.status === "active" && days >= 0 && (
        <span className="ml-1 text-[10px] text-zinc-600">{days === 0 ? "today" : `${days}d`}</span>
      )}
    </span>
  );
}

function IconBtn({ children, title, onClick, danger, busy }: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean; busy?: boolean;
}) {
  return (
    <button
      title={title} onClick={onClick} disabled={busy}
      className={`rounded-lg border px-1.5 py-1 text-[11px] transition-colors disabled:opacity-40 ${
        danger
          ? "border-rose-600/30 bg-rose-600/10 hover:bg-rose-600/25"
          : "border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700"
      }`}
    >
      {busy ? "…" : children}
    </button>
  );
}

// ─── Low Ticket ───────────────────────────────────────────────────────────────

export function LowTicketTab({ data, handlers }: { data: FinanceData; handlers: FinanceHandlers }) {
  const c = useCollected(data);
  const [query, setQuery] = useState("");
  const noun = PERIOD_NOUN[data.period] ?? "period";

  const columns: SheetColumn<Transaction>[] = useMemo(() => [
    { key: "date", label: "Date", width: "w-24", value: (t) => t.date,
      render: (t) => <span className="whitespace-nowrap text-zinc-400">{shortDate(t.date)}</span> },
    { key: "name", label: "Customer", truncate: true, value: (t) => t.name,
      render: (t) => <span className="font-semibold text-white">{t.name}</span> },
    { key: "email", label: "Email", hideBelow: "xl", truncate: true, value: (t) => t.email,
      render: (t) => <span className="text-zinc-500">{t.email ?? "—"}</span> },
    { key: "offer", label: "Product", truncate: true, value: (t) => t.offer,
      render: (t) => <span className="text-zinc-400">{t.offer}</span> },
    { key: "source", label: "Source", width: "w-24", hideBelow: "2xl", value: (t) => (isManual(t) ? "Manual" : "Stripe"),
      render: (t) => <span className="text-[11px] text-zinc-500">{isManual(t) ? "🏦 Manual" : "💳 Stripe"}</span> },
    { key: "amount", label: "Amount", align: "right", width: "w-28", value: (t) => t.amount,
      render: (t) => <AmountCell amount={t.amount} tone="blue" /> },
    { key: "receipt", label: "", width: "w-12", align: "center", sortable: false, value: () => "",
      render: (t) => t.receiptUrl
        ? <a href={t.receiptUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="text-zinc-600 transition-colors hover:text-blue-300" title="Stripe receipt">🧾</a>
        : <span className="text-zinc-800">—</span> },
  ], []);

  const { sortKey, sortDir, toggle, sort } = useSheetSort(columns, "date", "desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return c.lowTicket;
    return c.lowTicket.filter((t) => `${t.name} ${t.email ?? ""} ${t.offer}`.toLowerCase().includes(q));
  }, [c.lowTicket, query]);

  const rows = sort(filtered);
  const total = rows.reduce((s, t) => s + t.amount, 0);
  const buyers = new Set(rows.map((t) => t.customerId ?? t.email ?? t.id)).size;

  const products = useMemo(() => {
    const byOffer = new Map<string, { value: number; n: number }>();
    for (const t of c.lowTicket) {
      const cur = byOffer.get(t.offer) ?? { value: 0, n: 0 };
      byOffer.set(t.offer, { value: cur.value + t.amount, n: cur.n + 1 });
    }
    return [...byOffer.entries()]
      .map(([label, v]) => ({ label, value: Math.round(v.value), hint: `${v.n} purchase${v.n === 1 ? "" : "s"}` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [c.lowTicket]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Low-ticket revenue" value={moneyExact(c.lowTotal)} accent="text-blue-300"
          delta={pctChange(c.lowTotal, data.previous?.lowTicket ?? 0)}
          sub={`everything under ${money(HIGH_TICKET_FLOOR)} this ${noun}`}
          spark={{ data: c.bars.map((b) => b.low), color: "#3b82f6" }} />
        <StatCard label="Purchases" value={String(c.lowTicket.length)} accent="text-white"
          sub={`${buyers} distinct buyer${buyers === 1 ? "" : "s"}`} />
        <StatCard label="Average order" value={c.lowTicket.length ? moneyExact(c.lowTotal / c.lowTicket.length) : "—"}
          accent="text-purple-300" sub="per low-ticket purchase" />
        <StatCard label="Share of new sales"
          value={c.highTotal + c.lowTotal > 0 ? `${Math.round((c.lowTotal / (c.highTotal + c.lowTotal)) * 100)}%` : "—"}
          accent="text-emerald-300" sub="of one-off revenue this period" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Low-ticket over time" emoji="📈" subtitle={`Under ${money(HIGH_TICKET_FLOOR)}, ${data.period === "mtd" || data.period === "wtd" ? "day by day" : "period by period"}`}>
          <div className="px-2 pb-3 pt-4">
            <MiniBars bars={c.bars.map((b) => ({ label: b.label, value: b.low }))} height={180} />
          </div>
        </Panel>
        <Panel title="Best sellers" emoji="🎟" subtitle="Low-ticket products by revenue">
          <div className="p-4"><BarList rows={products} /></div>
        </Panel>
      </div>

      <Panel title="Low-ticket purchases" emoji="🎟"
        subtitle={`Every one-off purchase under ${money(HIGH_TICKET_FLOOR)} — renewals excluded`}
        right={
          <button onClick={handlers.onLogCollected}
            className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500">
            + Log collected
          </button>
        }
      >
        <SheetToolbar
          query={query} onQuery={setQuery} placeholder="Search a buyer or product…"
          count={rows.length} total={total}
          onExport={() => downloadCsv(`low-ticket-${data.period}.csv`, columns, rows)}
        />
        <div className="max-h-[calc(100vh-420px)] overflow-y-auto">
          <Sheet
            columns={columns} rows={rows} rowKey={(t) => t.id}
            sortKey={sortKey} sortDir={sortDir} onSort={toggle}
            onRowClick={(t) => (isManual(t) ? undefined : handlers.onOpenTx(t))}
            empty={data.loading ? "Loading…" : `No low-ticket purchases this ${noun}.`}
          />
        </div>
        <SheetFooterBar items={[
          { label: "Shown", value: `${rows.length}` },
          { label: "Total", value: moneyExact(total), tone: "text-blue-300" },
          { label: "Average", value: rows.length ? moneyExact(total / rows.length) : "—" },
        ]} />
      </Panel>
    </div>
  );
}
