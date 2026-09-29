"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Onboarding answers from the $47 7-day trial welcome page
// (trial-welcome app → Supabase `paid_trials`).
interface Trial {
  id: string;
  created_at: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  video_watched_at: string | null;
  chat_joined_at: string | null;
  app_status: string;
  app_error: string | null;
  app_invited_at: string | null;
  app_expires_at: string | null;
  app_first_login_at: string | null;
  app_last_login_at: string | null;
  nudge1_sent_at: string | null;
  nudge2_sent_at: string | null;
  calendar_status: string;
  calendar_detail: string | null;
  calendar_updated_at: string | null;
  paid_trial_messages?: TrialMessage[];
  stripe_session_id: string | null;
  source: string | null;
  onboarding_submitted_at: string | null;
  converted_amount: number | string | null;
  converted_offer: string | null;
  converted_at: string | null;
  business_type: string | null;
  monthly_revenue: string | null;
  qualifies_for_call: boolean;
  who_and_result: string | null;
  offer_links: string | null;
  lead_sources: string[] | null;
  ai_tools: string[] | null;
  time_leaks: string[] | null;
  why_now: string | null;
  contribution: string | null;
  status: string;
  notes: string | null;
  booked_call: boolean;
  call_start_time: string | null;
  ghl_contact_id: string | null;
  ai_plan: string | null;
  ai_plan_generated_at: string | null;
}

interface TrialMessage {
  id: string;
  created_at: string;
  kind: string;
  channel: string;
  status: string;
  detail: string | null;
}

// One-line read of where their Mastermind app access stands.
function appState(t: Trial): { label: string; badge: string } {
  if (t.app_first_login_at) return { label: "📱 Logged in", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" };
  switch (t.app_status) {
    case "invited":
      return { label: "📱 Invited, not in yet", badge: "bg-amber-500/10 text-amber-300 border-amber-500/30" };
    case "existing_account":
      return { label: "📱 Has existing login", badge: "bg-sky-500/10 text-sky-300 border-sky-500/30" };
    case "failed":
      return { label: "📱 Invite failed", badge: "bg-red-500/10 text-red-300 border-red-500/30" };
    case "pending":
    case "provisioning":
      return { label: "📱 Sending login…", badge: "bg-zinc-800 text-zinc-400 border-zinc-700" };
    default:
      return { label: "📱 No app invite", badge: "bg-zinc-800 text-zinc-500 border-zinc-700" };
  }
}

const KIND_LABEL: Record<string, string> = {
  invite: "Login invite",
  invite_existing: "Login invite (existing account)",
  nudge1: "Nudge 1 (24h)",
  nudge2: "Nudge 2 (72h)",
  correction: "Correction (right links)",
};

const CAL_LABEL: Record<string, string> = {
  queued: "⏳ Queued · calendar worker not running yet (invite by hand)",
  sent: "✅ Invited to this week's calls",
  partial: "⚠️ Some invites failed",
  failed: "❌ Calendar invites failed",
  skipped: "— Not sent",
};

const STATUSES = ["new", "onboarded", "converted", "not_fit"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_META: Record<Status, { label: string; badge: string }> = {
  new: { label: "New", badge: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  onboarded: { label: "Plan sent", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  converted: { label: "Converted", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  not_fit: { label: "Not a fit", badge: "bg-zinc-600/20 text-zinc-400 border-zinc-600/40" },
};

const GHL_LOCATION = "ZJQSLWJWH7OVHVrJjmPj";

function fullName(t: Trial) {
  return [t.first_name, t.last_name].filter(Boolean).join(" ") || "Unnamed";
}
function initials(t: Trial) {
  return (
    fullName(t)
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
function fmtWhen(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtFull(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ─── Trial model helpers ───────────────────────────────────────────── */

const TRIAL_DAYS = 7;
const DAY = 86_400_000;
const FRONT_END_PRICE = 47;

const LINKS = [
  { label: "Sales page", emoji: "🌐", url: "https://7fc-trial-welcome.vercel.app/" },
  { label: "Welcome + onboarding", emoji: "📝", url: "https://7fc-trial-welcome.vercel.app/welcome" },
  { label: "Stripe checkout ($47)", emoji: "💳", url: "https://buy.stripe.com/eVafZgcyN7CXa8UcQA" },
  { label: "Mastermind app", emoji: "📱", url: "https://mastermind-portal-zeta.vercel.app/" },
  { label: "Trial Fam WhatsApp", emoji: "💬", url: "https://chat.whatsapp.com/FRe49IHHS0tBlBTfnf2ZJ8" },
  { label: "Stripe payments", emoji: "📈", url: "https://dashboard.stripe.com/payment-links/plink_1Qg7mTGic4Z3oeZEpcYz2S54" },
];

// Where someone is in the trial, furthest step reached. Manual statuses win.
const STAGES = ["purchased", "onboarded", "in_app", "call_booked", "converted", "not_fit"] as const;
type Stage = (typeof STAGES)[number];
const STAGE_META: Record<Stage, { label: string; badge: string }> = {
  purchased: { label: "Paid, no onboarding", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  onboarded: { label: "Onboarded", badge: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  in_app: { label: "In the app", badge: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  call_booked: { label: "Call booked", badge: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  converted: { label: "Converted", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  not_fit: { label: "Not a fit", badge: "bg-zinc-600/20 text-zinc-400 border-zinc-600/40" },
};

function stageOf(t: Trial): Stage {
  if (t.status === "converted") return "converted";
  if (t.status === "not_fit") return "not_fit";
  if (t.booked_call) return "call_booked";
  if (t.app_first_login_at) return "in_app";
  if (t.onboarding_submitted_at) return "onboarded";
  return "purchased";
}

function trialWindow(t: Trial) {
  const start = new Date(t.created_at ?? Date.now()).getTime();
  const end = t.app_expires_at ? new Date(t.app_expires_at).getTime() : start + TRIAL_DAYS * DAY;
  const now = Date.now();
  const left = Math.ceil((end - now) / DAY);
  const day = Math.min(TRIAL_DAYS, Math.max(1, Math.floor((now - start) / DAY) + 1));
  return { ended: now >= end, left: Math.max(0, left), day, pct: Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) };
}

const isPaid = (t: Trial) => Boolean(t.stripe_session_id?.startsWith("cs_live"));
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function PaidTrialsPage() {
  const [rows, setRows] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "ended" | Stage>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/paid-trials");
      const d = await r.json();
      if (Array.isArray(d)) setRows(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Deep link from the Telegram alert: /paid-trials?id=<uuid>
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setOpenId(id);
    // Days-left and stages move on their own; keep the page fresh.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const open = rows.find((r) => r.id === openId) ?? null;

  async function patch(id: string, updates: Partial<Trial>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    await fetch("/api/paid-trials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
  }

  async function remove(id: string) {
    const t = rows.find((r) => r.id === id);
    if (!confirm(`Delete ${t ? fullName(t) : "this entry"}? This can't be undone.`)) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (openId === id) setOpenId(null);
    await fetch(`/api/paid-trials?id=${id}`, { method: "DELETE" });
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "active" && (trialWindow(r).ended || ["converted", "not_fit"].includes(stageOf(r)))) return false;
      if (filter === "ended" && !trialWindow(r).ended) return false;
      if (STAGES.includes(filter as Stage) && stageOf(r) !== filter) return false;
      if (!needle) return true;
      return [fullName(r), r.email, r.phone, r.business_type, r.monthly_revenue, r.who_and_result]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, filter, q]);

  const FILTERS: { k: typeof filter; label: string; n: number }[] = [
    { k: "all", label: "All", n: rows.length },
    { k: "active", label: "Active trial", n: rows.filter((r) => !trialWindow(r).ended && !["converted", "not_fit"].includes(stageOf(r))).length },
    ...STAGES.map((s) => ({ k: s, label: STAGE_META[s].label, n: rows.filter((r) => stageOf(r) === s).length })),
    { k: "ended", label: "Trial ended", n: rows.filter((r) => trialWindow(r).ended).length },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Paid Trials</h1>
          <p className="text-zinc-500 text-sm mt-0.5">$47 7-day trial · signups, stages, and what it's making</p>
        </div>
        <button
          onClick={load}
          className="text-xs font-medium text-zinc-400 hover:text-white border border-zinc-800 rounded-lg px-3 py-2"
        >
          Refresh
        </button>
      </div>

      <QuickLinks />
      <Dashboard rows={rows} loading={loading} onStage={(s) => setFilter(s)} />

      <div className="flex flex-wrap items-center gap-2 mb-4 mt-8">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`shrink-0 text-xs font-medium rounded-lg px-3 py-2 border transition ${
                filter === f.k
                  ? "bg-white text-black border-white"
                  : "text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
              }`}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{f.n}</span>
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, phone, niche..."
          className="flex-1 min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading trials...</p>
      ) : shown.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-zinc-400 text-sm">
            {rows.length === 0 ? "No trials yet. They land here the moment someone pays." : "Nothing matches that filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => (
            <TrialCard key={r.id} t={r} onOpen={() => setOpenId(r.id)} onDelete={() => remove(r.id)} />
          ))}
        </div>
      )}

      {open && <Detail t={open} onClose={() => setOpenId(null)} onPatch={patch} onDelete={remove} />}
    </div>
  );
}

/* ─── Quick links ───────────────────────────────────────────────────── */
function QuickLinks() {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible no-scrollbar pb-1 mb-5">
      {LINKS.map((l) => (
        <div key={l.url} className="shrink-0 flex items-center bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition"
          >
            <span>{l.emoji}</span>
            {l.label}
            <span className="text-zinc-600">↗</span>
          </a>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(l.url).catch(() => {});
              setCopied(l.url);
              setTimeout(() => setCopied(null), 1400);
            }}
            title="Copy link"
            className="px-2.5 py-2 text-xs text-zinc-500 hover:text-white border-l border-zinc-800 hover:bg-zinc-800 transition"
          >
            {copied === l.url ? "✓" : "Copy"}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────────────── */
function Dashboard({ rows, loading, onStage }: { rows: Trial[]; loading: boolean; onStage: (s: Stage) => void }) {
  const d = useMemo(() => {
    const now = Date.now();
    const paid = rows.filter(isPaid);
    const frontEnd = paid.length * FRONT_END_PRICE;
    const converted = rows.filter((r) => r.status === "converted");
    const backEnd = converted.reduce((sum, r) => sum + Number(r.converted_amount ?? 0), 0);
    const active = rows.filter((r) => !trialWindow(r).ended && !["converted", "not_fit"].includes(stageOf(r))).length;
    const decided = rows.filter((r) => trialWindow(r).ended || ["converted", "not_fit"].includes(stageOf(r))).length;

    // Funnel = everyone who reached each step (not just who's sitting there now).
    const reached = {
      paid: rows.length,
      onboarded: rows.filter((r) => r.onboarding_submitted_at).length,
      in_app: rows.filter((r) => r.app_first_login_at).length,
      chat: rows.filter((r) => r.chat_joined_at).length,
      call: rows.filter((r) => r.booked_call).length,
      converted: converted.length,
    };

    // Signups per day, last 30 days.
    const days: { key: string; label: string; n: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(now - i * DAY);
      const key = dt.toISOString().slice(0, 10);
      days.push({ key, label: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }), n: 0 });
    }
    for (const r of rows) {
      const key = (r.created_at ?? "").slice(0, 10);
      const day = days.find((x) => x.key === key);
      if (day) day.n++;
    }

    return {
      signups: rows.length,
      week: rows.filter((r) => r.created_at && now - new Date(r.created_at).getTime() < 7 * DAY).length,
      active,
      frontEnd,
      paidCount: paid.length,
      backEnd,
      convertedCount: converted.length,
      convRate: decided ? Math.round((converted.length / decided) * 100) : null,
      perTrial: rows.length ? (frontEnd + backEnd) / rows.length : 0,
      reached,
      days,
    };
  }, [rows]);

  if (loading) return null;

  const funnel: { key: keyof typeof d.reached; label: string; stage?: Stage }[] = [
    { key: "paid", label: "Paid $47", stage: "purchased" },
    { key: "onboarded", label: "Filled onboarding", stage: "onboarded" },
    { key: "in_app", label: "Logged into the app", stage: "in_app" },
    { key: "chat", label: "Joined Trial Fam" },
    { key: "call", label: "Booked a call", stage: "call_booked" },
    { key: "converted", label: "Joined the Mastermind", stage: "converted" },
  ];
  const top = Math.max(1, d.reached.paid);
  const maxDay = Math.max(1, ...d.days.map((x) => x.n));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="Signups" value={d.signups} sub={`+${d.week} this week`} />
        <Kpi label="Active trials" value={d.active} sub="in their 7 days now" accent="text-blue-300" />
        <Kpi label="Front-end" value={money(d.frontEnd)} sub={`${d.paidCount} × $${FRONT_END_PRICE}`} accent="text-white" />
        <Kpi label="Back-end" value={money(d.backEnd)} sub={`${d.convertedCount} joined`} accent="text-emerald-300" />
        <Kpi label="Total" value={money(d.frontEnd + d.backEnd)} sub={`${money(d.perTrial)} per trial`} accent="text-emerald-300" />
        <Kpi label="Conversion" value={d.convRate === null ? "—" : `${d.convRate}%`} sub="of finished trials" accent="text-violet-300" />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Trial funnel</p>
          <div className="mt-3 space-y-2">
            {funnel.map((f) => {
              const n = d.reached[f.key];
              const pct = Math.round((n / top) * 100);
              return (
                <button
                  key={f.key}
                  onClick={() => f.stage && onStage(f.stage)}
                  disabled={!f.stage}
                  className="w-full text-left group disabled:cursor-default"
                  title={f.stage ? `Show ${f.label.toLowerCase()}` : undefined}
                >
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-zinc-300 group-enabled:group-hover:text-white">{f.label}</span>
                    <span className="text-zinc-400 tabular-nums">
                      <span className="text-white font-semibold">{n}</span>
                      {f.key !== "paid" && <span className="ml-1.5 text-zinc-500">{pct}%</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(n ? 3 : 0, pct)}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Signups · last 30 days</p>
            <p className="text-xs text-zinc-500">{d.days.reduce((a, x) => a + x.n, 0)} total</p>
          </div>
          <div className="mt-4 flex items-end gap-[2px] h-28" role="img" aria-label="Signups per day for the last 30 days">
            {d.days.map((x) => (
              <div key={x.key} className="group relative flex-1 h-full flex items-end">
                <div
                  className={`w-full rounded-t-[4px] ${x.n ? "bg-blue-500 group-hover:bg-blue-400" : "bg-zinc-800"}`}
                  style={{ height: x.n ? `${(x.n / maxDay) * 100}%` : "3px" }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1 text-[11px] text-white z-10">
                  {x.label}: {x.n}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-zinc-600">
            <span>{d.days[0].label}</span>
            <span>Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${accent ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── Card ──────────────────────────────────────────────────────────── */
function TrialCard({ t, onOpen, onDelete }: { t: Trial; onOpen: () => void; onDelete: () => void }) {
  const stage = STAGE_META[stageOf(t)];
  const w = trialWindow(t);
  const done = ["converted", "not_fit"].includes(stageOf(t));
  const steps: [string, boolean][] = [
    ["Onboarding", Boolean(t.onboarding_submitted_at)],
    ["App", Boolean(t.app_first_login_at)],
    ["WhatsApp", Boolean(t.chat_joined_at)],
    ["Call", t.booked_call],
  ];
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group relative text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-600 transition cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-sm font-bold">
          {initials(t)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold truncate">{fullName(t)}</p>
          <span className={`inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${stage.badge}`}>
            {stage.label}
          </span>
        </div>
        <button
          onClick={(e) => {
            stop(e);
            onDelete();
          }}
          title="Delete (test or duplicate)"
          aria-label={`Delete ${fullName(t)}`}
          className="shrink-0 -mr-1 -mt-1 h-8 w-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>

      <div className="mt-3 space-y-1 text-xs">
        {t.email ? (
          <a href={`mailto:${t.email}`} onClick={stop} className="flex items-center gap-2 text-zinc-300 hover:text-white truncate">
            <span className="text-zinc-500">✉️</span>
            <span className="truncate">{t.email}</span>
          </a>
        ) : null}
        {t.phone ? (
          <a href={`tel:${t.phone.replace(/[^\d+]/g, "")}`} onClick={stop} className="flex items-center gap-2 text-zinc-300 hover:text-white">
            <span className="text-zinc-500">📞</span>
            {t.phone}
          </a>
        ) : (
          <p className="flex items-center gap-2 text-zinc-600">
            <span>📞</span>No phone
          </p>
        )}
      </div>

      {/* trial clock */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-zinc-400">
            {done ? "Trial complete" : w.ended ? "Trial ended" : `Day ${w.day} of ${TRIAL_DAYS}`}
          </span>
          <span className={w.ended || done ? "text-zinc-500" : w.left <= 2 ? "text-amber-300 font-semibold" : "text-zinc-300"}>
            {done ? "" : w.ended ? "0 days left" : `${w.left} day${w.left === 1 ? "" : "s"} left`}
          </span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${done ? "bg-emerald-500" : w.ended ? "bg-zinc-600" : w.left <= 2 ? "bg-amber-400" : "bg-blue-500"}`}
            style={{ width: `${done ? 100 : w.pct}%` }}
          />
        </div>
      </div>

      {/* steps */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {steps.map(([label, ok]) => (
          <span
            key={label}
            className={`text-[11px] rounded-md px-2 py-1 border ${
              ok ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-zinc-800/60 text-zinc-500 border-zinc-800"
            }`}
          >
            {ok ? "✓" : "○"} {label}
          </span>
        ))}
      </div>

      {t.booked_call && t.call_start_time && (
        <p className="mt-2 text-[11px] text-violet-300">
          📅 Onboarding call {new Date(t.call_start_time).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
      {t.status === "converted" && t.converted_amount ? (
        <p className="mt-2 text-[11px] text-emerald-300">💰 Joined · {money(Number(t.converted_amount))}{t.converted_offer ? ` · ${t.converted_offer}` : ""}</p>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-600">
        <span className="truncate">{[t.monthly_revenue, t.business_type].filter(Boolean).join(" · ") || "Onboarding not filled yet"}</span>
        <span className="shrink-0 ml-2">{fmtWhen(t.created_at)}</span>
      </div>
    </div>
  );
}

/* ─── Slide-in detail ────────────────────────────────────────────────── */
function Detail({
  t,
  onClose,
  onPatch,
  onDelete,
}: {
  t: Trial;
  onClose: () => void;
  onPatch: (id: string, u: Partial<Trial>) => void;
  onDelete: (id: string) => void;
}) {
  const [notes, setNotes] = useState(t.notes ?? "");
  const [tab, setTab] = useState<"answers" | "plan">("answers");

  useEffect(() => setNotes(t.notes ?? ""), [t.id, t.notes]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const QA: [string, React.ReactNode][] = [
    ["What best describes them", t.business_type],
    ["Monthly revenue", t.monthly_revenue],
    ["Who they help + the result", t.who_and_result],
    ["Offer links", t.offer_links ? <Linkify text={t.offer_links} /> : null],
    ["Where clients come from", <Chips key="ls" items={t.lead_sources} />],
    ["AI + tools they use", <Chips key="ai" items={t.ai_tools} />],
    ["Where their week leaks", <Chips key="tl" items={t.time_leaks} />],
    ["Why now", t.why_now],
    ["What they'll contribute", t.contribution],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <aside className="relative w-full sm:max-w-xl bg-zinc-950 border-l border-zinc-800 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-5 py-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white truncate">{fullName(t)}</h2>
            <p className="text-zinc-500 text-xs">
              Joined {fmtFull(t.created_at)} · {STAGE_META[stageOf(t)].label}
              {(() => {
                const w = trialWindow(t);
                return w.ended ? " · trial ended" : ` · ${w.left} day${w.left === 1 ? "" : "s"} left`;
              })()}
              {t.chat_joined_at ? " · in Trial Fam" : " · not in Trial Fam"}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none px-2">
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {t.email && (
              <a
                href={`mailto:${t.email}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 hover:border-zinc-600 transition"
              >
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Email</p>
                <p className="text-sm text-white truncate">{t.email}</p>
              </a>
            )}
            {t.phone && (
              <a
                href={`tel:${t.phone.replace(/[^\d+]/g, "")}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 hover:border-zinc-600 transition"
              >
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Phone</p>
                <p className="text-sm text-white">{t.phone}</p>
              </a>
            )}
            {t.ghl_contact_id && (
              <a
                href={`https://app.gohighlevel.com/v2/location/${GHL_LOCATION}/contacts/${t.ghl_contact_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 hover:border-zinc-600 transition"
              >
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">GHL</p>
                <p className="text-sm text-white">Open contact ↗</p>
              </a>
            )}
            {t.call_start_time && (
              <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-violet-300">40-min call</p>
                <p className="text-sm text-white">{fmtFull(t.call_start_time)}</p>
              </div>
            )}
          </div>

          {t.app_status !== "skipped" && <AppAccess t={t} />}

          {/* status */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() =>
                    onPatch(t.id, s === "converted" && !t.converted_at ? { status: s, converted_at: new Date().toISOString() } : { status: s })
                  }
                  className={`text-xs font-medium rounded-lg px-3 py-2 border transition ${
                    t.status === s ? STATUS_META[s].badge : "text-zinc-500 border-zinc-800 hover:text-white"
                  }`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
              <button
                onClick={() => onPatch(t.id, { booked_call: !t.booked_call })}
                className={`text-xs font-medium rounded-lg px-3 py-2 border transition ${
                  t.booked_call
                    ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                    : "text-zinc-500 border-zinc-800 hover:text-white"
                }`}
              >
                📅 {t.booked_call ? "Call booked" : "Mark booked"}
              </button>
            </div>
          </div>

          {t.status === "converted" && <Conversion t={t} onPatch={onPatch} />}

          {/* answers / AI plan */}
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
            {(["answers", "plan"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  tab === k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {k === "answers" ? "📝 Their answers" : "✨ AI game plan"}
              </button>
            ))}
          </div>

          {tab === "answers" ? (
            <div className="space-y-3">
              {QA.map(([q, a]) => (
                <div key={q} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{q}</p>
                  <div className="text-sm text-zinc-200 mt-1.5 whitespace-pre-wrap leading-relaxed">{a || "—"}</div>
                </div>
              ))}
            </div>
          ) : t.ai_plan ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-[11px] text-zinc-500 mb-3">
                First draft by Claude · {fmtFull(t.ai_plan_generated_at)} · review before sharing
              </p>
              <Markdown text={t.ai_plan} />
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-sm text-zinc-400">
              The AI game plan is still generating (about a minute after they submit). Hit Refresh.
            </div>
          )}

          {/* notes */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">Your notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (t.notes ?? "")) onPatch(t.id, { notes });
              }}
              rows={4}
              placeholder="Offer ideas, what to cover on the call..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <button
            onClick={() => onDelete(t.id)}
            className="text-xs font-medium text-red-400/80 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg px-3 py-2 transition"
          >
            🗑 Delete this trial (test or duplicate)
          </button>
        </div>
      </aside>
    </div>
  );
}

// What they joined for once the trial converts. Feeds back-end revenue.
const OFFERS: { label: string; amount: number }[] = [
  { label: "AI Mastermind (1st month)", amount: 1500 },
  { label: "LAUNCH PIF", amount: 9000 },
  { label: "BOARDROOM PIF", amount: 15000 },
];

function Conversion({ t, onPatch }: { t: Trial; onPatch: (id: string, u: Partial<Trial>) => void }) {
  const [amount, setAmount] = useState(t.converted_amount ? String(t.converted_amount) : "");
  const [offer, setOffer] = useState(t.converted_offer ?? "");
  useEffect(() => {
    setAmount(t.converted_amount ? String(t.converted_amount) : "");
    setOffer(t.converted_offer ?? "");
  }, [t.id, t.converted_amount, t.converted_offer]);
  const save = (a = amount, o = offer) => {
    const n = Number(String(a).replace(/[^\d.]/g, ""));
    onPatch(t.id, { converted_amount: Number.isFinite(n) && n > 0 ? n : null, converted_offer: o || null });
  };
  return (
    <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">💰 What they joined for</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OFFERS.map((o) => (
          <button
            key={o.label}
            onClick={() => {
              setOffer(o.label);
              setAmount(String(o.amount));
              save(String(o.amount), o.label);
            }}
            className={`text-xs rounded-lg px-3 py-1.5 border transition ${
              offer === o.label ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/40" : "text-zinc-400 border-zinc-800 hover:text-white"
            }`}
          >
            {o.label} · {money(o.amount)}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          onBlur={() => save()}
          placeholder="Offer (e.g. AI Mastermind)"
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => save()}
          inputMode="decimal"
          placeholder="Cash collected ($)"
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">Counts toward Back-end on the dashboard.</p>
    </div>
  );
}

function AppAccess({ t }: { t: Trial }) {
  const st = appState(t);
  const msgs = t.paid_trial_messages ?? [];
  const expired = t.app_expires_at && new Date(t.app_expires_at).getTime() < Date.now();
  const rows: [string, React.ReactNode][] = [
    ["Login sent", t.app_invited_at ? fmtFull(t.app_invited_at) : "—"],
    ["First login", t.app_first_login_at ? fmtFull(t.app_first_login_at) : "Not yet"],
    ["Last login", t.app_last_login_at ? fmtFull(t.app_last_login_at) : "—"],
    [
      "Access ends",
      t.app_expires_at ? `${fmtFull(t.app_expires_at)}${expired ? " (ended)" : ""} · lifts when you set them active in Helm` : "—",
    ],
    ["Nudges", `24h: ${t.nudge1_sent_at ? fmtFull(t.nudge1_sent_at) : t.app_first_login_at ? "not needed" : "pending"} · 72h: ${t.nudge2_sent_at ? fmtFull(t.nudge2_sent_at) : t.app_first_login_at ? "not needed" : "pending"}`],
    ["Calendar", <span key="cal">{CAL_LABEL[t.calendar_status] ?? t.calendar_status}{t.calendar_detail ? <span className="block text-zinc-500 text-xs mt-0.5">{t.calendar_detail}</span> : null}</span>],
  ];
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Mastermind app access</p>
        <span className={`text-[11px] rounded-md px-2 py-1 border ${st.badge}`}>{st.label}</span>
      </div>
      {t.app_error && <p className="mt-2 text-xs text-red-300 break-words">{t.app_error}</p>}
      <dl className="mt-3 space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-sm">
            <dt className="w-24 shrink-0 text-zinc-500">{k}</dt>
            <dd className="text-zinc-200 min-w-0">{v}</dd>
          </div>
        ))}
      </dl>
      {msgs.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Messages via GHL</p>
          {msgs.map((m) => (
            <div key={m.id} className="flex items-baseline gap-2 text-xs">
              <span className={m.status === "sent" ? "text-emerald-400" : m.status === "failed" ? "text-red-400" : "text-zinc-500"}>
                {m.status === "sent" ? "✓" : m.status === "failed" ? "✕" : "–"}
              </span>
              <span className="text-zinc-300">{KIND_LABEL[m.kind] ?? m.kind}</span>
              <span className="text-zinc-500 uppercase">{m.channel}</span>
              <span className="text-zinc-600">{fmtWhen(m.created_at)}</span>
              {m.status !== "sent" && m.detail && <span className="text-zinc-500 truncate">{m.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chips({ items }: { items: string[] | null }) {
  if (!items?.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="text-[11px] rounded-md px-2 py-1 bg-zinc-800 text-zinc-300 border border-zinc-700">
          {i}
        </span>
      ))}
    </span>
  );
}

function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\s+)/).map((part, i) =>
        /^https?:\/\/\S+$/.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

// Just enough markdown for the plan: ## headings, bullets, **bold**.
function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="text-white font-semibold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      p
    ),
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm text-zinc-300 leading-relaxed">
      {text.split("\n").map((line, i) => {
        const l = line.trimEnd();
        if (!l.trim()) return <div key={i} className="h-1" />;
        if (/^#{1,3}\s/.test(l))
          return (
            <h3 key={i} className="text-white font-bold text-[15px] pt-3">
              {inline(l.replace(/^#{1,3}\s/, ""))}
            </h3>
          );
        if (/^\s*([-*]|\d+\.)\s/.test(l))
          return (
            <p key={i} className="pl-4 relative">
              <span className="absolute left-0 text-zinc-500">•</span>
              {inline(l.replace(/^\s*([-*]|\d+\.)\s/, ""))}
            </p>
          );
        return <p key={i}>{inline(l)}</p>;
      })}
    </div>
  );
}
