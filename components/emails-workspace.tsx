"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { GhlCampaign, Totals } from "@/lib/email-campaigns";

// ── Types ────────────────────────────────────────────────────────────────────
type PlanRow = {
  id: string; title: string; subject: string | null; planned_date: string | null;
  status: string; kind: string; audience: string | null; notes: string | null;
  link_url: string | null; ghl_schedule_id: string | null;
  opens: number | null; clicks: number | null;
};

type Audience = {
  contacts: number | null; with_email: number | null; no_email: number | null;
  valid_email: number | null; invalid_email: number | null;
  unsubscribed: number | null; mailable: number | null;
};

type GhlPayload = {
  sent: GhlCampaign[]; drafts: GhlCampaign[];
  series: { date: string; name: string; audience: number; delivered: number; not_delivered: number; rate: number | null }[];
  totals: Totals; note: string; window_days: number;
};

const KINDS = ["youtube", "promo", "launch", "nurture", "newsletter"] as const;
const STATUSES = ["idea", "drafted", "scheduled", "sent", "skipped"] as const;

const KIND_STYLE: Record<string, string> = {
  youtube: "bg-red-500/15 text-red-300 ring-red-500/30",
  promo: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  launch: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  nurture: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  newsletter: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};
const STATUS_STYLE: Record<string, string> = {
  idea: "bg-zinc-800 text-zinc-400 ring-zinc-700",
  drafted: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  scheduled: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  sent: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  skipped: "bg-zinc-800/60 text-zinc-600 ring-zinc-800",
};

const n = (v: number) => v.toLocaleString();
const pctText = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const dayLabel = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// ── Shell ────────────────────────────────────────────────────────────────────
export default function EmailsWorkspace() {
  const [tab, setTab] = useState<"dashboard" | "planner">("dashboard");
  const [ghl, setGhl] = useState<GhlPayload | null>(null);
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [ghlError, setGhlError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const loadGhl = useCallback(() =>
    fetch("/api/emails/ghl?days=90", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b.error ? setGhlError(b.error) : (setGhl(b), setGhlError(null))))
      .catch((e) => setGhlError(String(e))), []);

  const loadPlan = useCallback(() =>
    fetch("/api/emails/plan", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b.error ? setPlanError(b.error) : (setPlan(b.plan ?? []), setPlanError(null))))
      .catch((e) => setPlanError(String(e))), []);

  const loadAudience = useCallback(() =>
    fetch("/api/emails/audience", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => !b.error && setAudience(b))
      .catch(() => { /* the dashboard still works without list health */ }), []);

  useEffect(() => { void loadGhl(); void loadPlan(); void loadAudience(); }, [loadGhl, loadPlan, loadAudience]);

  async function savePlan(id: string, fields: Partial<PlanRow>) {
    setPlan((p) => p?.map((r) => (r.id === id ? { ...r, ...fields } : r)) ?? p);
    const res = await fetch("/api/emails/plan", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) { setPlanError((await res.json().catch(() => ({}))).error ?? "Save failed."); void loadPlan(); }
  }

  async function addPlan(fields: Partial<PlanRow>) {
    const res = await fetch("/api/emails/plan", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setPlanError(body.error ?? "Could not add."); return null; }
    await loadPlan();
    return body.row as PlanRow;
  }

  async function removePlan(id: string) {
    setPlan((p) => p?.filter((r) => r.id !== id) ?? p);
    const res = await fetch(`/api/emails/plan?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setPlanError("Delete failed."); void loadPlan(); }
  }

  return (
    <div className="space-y-5 p-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Emails</h1>
          <p className="mt-1 text-sm text-zinc-500">
            How the last 90 days performed, and what goes out next.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
          {([["dashboard", "Dashboard"], ["planner", "Planner"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                tab === k ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
      </header>

      {planError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="flex-1 text-sm text-red-300">{planError}</p>
          <button onClick={() => setPlanError(null)} className="text-xs text-red-400/70 hover:text-red-200">dismiss</button>
        </div>
      )}

      {tab === "dashboard"
        ? <Dashboard ghl={ghl} error={ghlError} plan={plan} audience={audience} />
        : <Planner ghl={ghl} plan={plan} onAdd={addPlan} onSave={savePlan} onRemove={removePlan} />}
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ ghl, error, plan, audience }: {
  ghl: GhlPayload | null; error: string | null; plan: PlanRow[] | null; audience: Audience | null;
}) {
  if (error) return <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>;
  if (!ghl) return <div className="h-72 animate-pulse rounded-2xl bg-zinc-900" />;

  const t = ghl.totals;
  if (t.campaigns === 0) {
    return <p className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
      No campaigns went out in the last 90 days.
    </p>;
  }

  // Engagement only exists if it was typed in, so it is computed over the sends
  // that actually have a figure rather than assuming zero for the rest.
  const byGhl = new Map((plan ?? []).filter((p) => p.ghl_schedule_id).map((p) => [p.ghl_schedule_id!, p]));
  const withOpens = ghl.sent.filter((c) => byGhl.get(c.id)?.opens != null);
  const openRate = withOpens.length
    ? withOpens.reduce((s, c) => s + (byGhl.get(c.id)!.opens! / Math.max(1, c.delivered)), 0) / withOpens.length
    : null;

  // The honest denominator. GHL reports a send as targeting every contact,
  // including the 7,000-odd with no email address, so delivered/targeted reads
  // like a catastrophe when delivery is in fact near perfect. Measure the last
  // send against the people who can actually receive email.
  const lastSend = ghl.sent[0];
  const deliveryOfMailable =
    audience?.mailable && lastSend ? Math.min(1, lastSend.delivered / audience.mailable) : null;

  // Is reach keeping up with the list? This is the question the numbers answer.
  const first = ghl.series[0];
  const last = ghl.series[ghl.series.length - 1];
  const rateDrift = first?.rate != null && last?.rate != null ? last.rate - first.rate : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Tile label="Campaigns" value={n(t.campaigns)} hint="sent in 90 days" />
        <Tile label="Delivered" value={n(t.delivered)} hint="emails that landed" accent="text-emerald-400" />
        <Tile label="Mailable list" value={audience?.mailable == null ? "—" : n(audience.mailable)}
          hint="can actually receive" accent="text-blue-400" />
        <Tile label="Delivery" value={pctText(deliveryOfMailable)} hint="of the mailable list"
          accent={(deliveryOfMailable ?? 1) >= 0.9 ? "text-emerald-400" : "text-amber-400"} />
        <Tile label="Avg per send" value={t.avg_delivered === null ? "—" : n(t.avg_delivered)} hint="people reached" />
        <Tile label="Cadence" value={t.cadence_days === null ? "—" : `${t.cadence_days}d`} hint="between sends" />
      </div>

      {audience && <ListHealth a={audience} lastDelivered={lastSend?.delivered ?? null} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Reach per send" sub="Delivered against every contact the send was pointed at, most of whom have no email address">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ghl.series} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayLabel} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "#ffffff08" }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
              <Bar dataKey="delivered" name="Delivered" stackId="a" fill="#34d399" isAnimationActive={false} />
              <Bar dataKey="not_delivered" name="Not delivered" stackId="a" fill="#3f3f46" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Share of contacts targeted" sub="Low by design: the target includes contacts with no address. Delivery against the mailable list is above.">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={ghl.series} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayLabel} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ChartTip suffix="%" />} cursor={{ stroke: "#52525b" }} />
              <Line type="monotone" dataKey="rate" name="Reach rate" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: "#60a5fa" }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Contact count against people reached" sub="The gap is almost entirely contacts with no email address, and it is widening"
          className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={ghl.series} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gList" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gReach" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayLabel} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip content={<ChartTip />} cursor={{ stroke: "#52525b" }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
              <Area type="monotone" dataKey="audience" name="On the list" stroke="#818cf8" fill="url(#gList)" strokeWidth={2} isAnimationActive={false} />
              <Area type="monotone" dataKey="delivered" name="Reached" stroke="#34d399" fill="url(#gReach)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Every send" sub={openRate === null
        ? "Opens and clicks are not in GoHighLevel's API. Add them by hand on the Sent tab and they appear here."
        : `Open rate across the ${withOpens.length} send${withOpens.length === 1 ? "" : "s"} you have recorded: ${pctText(openRate)}`}>
        <SentTable sent={ghl.sent} plan={plan} />
      </Panel>

      <p className="text-xs text-zinc-600">{ghl.note}</p>
    </div>
  );
}

function Tile({ label, value, hint, accent = "text-white" }: { label: string; value: string; hint: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">{label}</div>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="text-[11px] text-zinc-600">{hint}</p>
    </div>
  );
}

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {sub && <p className="mb-3 mt-0.5 text-xs text-zinc-500">{sub}</p>}
      {children}
    </section>
  );
}

function ChartTip({ active, payload, label, suffix = "" }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-zinc-300">{label ? dayLabel(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-zinc-400">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold tabular-nums text-white">{n(p.value)}{suffix}</span>
        </p>
      ))}
    </div>
  );
}

// ── Sent spreadsheet ─────────────────────────────────────────────────────────
function SentTable({ sent, plan, onSave }: {
  sent: GhlCampaign[]; plan: PlanRow[] | null;
  onSave?: (id: string, fields: Partial<PlanRow>) => void | Promise<void>;
}) {
  const byGhl = new Map((plan ?? []).filter((p) => p.ghl_schedule_id).map((p) => [p.ghl_schedule_id!, p]));
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-zinc-950/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Sent</th>
            <th className="px-3 py-2 font-medium">Campaign</th>
            <th className="px-3 py-2 font-medium">Subject</th>
            <th className="px-3 py-2 text-right font-medium">List</th>
            <th className="px-3 py-2 text-right font-medium">Delivered</th>
            <th className="px-3 py-2 text-right font-medium">Reach</th>
            <th className="px-3 py-2 text-right font-medium">Opens</th>
            <th className="px-3 py-2 text-right font-medium">Clicks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {sent.map((c) => {
            const linked = byGhl.get(c.id);
            const rate = c.delivery_rate ?? 0;
            return (
              <tr key={c.id} className="hover:bg-zinc-800/30">
                <td className="whitespace-nowrap px-3 py-2 text-zinc-400">{dayLabel(c.created_at)}</td>
                <td className="max-w-[260px] truncate px-3 py-2 font-medium text-white" title={c.name}>{c.name}</td>
                <td className="max-w-[280px] truncate px-3 py-2 text-zinc-400" title={c.subject ?? ""}>{c.subject ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{n(c.audience)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{n(c.delivered)}</td>
                <td className="px-3 py-2 text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1 ${
                    rate >= 0.6 ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                    : rate >= 0.4 ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                    : "bg-rose-500/15 text-rose-300 ring-rose-500/30"}`}>
                    {pctText(c.delivery_rate)}
                  </span>
                </td>
                <NumCell value={linked?.opens ?? null} editable={Boolean(onSave && linked)}
                  onCommit={(v) => linked && onSave?.(linked.id, { opens: v })} />
                <NumCell value={linked?.clicks ?? null} editable={Boolean(onSave && linked)}
                  onCommit={(v) => linked && onSave?.(linked.id, { clicks: v })} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Blank means not recorded. It never shows 0 for something nobody has counted. */
function NumCell({ value, editable, onCommit }: {
  value: number | null; editable: boolean; onCommit: (v: number | null) => void;
}) {
  if (!editable) {
    return <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{value === null ? "—" : n(value)}</td>;
  }
  return (
    <td className="px-3 py-2 text-right">
      <input
        defaultValue={value ?? ""} inputMode="numeric" placeholder="—"
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const next = raw === "" ? null : Number(raw.replace(/[^\d]/g, ""));
          if (next !== value) onCommit(Number.isFinite(next as number) ? next : null);
        }}
        className="w-20 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-right text-xs tabular-nums text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
      />
    </td>
  );
}

// ── Planner ──────────────────────────────────────────────────────────────────
function Planner({ ghl, plan, onAdd, onSave, onRemove }: {
  ghl: GhlPayload | null; plan: PlanRow[] | null;
  onAdd: (f: Partial<PlanRow>) => Promise<PlanRow | null>;
  onSave: (id: string, f: Partial<PlanRow>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [view, setView] = useState<"upcoming" | "calendar" | "sent">("upcoming");

  if (!plan) return <div className="h-72 animate-pulse rounded-2xl bg-zinc-900" />;

  const upcoming = plan.filter((r) => r.status !== "sent" && r.status !== "skipped");
  const done = plan.filter((r) => r.status === "sent" || r.status === "skipped");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
        {([["upcoming", `Going out${upcoming.length ? ` · ${upcoming.length}` : ""}`],
           ["calendar", "Calendar"],
           ["sent", `Sent${ghl ? ` · ${ghl.sent.length}` : ""}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              view === k ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
            {l}
          </button>
        ))}
      </div>

      {view === "upcoming" && <UpcomingGrid rows={upcoming} archived={done} onAdd={onAdd} onSave={onSave} onRemove={onRemove} />}
      {view === "calendar" && <CalendarView plan={plan} sent={ghl?.sent ?? []} onAdd={onAdd} onSave={onSave} />}
      {view === "sent" && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-white">What has gone out</h3>
          <p className="mb-3 mt-0.5 text-xs text-zinc-500">
            Live from GoHighLevel. Opens and clicks are not in its API, so type them in from GHL and they
            roll into the dashboard. Blank stays blank rather than counting as zero.
          </p>
          <SentTable sent={ghl?.sent ?? []} plan={plan} onSave={onSave} />
          <MatchHint plan={plan} sent={ghl?.sent ?? []} onSave={onSave} />
        </section>
      )}
    </div>
  );
}

/** Links a planned row to the real send so opens and clicks have somewhere to live. */
function MatchHint({ plan, sent, onSave }: {
  plan: PlanRow[]; sent: GhlCampaign[]; onSave: (id: string, f: Partial<PlanRow>) => Promise<void>;
}) {
  const unlinkedSends = sent.filter((c) => !plan.some((p) => p.ghl_schedule_id === c.id));
  const linkable = plan.filter((p) => !p.ghl_schedule_id);
  if (unlinkedSends.length === 0 || linkable.length === 0) return null;
  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="mb-2 text-xs text-zinc-500">
        Match a send to something you planned, and its opens and clicks become editable above.
      </p>
      <div className="space-y-1.5">
        {unlinkedSends.slice(0, 6).map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="truncate text-zinc-300" style={{ maxWidth: 260 }}>{c.name}</span>
            <span className="text-zinc-600">{dayLabel(c.created_at)}</span>
            <select defaultValue="" onChange={(e) => e.target.value && onSave(e.target.value, { ghl_schedule_id: c.id, status: "sent" })}
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300">
              <option value="">link to…</option>
              {linkable.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Upcoming spreadsheet ─────────────────────────────────────────────────────
function UpcomingGrid({ rows, archived, onAdd, onSave, onRemove }: {
  rows: PlanRow[]; archived: PlanRow[];
  onAdd: (f: Partial<PlanRow>) => Promise<PlanRow | null>;
  onSave: (id: string, f: Partial<PlanRow>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = showArchived ? [...rows, ...archived] : rows;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">What is going out</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Edit any cell. It saves as you go. You build and send in GoHighLevel; this is the plan around it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            show sent and skipped
          </label>
          <button onClick={() => setAdding(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500">
            + Add email
          </button>
        </div>
      </div>

      {adding && <AddRow onCancel={() => setAdding(false)} onAdd={async (f) => { await onAdd(f); setAdding(false); }} />}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-zinc-950/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Subject line</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Link</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {list.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-800/30">
                <td className="px-2 py-1.5">
                  <input type="date" defaultValue={r.planned_date ?? ""}
                    onBlur={(e) => e.target.value !== (r.planned_date ?? "") && onSave(r.id, { planned_date: e.target.value || null })}
                    className="w-[130px] rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-zinc-300 hover:border-zinc-700 focus:border-blue-500 focus:outline-none" />
                </td>
                <Cell value={r.title} width={200} bold onCommit={(v) => v && onSave(r.id, { title: v })} />
                <Cell value={r.subject ?? ""} width={230} placeholder="subject line" onCommit={(v) => onSave(r.id, { subject: v || null })} />
                <td className="px-2 py-1.5">
                  <select value={r.kind} onChange={(e) => onSave(r.id, { kind: e.target.value })}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${KIND_STYLE[r.kind] ?? KIND_STYLE.nurture}`}>
                    {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select value={r.status} onChange={(e) => onSave(r.id, { status: e.target.value })}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS_STYLE[r.status] ?? STATUS_STYLE.idea}`}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  {r.link_url
                    ? <a href={r.link_url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">open ↗</a>
                    : <Cell value="" width={90} placeholder="paste url" onCommit={(v) => v && onSave(r.id, { link_url: v })} inline />}
                </td>
                <Cell value={r.notes ?? ""} width={200} placeholder="notes" onCommit={(v) => onSave(r.id, { notes: v || null })} />
                <td className="px-1">
                  <button onClick={() => onRemove(r.id)} title="Delete"
                    className="rounded px-1.5 py-1 text-xs text-zinc-700 hover:bg-rose-500/10 hover:text-rose-400">✕</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-zinc-500">
                Nothing planned yet. Add the email that follows your next video or promo.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({ value, width, placeholder, bold, inline, onCommit }: {
  value: string; width: number; placeholder?: string; bold?: boolean; inline?: boolean;
  onCommit: (v: string) => void;
}) {
  const input = (
    <input defaultValue={value} placeholder={placeholder}
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value.trim())}
      style={{ width }}
      className={`rounded border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-zinc-700 focus:border-blue-500 focus:outline-none placeholder:text-zinc-700 ${
        bold ? "font-medium text-white" : "text-zinc-300"}`} />
  );
  return inline ? input : <td className="px-2 py-1.5">{input}</td>;
}

function AddRow({ onAdd, onCancel }: { onAdd: (f: Partial<PlanRow>) => void; onCancel: () => void }) {
  const [f, setF] = useState<Partial<PlanRow>>({ kind: "youtube", status: "idea", planned_date: new Date().toISOString().slice(0, 10) });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (String(f.title ?? "").trim()) onAdd(f); }}
      className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-3">
      <Field label="Date">
        <input type="date" value={f.planned_date ?? ""} onChange={(e) => setF({ ...f, planned_date: e.target.value })}
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200" />
      </Field>
      <Field label="Title" grow>
        <input autoFocus value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder="e.g. New video: the 3-call week"
          className="w-full min-w-[220px] rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200" />
      </Field>
      <Field label="Type">
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200">
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </Field>
      <Field label="Link">
        <input value={f.link_url ?? ""} onChange={(e) => setF({ ...f, link_url: e.target.value })}
          placeholder="youtube or offer url"
          className="w-48 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200" />
      </Field>
      <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500">Add</button>
      <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400">Cancel</button>
    </form>
  );
}

function Field({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <label className={grow ? "flex-1" : ""}>
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────
// Planned and already-sent on one grid, because the useful question is "what
// does this month look like", not "what is in each system".
function CalendarView({ plan, sent, onAdd, onSave }: {
  plan: PlanRow[]; sent: GhlCampaign[];
  onAdd: (f: Partial<PlanRow>) => Promise<PlanRow | null>;
  onSave: (id: string, f: Partial<PlanRow>) => Promise<void>;
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [addingOn, setAddingOn] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const todayKey = new Date().toISOString().slice(0, 10);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // weeks run Monday
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { key, day: d.getDate(), inMonth: d.getMonth() === month };
    });
  }, [year, month]);

  const plannedBy = useMemo(() => {
    const m = new Map<string, PlanRow[]>();
    for (const r of plan) {
      if (!r.planned_date || r.status === "sent") continue;
      const k = r.planned_date.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  }, [plan]);

  const sentBy = useMemo(() => {
    const m = new Map<string, GhlCampaign[]>();
    for (const c of sent) {
      const k = c.created_at.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [sent]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  async function commitDraft(dateKey: string) {
    const title = draft.trim();
    setDraft(""); setAddingOn(null);
    if (title) await onAdd({ title, planned_date: dateKey, status: "idea", kind: "youtube" });
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-lg border border-zinc-800 px-2.5 py-1 text-sm text-zinc-400 hover:text-white">←</button>
          <h3 className="min-w-[160px] text-center text-sm font-semibold text-white">{monthLabel}</h3>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-lg border border-zinc-800 px-2.5 py-1 text-sm text-zinc-400 hover:text-white">→</button>
          <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}
            className="ml-1 rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:text-white">Today</button>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-400" /> planned</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-400" /> sent</span>
          <span className="text-zinc-600">click a day to add</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-zinc-950 px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500">{d}</div>
        ))}
        {cells.map((c) => {
          const planned = plannedBy.get(c.key) ?? [];
          const done = sentBy.get(c.key) ?? [];
          const isToday = c.key === todayKey;
          return (
            <div key={c.key}
              onClick={() => { setAddingOn(c.key); setDraft(""); }}
              className={`min-h-[92px] cursor-pointer p-1.5 transition ${
                c.inMonth ? "bg-zinc-900 hover:bg-zinc-800/60" : "bg-zinc-950/60"}`}>
              <div className={`mb-1 text-[11px] tabular-nums ${
                isToday ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 font-bold text-white"
                : c.inMonth ? "text-zinc-500" : "text-zinc-700"}`}>{c.day}</div>

              {done.map((s) => (
                <div key={s.id} title={`${s.name} · ${n(s.delivered)} delivered`}
                  className="mb-1 truncate rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300 ring-1 ring-emerald-500/25">
                  {s.name}
                </div>
              ))}
              {planned.map((p) => (
                <div key={p.id} title={p.subject ?? p.title}
                  onClick={(e) => { e.stopPropagation(); void onSave(p.id, { status: p.status === "idea" ? "drafted" : p.status }); }}
                  className={`mb-1 truncate rounded px-1.5 py-0.5 text-[10px] ring-1 ${KIND_STYLE[p.kind] ?? KIND_STYLE.nurture}`}>
                  {p.title}
                </div>
              ))}

              {addingOn === c.key && (
                <input autoFocus value={draft} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void commitDraft(c.key)}
                  onKeyDown={(e) => { if (e.key === "Enter") void commitDraft(c.key); if (e.key === "Escape") { setDraft(""); setAddingOn(null); } }}
                  placeholder="email title"
                  className="w-full rounded border border-blue-500 bg-zinc-950 px-1 py-0.5 text-[10px] text-white focus:outline-none" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── List health ──────────────────────────────────────────────────────────────
// The part the send stats cannot tell you. Delivery is fine; the constraint is
// how few contacts are reachable by email in the first place.
function ListHealth({ a, lastDelivered }: { a: Audience; lastDelivered: number | null }) {
  const contacts = a.contacts ?? 0;
  const mailable = a.mailable ?? 0;
  if (!contacts || !mailable) return null;

  const delivered = lastDelivered ?? 0;
  const deliveryPct = mailable > 0 ? Math.min(1, delivered / mailable) : null;
  const noEmailShare = a.no_email != null ? a.no_email / contacts : null;
  const unsubShare = a.unsubscribed != null && a.with_email ? a.unsubscribed / a.with_email : null;

  const segments = [
    { label: "Mailable", value: mailable, color: "bg-emerald-500", text: "text-emerald-300" },
    { label: "Unsubscribed", value: a.unsubscribed ?? 0, color: "bg-amber-500", text: "text-amber-300" },
    { label: "Bad address", value: a.invalid_email ?? 0, color: "bg-rose-500", text: "text-rose-300" },
    { label: "No email on file", value: a.no_email ?? 0, color: "bg-zinc-600", text: "text-zinc-400" },
  ].filter((s) => s.value > 0);
  const segTotal = segments.reduce((n, s) => n + s.value, 0) || 1;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Who you can actually email</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {n(contacts)} contacts in GoHighLevel, of which {n(mailable)} can receive email.
            {deliveryPct !== null && (
              <> The last send reached {n(delivered)} of them, so delivery is running at{" "}
                <span className="font-semibold text-emerald-300">{pctText(deliveryPct)}</span>.</>
            )}
          </p>
        </div>
      </div>

      <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-zinc-950">
        {segments.map((s) => (
          <div key={s.label} className={s.color} style={{ width: `${(s.value / segTotal) * 100}%` }} title={`${s.label}: ${n(s.value)}`} />
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-zinc-500">
            <span className={`h-2 w-2 rounded-sm ${s.color}`} />
            <span className={s.text}>{n(s.value)}</span> {s.label}
          </span>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {noEmailShare !== null && noEmailShare > 0.15 && (
          <Finding tone="blue" title={`${n(a.no_email ?? 0)} contacts have no email address`}>
            That is {pctText(noEmailShare)} of the database, and it is the ceiling on this channel. Every one of
            them is someone you already have who cannot be reached by email at all. Capturing addresses moves
            the list more than anything you can change about the sending.
          </Finding>
        )}
        {unsubShare !== null && unsubShare > 0.15 && (
          <Finding tone="amber" title={`${n(a.unsubscribed ?? 0)} have unsubscribed`}>
            That is {pctText(unsubShare)} of everyone with an email on file. This is the number worth watching
            per send, because unlike a missing address it does not come back.
          </Finding>
        )}
        {(a.invalid_email ?? 0) > 0 && (
          <Finding tone="rose" title={`${n(a.invalid_email ?? 0)} addresses are invalid`}>
            GoHighLevel has marked these as not deliverable. Mistyped domains are the usual cause, and they
            are worth correcting rather than leaving to bounce.
          </Finding>
        )}
        {deliveryPct !== null && deliveryPct >= 0.9 && (
          <Finding tone="emerald" title="Deliverability is not the problem">
            Against the list that can receive email, the last send landed {pctText(deliveryPct)}. The large
            &ldquo;failed&rdquo; count GoHighLevel reports is almost entirely contacts with no address, not
            bounces.
          </Finding>
        )}
      </div>
    </section>
  );
}

const TONE: Record<string, string> = {
  blue: "border-blue-500/25 bg-blue-500/[0.06] text-blue-300",
  amber: "border-amber-500/25 bg-amber-500/[0.06] text-amber-300",
  rose: "border-rose-500/25 bg-rose-500/[0.06] text-rose-300",
  emerald: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300",
};

function Finding({ tone, title, children }: { tone: keyof typeof TONE; title: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-3 ${TONE[tone]}`}>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-zinc-300">{children}</p>
    </div>
  );
}
