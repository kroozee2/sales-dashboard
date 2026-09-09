"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ClientOnboarding, { type Patch } from "@/components/client-onboarding";
import ClientMembers from "@/components/client-members";
import ClientDetailDrawer from "@/components/client-detail-drawer";
import { HEALTH_META, needsAttention, rosterCounts, statusToHealth } from "@/lib/client-roster";
import {
  recentClients, sortByNewest,
  type MergedClient, type OnboardingStepKey,
} from "@/lib/client-accounts";
import {
  bucketCalendarEvents,
  calendarDays,
  helmClientUrl,
  localDate,
  monthRange,
  type CalendarFilter,
  type ClientsPayload,
  type ClientTab,
} from "@/lib/clients";

const CALENDAR_FILTERS: CalendarFilter[] = ["All", "1:1", "Group"];
const HELM_URL = process.env.NEXT_PUBLIC_HELM_URL || "https://helm-iota-five.vercel.app";

function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "Not recorded";
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return parsed.toLocaleDateString("en-US", options ?? { month: "short", day: "numeric", year: "numeric" });
}

function eventTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function statusTone(status: string | null) {
  const key = (status ?? "").toLowerCase();
  if (key.includes("risk")) return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  if (key.includes("off-track") || key.includes("off track")) return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (key.includes("onboard") || key.includes("not started")) return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (key.includes("off-board") || key.includes("offboard")) return "border-zinc-700 bg-zinc-800 text-zinc-400";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
}

function StatCard({ label, value, detail, tone = "text-white" }: { label: string; value: number | string; detail: string; tone?: string }) {
  return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-5 py-10 text-center text-sm text-zinc-500">{children}</div>;
}

/** One bar per health bucket, the way Helm's Dashboards reads the roster. */
function HealthBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="flex items-center gap-1.5 text-zinc-300">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />{label}
        </span>
        <span className="tabular-nums text-zinc-500"><span className="font-bold text-white">{value}</span> · {pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/**
 * A KPI with the number it is supposed to hit, so a figure means something
 * without you remembering the target. Helm's fulfilment tiles work this way.
 */
function KpiTile({ icon, label, value, target, good, sub }: {
  icon: string; label: string; value: string; target: string; good: boolean; sub?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${good ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-amber-500/25 bg-amber-500/[0.05]"}`}>
      <p className="text-xs font-semibold text-zinc-400">{icon} {label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${good ? "text-emerald-300" : "text-amber-300"}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-zinc-600">Target {target}{sub ? ` · ${sub}` : ""}</p>
    </div>
  );
}

function Dashboard({ data, clients, onOpen }: { data: ClientsPayload; clients: MergedClient[]; onOpen: (client: MergedClient) => void }) {
  // The payload carries when it was built; use that rather than reading the
  // clock during render, so the numbers agree with the rest of the page.
  const asOf = useMemo(() => new Date(data.generatedAt), [data.generatedAt]);
  const d = data.dashboard;
  const adoption = d.activeClients > 0 ? Math.round((d.portalActive / d.activeClients) * 100) : 0;
  const now = Date.parse(data.generatedAt);
  const upcoming = data.calendar.filter((event) => {
    if (event.startsAt) {
      const timestamp = Date.parse(event.startsAt);
      return timestamp >= now && timestamp <= now + 7 * 86_400_000;
    }
    const today = localDate(new Date());
    const nextWeek = localDate(new Date(now + 7 * 86_400_000));
    return event.callDate >= today && event.callDate <= nextWeek;
  }).slice(0, 8);

  const counts = rosterCounts(clients, asOf);
  const live = clients.filter((c) => statusToHealth(c.status) !== "idle");
  const attention = clients.filter((c) => needsAttention(c, asOf));
  const contacted14 = live.filter((c) => {
    const at = c.helm?.lastContactAt;
    return at ? (asOf.getTime() - Date.parse(at)) / 86400000 <= 14 : false;
  }).length;
  const contactPct = live.length ? Math.round((contacted14 / live.length) * 100) : 0;
  const riskPct = live.length ? Math.round(((counts.risk + counts.offtrack) / live.length) * 100) : 0;
  const withCalls = live.filter((c) => (c.helm?.callsAttended ?? 0) > 0).length;
  const attendPct = live.length ? Math.round((withCalls / live.length) * 100) : 0;
  const recurring = clients.reduce((sum, c) => sum + (c.mrr ?? 0), 0);

  return <div className="space-y-5">
    {/* The three fulfilment numbers, each against the number it should hit */}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile icon="🤝" label="Contacted ≤ 14d" value={`${contactPct}%`} target="> 85%" good={contactPct >= 85}
        sub={`${contacted14} of ${live.length}`} />
      <KpiTile icon="👥" label="Attending calls" value={`${attendPct}%`} target="> 60%" good={attendPct >= 60}
        sub={`${withCalls} of ${live.length}`} />
      <KpiTile icon="🚊" label="At Risk / Off-Track" value={`${riskPct}%`} target="< 25%" good={riskPct < 25}
        sub={`${counts.risk + counts.offtrack} clients`} />
      <KpiTile icon="🔁" label="Client MRR" value={recurring >= 1000 ? `$${Math.round(recurring / 1000)}k` : `$${recurring}`}
        target="tracked here" good sub={`${clients.filter((c) => c.mrr).length} on a plan`} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
        <h2 className="font-semibold text-white">Roster health</h2>
        <p className="mb-4 text-xs text-zinc-500">{live.length} active clients</p>
        <div className="space-y-3">
          <HealthBar label="At Risk" value={counts.risk} max={live.length} color={HEALTH_META.risk.dot} />
          <HealthBar label="Off-Track" value={counts.offtrack} max={live.length} color={HEALTH_META.watch.dot} />
          <HealthBar label="On Track" value={counts.ontrack} max={live.length} color={HEALTH_META.good.dot} />
          <HealthBar label="Onboarding" value={counts.onboarding} max={live.length} color="#60a5fa" />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="font-semibold text-white">Needs you now</h2><p className="text-xs text-zinc-500">At risk, off-track, or a fortnight of silence</p></div>
          <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300">{attention.length}</span>
        </div>
        {attention.length === 0 ? <Empty>All clear. Nobody is at risk, off-track or overdue a conversation.</Empty> : (
          <div className="space-y-2">
            {attention.slice(0, 8).map((client) => (
              <button key={client.key} type="button" onClick={() => onOpen(client)}
                className="block w-full rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-left transition hover:border-zinc-600">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{client.name}</p>
                    <p className="truncate text-xs text-zinc-500">{client.program || "No program"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${HEALTH_META[statusToHealth(client.status)].chip}`}>
                    {client.status || "No status"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Active clients" value={d.activeClients} detail={`${d.onboarding} onboarding`} />
      <StatCard label="Needs attention" value={d.atRisk + d.offTrack} detail={`${d.atRisk} at risk · ${d.offTrack} off-track`} tone={d.atRisk + d.offTrack ? "text-rose-300" : "text-emerald-300"} />
      <StatCard label="Contact overdue" value={d.overdueContact} detail="14+ days since recorded contact" tone={d.overdueContact ? "text-amber-300" : "text-emerald-300"} />
      <StatCard label="Portal adoption" value={`${adoption}%`} detail={`${d.portalActive} active · ${d.portalInvited} invited`} tone="text-blue-300" />
      <StatCard label="Calls next 7 days" value={d.upcoming7Days} detail="1:1 and group calls" />
      <StatCard label="Open support" value={d.openSupport} detail="Not closed or resolved" tone={d.openSupport ? "text-amber-300" : "text-emerald-300"} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-white">Needs Attention</h2><p className="text-xs text-zinc-500">Prioritized by risk and contact gap</p></div><span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300">{d.attention.length}</span></div>
        {d.attention.length === 0 ? <Empty>No active clients currently meet an attention rule.</Empty> : <div className="space-y-2">
          {d.attention.map((item) => <a key={item.id} href={helmClientUrl(HELM_URL, item.id)} target="_blank" rel="noreferrer" className="block rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 transition hover:border-zinc-600">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium text-white">{item.name}</p><p className="truncate text-xs text-zinc-500">{item.membership || "Program not recorded"}</p></div><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${statusTone(item.status)}`}>{item.status || "No status"}</span></div>
            <div className="mt-2 flex flex-wrap gap-1.5">{item.reasons.map((reason) => <span key={reason} className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">{reason}</span>)}</div>
            {item.nextAction && <p className="mt-2 text-xs text-blue-300">Next: {item.nextAction}</p>}
          </a>)}
        </div>}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
        <div className="mb-4"><h2 className="font-semibold text-white">Upcoming 7 Days</h2><p className="text-xs text-zinc-500">Current Helm calendar</p></div>
        {upcoming.length === 0 ? <Empty>No calendar items returned for the next seven days.</Empty> : <div className="space-y-2">{upcoming.map((event) => <div key={event.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-white">{event.title}</p>{event.clientName && <p className="text-xs text-zinc-500">{event.clientName}</p>}</div><span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-300">{event.isGroup ? "Group" : "1:1"}</span></div><p className="mt-2 text-xs text-zinc-400">{formatDate(`${event.callDate}T12:00:00`, { weekday: "short", month: "short", day: "numeric" })}{eventTime(event.startsAt) ? ` · ${eventTime(event.startsAt)}` : ""}</p></div>)}</div>}
      </section>
    </div>
  </div>;
}

function Calendar({ month, setMonth, events }: { month: Date; setMonth: (date: Date) => void; events: ClientsPayload["calendar"] }) {
  const [filter, setFilter] = useState<CalendarFilter>("All");
  const buckets = useMemo(() => bucketCalendarEvents(events, filter), [events, filter]);
  const days = useMemo(() => calendarDays(month), [month]);
  const visible = [...buckets.values()].flat();
  const move = (offset: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2"><button onClick={() => move(-1)} aria-label="Previous month" className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-300 hover:bg-zinc-800">←</button><button onClick={() => setMonth(new Date())} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800">Today</button><button onClick={() => move(1)} aria-label="Next month" className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-300 hover:bg-zinc-800">→</button></div>
      <h2 className="text-lg font-semibold text-white">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
      <div className="flex rounded-xl border border-zinc-700 bg-zinc-950 p-1" aria-label="Calendar type filter">{CALENDAR_FILTERS.map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === value ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-200"}`} aria-pressed={filter === value}>{value}</button>)}</div>
    </div>

    <div className="hidden overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 md:block">
      <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-950/50">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-zinc-600">{day}</div>)}</div>
      <div className="grid grid-cols-7">{days.map((day) => { const key = localDate(day); const rows = buckets.get(key) ?? []; const current = day.getMonth() === month.getMonth(); const today = key === localDate(new Date()); return <div key={key} aria-label={`${formatDate(`${key}T12:00:00`, { month: "long", day: "numeric" })}: ${rows.length ? rows.map((event) => event.title).join(", ") : "No events"}`} className={`min-h-28 border-b border-r border-zinc-800 p-2 ${current ? "bg-zinc-900/20" : "bg-zinc-950/40"}`}><div className={`mb-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs ${today ? "bg-blue-600 font-bold text-white" : current ? "text-zinc-300" : "text-zinc-700"}`}>{day.getDate()}</div><div className="space-y-1">{rows.slice(0, 3).map((event) => <div key={event.id} title={event.title} className={`truncate rounded-md border px-1.5 py-1 text-[10px] ${event.isGroup ? "border-violet-500/30 bg-violet-500/10 text-violet-200" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{eventTime(event.startsAt) ? `${eventTime(event.startsAt)} · ` : ""}{event.title}</div>)}{rows.length > 3 && <p className="text-[10px] text-zinc-500">+{rows.length - 3} more</p>}</div></div>; })}</div>
    </div>

    <div className="space-y-3 md:hidden">{visible.length === 0 ? <Empty>No calls scheduled in this calendar view.</Empty> : [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => <section key={date} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><h3 className="mb-3 text-sm font-semibold text-white">{formatDate(`${date}T12:00:00`, { weekday: "long", month: "short", day: "numeric" })}</h3><div className="space-y-2">{rows.map((event) => <div key={event.id} className="rounded-xl bg-zinc-950/70 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-white">{event.title}</p>{event.clientName && <p className="text-xs text-zinc-500">{event.clientName}</p>}</div><span className="text-xs text-zinc-400">{eventTime(event.startsAt) || "Time not recorded"}</span></div></div>)}</div></section>)}</div>
  </div>;
}

export default function ClientsWorkspace({ view }: { view: ClientTab }) {
  const [month, setMonth] = useState(() => new Date());
  const [data, setData] = useState<ClientsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [roster, setRoster] = useState<MergedClient[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(60);
  const [openClient, setOpenClient] = useState<MergedClient | null>(null);
  const requestId = useRef(0);
  const range = useMemo(() => monthRange(month), [month]);

  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    fetch(`/api/clients?from=${range.from}&to=${range.to}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Client data is temporarily unavailable."); return response.json() as Promise<ClientsPayload>; })
      .then((payload) => { if (requestId.current === id) setData(payload); })
      .catch((reason: unknown) => { if (requestId.current === id && !(reason instanceof DOMException && reason.name === "AbortError")) setError("Client data is temporarily unavailable."); })
      .finally(() => { if (requestId.current === id) setLoading(false); });
    return () => controller.abort();
  }, [range.from, range.to, refreshKey]);

  const loadRoster = useCallback(async () => {
    try {
      const response = await fetch("/api/clients/accounts", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setRoster(payload.clients ?? []);
      else setNotice(typeof payload.error === "string" ? payload.error : null);
    } catch { setNotice("The client roster is temporarily unavailable."); }
  }, []);
  useEffect(() => { void Promise.resolve().then(loadRoster); }, [loadRoster, refreshKey]);

  // One list, from one table. There is no merge any more: a client is a single
  // row that Sales OS, Helm and the Mastermind Portal all read and write.
  const merged = useMemo(() => sortByNewest(roster), [roster]);
  const newest = useMemo(() => recentClients(merged, windowDays), [merged, windowDays]);

  const applyClient = (client: MergedClient) =>
    setRoster((current) => current.some((c) => c.key === client.key)
      ? current.map((c) => (c.key === client.key ? client : c))
      : [client, ...current]);

  /** Every edit lands on the client's own row, which is the only row there is. */
  const patchClient = useCallback(async (client: MergedClient, patch: Patch) => {
    const fields = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "__create"));
    if (Object.keys(fields).length === 0) return;
    setBusyKey(client.key); setNotice(null);
    try {
      const response = await fetch("/api/clients/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: client.key, ...fields }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.client) throw new Error(payload.error ?? "Could not save the change");
      applyClient(payload.client as MergedClient);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not save the change");
    } finally { setBusyKey(null); }
  }, []);

  const stepClient = useCallback(async (client: MergedClient, key: OnboardingStepKey, done: boolean, note?: string) => {
    setBusyKey(client.key); setNotice(null);
    try {
      const response = await fetch("/api/clients/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: client.key, step: { key, done, note } }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.client) throw new Error(payload.error ?? "Could not save that step");
      applyClient(payload.client as MergedClient);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not save that step");
    } finally { setBusyKey(null); }
  }, []);

  const createClient = useCallback(async (draft: Record<string, unknown>) => {
    setNotice(null);
    try {
      const response = await fetch("/api/clients/accounts", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok || !payload.client) throw new Error(payload.error ?? "Could not add the client");
      applyClient(payload.client as MergedClient);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not add the client");
    }
  }, []);

  const changeMonth = (next: Date) => {
    const nextRange = monthRange(next);
    setData(null);
    setLoading(true);
    setError(null);
    if (nextRange.from === range.from && nextRange.to === range.to) setRefreshKey((value) => value + 1);
    setMonth(next);
  };

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">Client Success</p><h1 className="mt-1 text-3xl font-bold text-white">Clients</h1><p className="mt-1 text-sm text-zinc-500">Performance, members, and calls in one operational view.</p></div><a href={HELM_URL} target="_blank" rel="noreferrer" className="self-start rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white">Open Helm ↗</a></header>

    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-blue-200">
      <strong>Helm owns fulfilment; Sales OS owns the deal.</strong> Programme, deal value, MRR, status, owner, notes and the
      onboarding runbook are edited here. Attendance, portal state and last contact come from Helm and stay read-only there.
    </div>
    {notice && <p role="status" className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">{notice}</p>}

    <section aria-label={`Clients ${view}`}>
      {view === "New" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Newest clients</h2>
              <p className="text-xs text-zinc-500">Everyone who started recently, and the runbook that gets them onboarded.</p>
            </div>
            <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
              {[30, 60, 90, 365].map((days) => (
                <button key={days} type="button" onClick={() => setWindowDays(days)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${windowDays === days ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {days === 365 ? "1 year" : `${days}d`}
                </button>
              ))}
            </div>
          </div>
          <ClientOnboarding clients={newest} loading={loading && roster.length === 0} busyKey={busyKey}
            onPatch={patchClient} onCreate={createClient} onStep={stepClient} />
          {error && <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">Helm is unreachable, so only clients tracked in Sales OS are listed. {error}</p>}
        </div>
      ) : loading ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Loading client workspace">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60" />)}</div> : error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-10 text-center text-sm text-rose-200">{error}</div> : data ? <div className="transition">{view === "Dashboard" ? <Dashboard data={data} clients={merged} onOpen={setOpenClient} /> : view === "Members" ? <ClientMembers clients={merged} busyKey={busyKey} onPatch={patchClient} onOpen={setOpenClient} helmUrl={HELM_URL} /> : <Calendar month={month} setMonth={changeMonth} events={data.calendar} />}</div> : <Empty>No client data returned.</Empty>}
    </section>
    {openClient && (
      <ClientDetailDrawer
        key={openClient.key}
        client={merged.find((c) => c.key === openClient.key) ?? openClient}
        onClose={() => setOpenClient(null)}
        onPatch={patchClient}
        helmUrl={HELM_URL}
      />
    )}
    {data && <p className="text-right text-[11px] text-zinc-700">Updated {formatDate(data.generatedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
  </div>;
}
