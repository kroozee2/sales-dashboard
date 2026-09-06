"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { smsHref, waHref } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeData {
  label: string; prevLabel: string;
  revenue: number; revenuePrev: number; changePct: number;
  salesCount: number; callsBooked: number; closeRate: number; newLeads: number;
  series: { label: string; cur: number | null; prev: number }[];
  recent: { name: string; amount: number; kind: string; offer: string | null; date: string }[];
  recurring: { name: string; amount: number; interval: string; next_bill_date: string | null }[];
  mrr: number;
  upcomingCalls: { id: string; name: string; call_date: string | null; call_type: string | null }[];
  recentCalls: { id: string; name: string; call_date: string; result: string | null; deal_amount: number | null }[];
}
interface TwoStepPost { id: string; platform: string; post_title: string | null; post_url: string; commenter_count: number; status: string; resources: { title: string } | null }
interface LeadCounts { total: number; hot: number; call: number; month: number }
interface QueueLead {
  id: string; full_name: string | null; phone: string | null; email: string | null;
  prospect_stage: string | null; ghl_url: string | null; hoursSince: number;
}
interface FollowupCall {
  id: string; name: string; phone: string | null; ghl_url: string | null;
  offer: string | null; deal_amount: number | null; follow_up_date: string | null; overdueDays: number | null; orphaned: boolean;
}
interface MessageLead {
  id: string; full_name: string | null; phone: string | null; email: string | null;
  prospect_stage: string | null; ghl_url: string | null; hoursSince: number; touches: number;
}
interface Subscription {
  id: string; name: string; offer: string; amount: number; monthlyAmount: number;
  interval: string; status: string; nextBill: string; nextBillTs: number | null;
}
interface SubData { subscriptions: Subscription[]; mrr: number; totalActive: number }
interface Goal {
  id: string; name: string; emoji: string; goal_type: string; category: string;
  target_amount: number; current_amount: number; period: string; target_date: string | null;
  source: string | null; color: string;
}
interface TodayData {
  queue: QueueLead[];
  messageList: MessageLead[];
  followupsDue: FollowupCall[];
  promisesDue: { id: string; name: string; amount: number; payment_date: string | null; phone: string | null; ghl_url: string | null }[];
  scoreboard: { outreachesToday: number; outreachTarget: number; bookedUpcoming: number; bookTarget: number };
}

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
];

const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toLocaleString()}`;

const WIDGETS = [
  { id: "revenue", title: "Revenue" },
  { id: "cashflow", title: "Cash Collected (Stripe)" },
  { id: "goals", title: "Goals" },
  { id: "kpis", title: "Sales Snapshot" },
  { id: "recurring", title: "Recurring / Subscriptions" },
  { id: "salescalls", title: "Sales Calls" },
  { id: "pipeline", title: "Leads Pipeline" },
  { id: "twostep", title: "Two-Step to Respond" },
  { id: "leadsToMessage", title: "Leads to Message" },
  { id: "followups", title: "Follow-Ups Due" },
  { id: "recent", title: "Recent Sales" },
  { id: "promises", title: "Promised Payments" },
];
const DEFAULT_ORDER = WIDGETS.map((w) => w.id);
const LS_KEY = "home-layout-v1";

// ─── Small pieces ─────────────────────────────────────────────────────────────

function timeAgo(hours: number) {
  if (hours > 24 * 90) return "never";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function QuickContacts({ phone, ghlUrl, body }: { phone: string | null; ghlUrl: string | null; body?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {ghlUrl && <a href={ghlUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="px-2 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-300 text-xs transition-colors">⚡</a>}
      {phone && (
        <>
          <a href={smsHref(phone, body)} onClick={(e) => e.stopPropagation()} className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs transition-colors">💬</a>
          <a href={waHref(phone, body)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="px-2 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-300 text-xs transition-colors">📱</a>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [period, setPeriod] = useState("month");
  const [home, setHome] = useState<HomeData | null>(null);
  const [today, setToday] = useState<TodayData | null>(null);
  const [customize, setCustomize] = useState(false);
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [hidden, setHidden] = useState<string[]>([]);
  const [twostep, setTwostep] = useState<TwoStepPost[]>([]);
  const [leadCounts, setLeadCounts] = useState<LeadCounts | null>(null);
  const [subs, setSubs] = useState<SubData | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
      if (Array.isArray(saved.order)) {
        // merge any new widgets that didn't exist when saved
        const merged = [...saved.order.filter((id: string) => DEFAULT_ORDER.includes(id)), ...DEFAULT_ORDER.filter((id) => !saved.order.includes(id))];
        setOrder(merged);
      }
      if (Array.isArray(saved.hidden)) setHidden(saved.hidden);
    } catch { /* first run */ }
  }, []);

  function persist(nextOrder: string[], nextHidden: string[]) {
    setOrder(nextOrder); setHidden(nextHidden);
    localStorage.setItem(LS_KEY, JSON.stringify({ order: nextOrder, hidden: nextHidden }));
  }
  function move(id: string, dir: -1 | 1) {
    const i = order.indexOf(id); const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next, hidden);
  }
  function toggleHide(id: string) {
    persist(order, hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);
  }

  const loadHome = useCallback(async () => {
    const res = await fetch(`/api/home?period=${period}`);
    setHome(await res.json());
  }, [period]);
  useEffect(() => { void loadHome(); }, [loadHome]);
  useEffect(() => {
    fetch("/api/today").then((r) => r.json()).then(setToday).catch(() => {});
    fetch("/api/two-step").then((r) => r.json()).then((d: { posts?: TwoStepPost[] }) => setTwostep(d.posts ?? [])).catch(() => {});
    fetch("/api/leads/counts").then((r) => r.json()).then(setLeadCounts).catch(() => {});
    fetch("/api/stripe/subscriptions").then((r) => r.json()).then(setSubs).catch(() => {});
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  function renderWidget(id: string) {
    switch (id) {
      case "revenue": return <RevenueWidget home={home} period={period} setPeriod={setPeriod} />;
      case "kpis": return <KpiWidget home={home} />;
      case "recurring": return <RecurringWidget home={home} subs={subs} />;
      case "salescalls": return <SalesCallsWidget home={home} />;
      case "pipeline": return <PipelineWidget counts={leadCounts} />;
      case "twostep": return <TwoStepWidget posts={twostep} />;
      case "leadsToMessage": return <LeadsToMessageWidget today={today} />;
      case "followups": return <FollowupsWidget today={today} />;
      case "cashflow": return <CashFlowWidget />;
      case "goals": return <GoalsWidget />;
      case "recent": return <RecentWidget home={home} />;
      case "promises": return <PromisesWidget today={today} />;
      default: return null;
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting}, Andrew ☀️</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <button
          onClick={() => setCustomize((v) => !v)}
          className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${customize ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white"}`}
        >
          {customize ? "✓ Done" : "⚙️ Customize"}
        </button>
      </div>

      {/* Hidden widgets tray (customize mode) */}
      {customize && hidden.length > 0 && (
        <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-zinc-500 text-xs mb-2">Hidden — tap to bring back</p>
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((id) => (
              <button key={id} onClick={() => toggleHide(id)} className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs hover:border-zinc-500">
                + {WIDGETS.find((w) => w.id === id)?.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Widgets — masonry that reflows to 1 column on mobile */}
      <div className="md:columns-2 md:gap-4 space-y-4 md:space-y-0">
        {order.filter((id) => !hidden.includes(id)).map((id) => (
          <div key={id} className="break-inside-avoid md:mb-4">
            {customize && (
              <div className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-t-2xl px-3 py-1.5">
                <span className="text-xs font-medium text-zinc-300">{WIDGETS.find((w) => w.id === id)?.title}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => move(id, -1)} className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs">▲</button>
                  <button onClick={() => move(id, 1)} className="w-6 h-6 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs">▼</button>
                  <button onClick={() => toggleHide(id)} className="w-6 h-6 rounded bg-zinc-700 hover:bg-rose-600/40 text-zinc-300 text-xs">✕</button>
                </div>
              </div>
            )}
            <div className={customize ? "ring-2 ring-blue-500/30 rounded-b-2xl rounded-t-none" : ""}>
              {renderWidget(id)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Widgets ──────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">{children}</div>;
}

function RevenueWidget({ home, period, setPeriod }: { home: HomeData | null; period: string; setPeriod: (p: string) => void }) {
  const up = (home?.changePct ?? 0) >= 0;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wide">Revenue · {home?.label ?? ""}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold text-white">{home ? fmt(home.revenue) : "—"}</span>
            {home && (
              <span className={`text-sm font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                {up ? "↑" : "↓"} {Math.abs(home.changePct)}%
              </span>
            )}
          </div>
          {home && <p className="text-zinc-600 text-xs mt-0.5">{home.prevLabel}: {fmt(home.revenuePrev)}</p>}
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none">
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      <div className="h-44 -mx-1">
        {home?.series?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={home.series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="curFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb923c" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => Number(v) >= 1000 ? `$${Math.round(Number(v) / 1000)}k` : `$${v}`} width={44} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(v, n) => [fmt(Number(v) || 0), n === "cur" ? home.label : home.prevLabel]}
              />
              <Area type="monotone" dataKey="prev" stroke="#52525b" strokeWidth={2} fill="none" dot={false} />
              <Area type="monotone" dataKey="cur" stroke="#fb923c" strokeWidth={2.5} fill="url(#curFill)" dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        ) : <div className="h-full flex items-center justify-center text-zinc-600 text-sm">Loading…</div>}
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs">
        <span className="flex items-center gap-1.5 text-zinc-400"><span className="w-3 h-0.5 bg-orange-400 rounded" /> {home?.label}</span>
        <span className="flex items-center gap-1.5 text-zinc-500"><span className="w-3 h-0.5 bg-zinc-500 rounded" /> {home?.prevLabel}</span>
      </div>
    </Card>
  );
}

function KpiWidget({ home }: { home: HomeData | null }) {
  const tiles = [
    { label: "Sales", value: home?.salesCount ?? 0, color: "text-emerald-400", emoji: "🏆" },
    { label: "Calls Booked", value: home?.callsBooked ?? 0, color: "text-blue-400", emoji: "📞" },
    { label: "Close Rate", value: `${home?.closeRate ?? 0}%`, color: "text-violet-400", emoji: "🎯" },
    { label: "New Leads", value: home?.newLeads ?? 0, color: "text-amber-400", emoji: "🌱" },
  ];
  return (
    <Card>
      <p className="text-white font-semibold text-sm mb-3">📊 Sales Snapshot · {home?.label ?? ""}</p>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-zinc-800/60 rounded-xl p-3">
            <div className="text-lg mb-1">{t.emoji}</div>
            <div className={`text-2xl font-bold ${t.color}`}>{t.value}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const MSG_STAGE_DOT: Record<string, string> = {
  "🔗 Pay Link Sent": "bg-emerald-400",
  "🔥 Hot Prospect": "bg-orange-400",
  "📣 Reached Out": "bg-blue-400",
};

function LeadsToMessageWidget({ today }: { today: TodayData | null }) {
  const leads = (today?.messageList ?? []).slice(0, 6);
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">✉️ Leads to Message</p>
        <a href="/leads" className="text-zinc-500 hover:text-white text-xs">All →</a>
      </div>
      {leads.length === 0 ? <p className="text-zinc-600 text-sm py-4 text-center">Queue clear 🎉</p> : (
        <div className="space-y-2">
          {leads.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2">
              <a href={`/leads?lead=${l.id}`} className="group min-w-0 flex items-center gap-2 flex-1">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${MSG_STAGE_DOT[l.prospect_stage ?? ""] ?? "bg-zinc-500"}`} />
                <span className="min-w-0">
                  <p className="text-white text-sm font-medium truncate group-hover:text-blue-300 transition-colors">{l.full_name ?? "Unknown"}</p>
                  <p className="text-zinc-600 text-[11px] truncate">{l.prospect_stage} · {timeAgo(l.hoursSince)} ago</p>
                </span>
              </a>
              <QuickContacts phone={l.phone} ghlUrl={l.ghl_url} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FollowupsWidget({ today }: { today: TodayData | null }) {
  const fs = (today?.followupsDue ?? []).slice(0, 6);
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">🔁 Follow-Ups Due</p>
        <a href="/calls" className="text-zinc-500 hover:text-white text-xs">All →</a>
      </div>
      {fs.length === 0 ? <p className="text-zinc-600 text-sm py-4 text-center">All caught up 🎉</p> : (
        <div className="space-y-2">
          {fs.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2">
              <a href="/calls" className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-white text-sm font-medium truncate">{f.name}</p>
                  {f.deal_amount ? <span className="text-emerald-400 text-xs font-bold">${f.deal_amount.toLocaleString()}</span> : null}
                </div>
                <p className="text-zinc-600 text-[11px]">
                  {f.orphaned ? "no date" : f.overdueDays && f.overdueDays > 0 ? `${f.overdueDays}d overdue` : "due today"}
                </p>
              </a>
              <QuickContacts phone={f.phone} ghlUrl={f.ghl_url} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RecentWidget({ home }: { home: HomeData | null }) {
  const rec = home?.recent ?? [];
  return (
    <Card>
      <p className="text-white font-semibold text-sm mb-3">💰 Recent Sales · {home?.label ?? ""}</p>
      {rec.length === 0 ? <p className="text-zinc-600 text-sm py-4 text-center">No sales in this range yet.</p> : (
        <div className="space-y-2.5">
          {rec.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{e.name}</p>
                <p className="text-zinc-600 text-[11px]">{e.kind === "Sale" ? "🏆 Sale" : "💳 Payment"}{e.offer ? ` · ${e.offer}` : ""} · {e.date}</p>
              </div>
              <span className="text-emerald-400 font-bold text-sm flex-shrink-0">${e.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RecurringWidget({ home, subs }: { home: HomeData | null; subs: SubData | null }) {
  const fmtDate = (d: string | null) => d ? new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

  // Merge live Stripe subscriptions (same source as the Revenue page) with manual recurring payments
  type Row = { name: string; monthly: number; amount: number; interval: string; nextLabel: string; sortKey: number };
  const stripeRows: Row[] = (subs?.subscriptions ?? [])
    .filter((s) => s.status === "active")
    .map((s) => ({ name: s.name, monthly: s.monthlyAmount, amount: s.amount, interval: s.interval, nextLabel: s.nextBill, sortKey: s.nextBillTs ?? Infinity }));
  const manualRows: Row[] = (home?.recurring ?? [])
    .map((s) => ({ name: s.name, monthly: (s.interval ?? "").toLowerCase().startsWith("month") ? s.amount : 0, amount: s.amount, interval: s.interval, nextLabel: fmtDate(s.next_bill_date), sortKey: s.next_bill_date ? new Date(s.next_bill_date).getTime() / 1000 : Infinity }));

  const rows = [...stripeRows, ...manualRows].sort((a, b) => a.sortKey - b.sortKey);
  const mrr = (subs?.mrr ?? 0) + (home?.mrr ?? 0);
  const activeCount = (subs?.totalActive ?? 0) + manualRows.length;
  const loading = !subs && !home;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">🔄 Recurring</p>
        <a href="/revenue" className="text-emerald-400 text-xs font-bold hover:text-emerald-300">{fmt(mrr)}/mo MRR →</a>
      </div>
      {loading ? <p className="text-zinc-600 text-sm py-4 text-center animate-pulse">Loading…</p>
        : rows.length === 0 ? <p className="text-zinc-600 text-sm py-4 text-center">No active subscriptions.</p> : (
        <div className="space-y-2">
          {rows.slice(0, 6).map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{s.name}</p>
                <p className="text-zinc-600 text-[11px]">next bill {s.nextLabel}</p>
              </div>
              <span className="text-emerald-400 font-bold text-sm flex-shrink-0">${s.amount.toLocaleString()}<span className="text-zinc-600 font-normal text-xs">/{(s.interval || "mo").slice(0, 2)}</span></span>
            </div>
          ))}
          {rows.length > 6 && <p className="text-zinc-600 text-[11px] text-center pt-1">+{rows.length - 6} more · {activeCount} active total</p>}
        </div>
      )}
    </Card>
  );
}

// ─── Cash Collected (Stripe + manual) — real money coming in, by timeline ─────
const CASH_PERIODS = [
  { key: "wtd", label: "This Week" },
  { key: "mtd", label: "This Month" },
  { key: "qtd", label: "This Quarter" },
  { key: "ytd", label: "This Year" },
  { key: "alltime", label: "All Time" },
];
interface ManualPayment { amount: number; payment_type: string; status: string; payment_date: string | null }

function cashPeriodStart(period: string): string | null {
  const now = new Date();
  if (period === "mtd") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  if (period === "wtd") { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); return d.toISOString().split("T")[0]; }
  if (period === "qtd") { const q = Math.floor(now.getMonth() / 3); return new Date(now.getFullYear(), q * 3, 1).toISOString().split("T")[0]; }
  if (period === "ytd") return new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
  return null; // alltime
}
// Match a payment's date to the right Stripe chart bucket label (same scheme as the Revenue page)
function bucketIndexFor(labels: string[], dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  const monthAbbr = d.toLocaleDateString("en-US", { month: "short" });
  const mtdLabel = `${monthAbbr} ${d.getDate()}`;
  const wtdLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (/^\d{4}$/.test(l) && l === String(d.getFullYear())) return i;
    if (l === monthAbbr || l === mtdLabel || l === wtdLabel) return i;
  }
  return -1;
}

function CashFlowWidget() {
  const [cperiod, setCperiod] = useState("mtd");
  const [data, setData] = useState<{ chart: { label: string; revenue: number }[]; total: number } | null>(null);
  const [manual, setManual] = useState<ManualPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let done = false; setLoading(true);
    fetch(`/api/stripe/revenue?period=${cperiod}`)
      .then((r) => r.json())
      .then((d) => { if (!done) { setData({ chart: d.chart ?? [], total: d.summary?.total ?? 0 }); setLoading(false); } })
      .catch(() => { if (!done) setLoading(false); });
    return () => { done = true; };
  }, [cperiod]);
  useEffect(() => {
    fetch("/api/manual-payments").then((r) => r.json()).then((d) => setManual(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // One-off manual payments marked collected, within the selected period
  const manualCollected = useMemo(() => {
    const start = cashPeriodStart(cperiod);
    return manual.filter((p) =>
      p.payment_type === "one_off" && p.status === "collected" && p.amount > 0 &&
      !(start && p.payment_date && p.payment_date < start)
    );
  }, [manual, cperiod]);
  const manualTotal = manualCollected.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total = (data?.total ?? 0) + manualTotal;

  // Merge manual into the Stripe buckets, then build the cumulative running total
  const series = useMemo(() => {
    const buckets = (data?.chart ?? []).map((b) => ({ ...b }));
    if (buckets.length && manualCollected.length) {
      const labels = buckets.map((b) => b.label);
      for (const p of manualCollected) {
        if (!p.payment_date) continue;
        const idx = bucketIndexFor(labels, p.payment_date);
        if (idx >= 0) buckets[idx].revenue += Number(p.amount || 0);
      }
    }
    let c = 0;
    return buckets.map((p) => { c += Number(p.revenue) || 0; return { label: p.label, value: Math.round(c) }; });
  }, [data, manualCollected]);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wide">💳 Cash Collected · Stripe + manual</p>
          <span className="text-3xl font-bold text-emerald-400 mt-1 block">{data ? fmt(total) : "—"}</span>
        </div>
        <select value={cperiod} onChange={(e) => setCperiod(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none">
          {CASH_PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      <div className="h-44 -mx-1">
        {loading ? <div className="h-full flex items-center justify-center text-zinc-600 text-sm">Loading…</div>
          : series.length === 0 ? <div className="h-full flex items-center justify-center text-zinc-600 text-sm">No cash collected in this range.</div>
          : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => Number(v) >= 1000 ? `$${Math.round(Number(v) / 1000)}k` : `$${v}`} width={44} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(v) => [fmt(Number(v) || 0), "Collected"]}
              />
              <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2.5} fill="url(#cashFill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <a href="/revenue" className="text-zinc-500 hover:text-white text-xs mt-1 inline-block">Full revenue breakdown →</a>
    </Card>
  );
}

// ─── Goals tracker — mirrors the Goals page, live cash progress ───────────────
const GOAL_SRC_PERIOD: Record<string, string> = { cash_mtd: "mtd", cash_wtd: "wtd", cash_qtd: "qtd", cash_ytd: "ytd", cash_alltime: "alltime" };
const GOAL_STATUS: Record<string, { label: string; badge: string; bar: string }> = {
  achieved: { label: "Achieved", badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", bar: "from-emerald-500 to-emerald-400" },
  ontrack: { label: "On track", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25", bar: "from-emerald-500 to-emerald-400" },
  atrisk: { label: "At risk", badge: "bg-amber-500/20 text-amber-300 border-amber-500/30", bar: "from-amber-500 to-yellow-400" },
  behind: { label: "Behind", badge: "bg-rose-500/20 text-rose-300 border-rose-500/30", bar: "from-rose-500 to-rose-400" },
};
function goalElapsed(g: Goal): number | null {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  let start: Date, end: Date;
  switch (g.period) {
    case "monthly": start = new Date(y, m, 1); end = new Date(y, m + 1, 1); break;
    case "quarterly": { const q = Math.floor(m / 3); start = new Date(y, q * 3, 1); end = new Date(y, q * 3 + 3, 1); break; }
    case "annual": start = new Date(y, 0, 1); end = new Date(y + 1, 0, 1); break;
    case "weekly": { const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; start = new Date(y, m, d - dow); end = new Date(start.getTime() + 7 * 86400000); break; }
    case "one_time": if (!g.target_date) return null; start = new Date(2020, 0, 1); end = new Date(g.target_date + "T23:59:59"); break;
    default: return null;
  }
  const total = end.getTime() - start.getTime();
  return total <= 0 ? null : Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / total));
}
function goalStatus(g: Goal, current: number): keyof typeof GOAL_STATUS {
  const target = g.target_amount || 0;
  const progress = target > 0 ? current / target : 0;
  if (progress >= 1) return "achieved";
  if (g.target_date && new Date(g.target_date) < new Date()) return "behind";
  const ef = goalElapsed(g);
  if (ef == null) return "ontrack";
  if (progress >= ef) return "ontrack";
  if (progress >= ef * 0.85) return "atrisk";
  return "behind";
}
function GoalsWidget() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [live, setLive] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/goals").then((r) => r.json()).then((d) => setGoals(Array.isArray(d) ? d : [])).catch(() => setGoals([]));
  }, []);
  useEffect(() => {
    if (!goals) return;
    const srcs = Array.from(new Set(goals.map((g) => g.source).filter(Boolean))) as string[];
    const periods = Array.from(new Set(srcs.map((s) => GOAL_SRC_PERIOD[s]).filter(Boolean)));
    if (!periods.length) return;
    Promise.all(periods.map((p) => fetch(`/api/stripe/revenue?period=${p}`).then((r) => r.json()).then((d) => [p, Number(d?.summary?.total) || 0] as const)))
      .then((entries) => {
        const byP = Object.fromEntries(entries);
        const byS: Record<string, number> = {};
        for (const s of srcs) byS[s] = byP[GOAL_SRC_PERIOD[s]] ?? 0;
        setLive(byS);
      }).catch(() => {});
  }, [goals]);

  const rows = (goals ?? []).slice(0, 4);
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">🏁 Goals</p>
        <a href="/goals" className="text-zinc-500 hover:text-white text-xs">All →</a>
      </div>
      {!goals ? <p className="text-zinc-600 text-sm py-4 text-center animate-pulse">Loading…</p>
        : rows.length === 0 ? <p className="text-zinc-600 text-sm py-4 text-center">No goals yet. <a href="/goals" className="underline">Add one →</a></p>
        : (
        <div className="space-y-3.5">
          {rows.map((g) => {
            const current = (g.source && live[g.source] != null ? live[g.source] : 0) + (g.current_amount ?? 0);
            const target = g.target_amount || 0;
            const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
            const st = GOAL_STATUS[goalStatus(g, current)];
            const val = (n: number) => (g.goal_type === "cash" ? fmt(n) : Math.round(n).toLocaleString());
            return (
              <a key={g.id} href="/goals" className="block group">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base flex-shrink-0">{g.emoji}</span>
                    <p className="text-white text-sm font-medium truncate group-hover:text-blue-300 transition-colors">{g.name}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${st.badge}`}>{st.label}</span>
                  </div>
                  <span className="text-zinc-500 text-xs flex-shrink-0">{pct.toFixed(0)}% of {val(target)}</span>
                </div>
                <div className="mt-1.5 h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${st.bar} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SalesCallsWidget({ home }: { home: HomeData | null }) {
  const upcoming = home?.upcomingCalls ?? [];
  const recent = home?.recentCalls ?? [];
  const fmtDT = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">📞 Sales Calls</p>
        <a href="/calls" className="text-zinc-500 hover:text-white text-xs">All →</a>
      </div>
      {upcoming.length > 0 && (
        <div className="mb-3">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-1.5">Upcoming</p>
          <div className="space-y-1.5">
            {upcoming.slice(0, 4).map((c) => (
              <a key={c.id} href="/calls" className="flex items-center justify-between gap-2">
                <p className="text-white text-sm font-medium truncate">{c.name}</p>
                <span className="text-blue-300 text-[11px] flex-shrink-0">{fmtDT(c.call_date)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-1.5">Recent</p>
          <div className="space-y-1.5">
            {recent.slice(0, 4).map((c) => (
              <a key={c.id} href="/calls" className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{c.name}</p>
                  <p className="text-zinc-600 text-[11px]">{c.result} · {c.call_date}</p>
                </div>
                {c.deal_amount ? <span className="text-emerald-400 font-bold text-sm flex-shrink-0">${c.deal_amount.toLocaleString()}</span> : null}
              </a>
            ))}
          </div>
        </div>
      )}
      {upcoming.length === 0 && recent.length === 0 && <p className="text-zinc-600 text-sm py-4 text-center">No calls yet.</p>}
    </Card>
  );
}

function PipelineWidget({ counts }: { counts: LeadCounts | null }) {
  const tiles = [
    { label: "Hot Prospects", value: counts?.hot ?? 0, color: "text-orange-400", emoji: "🔥" },
    { label: "Calls Booked", value: counts?.call ?? 0, color: "text-violet-400", emoji: "📞" },
    { label: "New This Month", value: counts?.month ?? 0, color: "text-amber-400", emoji: "🌱" },
    { label: "Total Leads", value: counts?.total ?? 0, color: "text-white", emoji: "🎯" },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">🎯 Leads Pipeline</p>
        <a href="/leads" className="text-zinc-500 hover:text-white text-xs">All →</a>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <a key={t.label} href="/leads" className="bg-zinc-800/60 rounded-xl p-3">
            <div className="text-lg mb-1">{t.emoji}</div>
            <div className={`text-2xl font-bold ${t.color}`}>{t.value.toLocaleString()}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{t.label}</div>
          </a>
        ))}
      </div>
    </Card>
  );
}

function TwoStepWidget({ posts }: { posts: TwoStepPost[] }) {
  const todo = posts.filter((p) => p.status !== "done");
  const platformEmoji = (p: string) => p === "instagram" ? "📸" : p === "skool" ? "🎓" : "👥";
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">🔗 Two-Step to Respond</p>
        <a href="/two-step" className="text-zinc-500 hover:text-white text-xs">All →</a>
      </div>
      {todo.length === 0 ? <p className="text-zinc-600 text-sm py-4 text-center">All posts worked 🎉</p> : (
        <div className="space-y-2">
          {todo.slice(0, 5).map((p) => (
            <a key={p.id} href="/two-step" className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{platformEmoji(p.platform)} {p.post_title ?? p.post_url}</p>
                <p className="text-zinc-600 text-[11px]">{p.platform === "skool" ? "Skool · manual" : `${p.commenter_count} commenters`}{p.resources ? ` · 🎁 ${p.resources.title}` : ""}</p>
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${p.status === "in_progress" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-zinc-800 border border-zinc-700 text-zinc-400"}`}>
                {p.status === "in_progress" ? "⏳" : "📋"}
              </span>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

function PromisesWidget({ today }: { today: TodayData | null }) {
  const ps = today?.promisesDue ?? [];
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">📌 Promised Payments</p>
        <a href="/revenue#promises" className="text-zinc-500 hover:text-white text-xs">Revenue →</a>
      </div>
      {ps.length === 0 ? <p className="text-zinc-600 text-sm py-4 text-center">Nothing promised right now.</p> : (
        <div className="space-y-2">
          {ps.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{p.name}</p>
                <p className="text-zinc-600 text-[11px]">due {p.payment_date}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-bold text-sm">${p.amount.toLocaleString()}</span>
                <QuickContacts phone={p.phone} ghlUrl={p.ghl_url} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
