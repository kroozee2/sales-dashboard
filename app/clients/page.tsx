"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CLIENT_TABS,
  bucketCalendarEvents,
  calendarDays,
  contactAgeDays,
  filterAndSortMembers,
  helmClientUrl,
  localDate,
  monthRange,
  type CalendarFilter,
  type ClientMember,
  type ClientsPayload,
  type ClientTab,
  type MemberFilter,
  type MemberSort,
} from "@/lib/clients";

const MEMBER_FILTERS: MemberFilter[] = ["All active", "Onboarding", "At Risk", "Off-Track", "Off-boarded"];
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

function Dashboard({ data }: { data: ClientsPayload }) {
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

  return <div className="space-y-5">
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

function MemberCard({ member }: { member: ClientMember }) {
  const age = contactAgeDays(member);
  const initials = member.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <a href={helmClientUrl(HELM_URL, member.id)} target="_blank" rel="noreferrer" className="block rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 transition hover:border-zinc-600 hover:bg-zinc-900">
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-xs font-bold text-white">{initials}</div>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate font-semibold text-white">{member.name}</p><span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(member.status)}`}>{member.status || "No status"}</span></div><p className="truncate text-xs text-zinc-500">{member.membership || "Program not recorded"}{member.phase ? ` · ${member.phase}` : ""}</p></div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><div><p className="text-zinc-600">Last contact</p><p className="mt-0.5 text-zinc-300">{age === null ? "No contact recorded" : age === 0 ? "Today" : `${age}d ago`}</p></div><div><p className="text-zinc-600">Portal</p><p className="mt-0.5 capitalize text-zinc-300">{member.portalStatus.replace("_", " ")}</p></div><div><p className="text-zinc-600">Attendance</p><p className="mt-0.5 text-zinc-300">{member.callsAttended} calls</p></div><div><p className="text-zinc-600">Last call</p><p className="mt-0.5 text-zinc-300">{formatDate(member.lastCallAt, { month: "short", day: "numeric" })}</p></div></div>
    {member.aiNextAction && <p className="mt-3 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-200">Next: {member.aiNextAction}</p>}
    <p className="mt-3 text-right text-[11px] font-medium text-zinc-600">Open in Helm ↗</p>
  </a>;
}

function Members({ members }: { members: ClientMember[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("All active");
  const [sort, setSort] = useState<MemberSort>("urgency");
  const rows = useMemo(() => filterAndSortMembers([...members], filter, sort, query), [members, filter, sort, query]);
  return <div className="space-y-4">
    <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 lg:grid-cols-[1fr_auto_auto]">
      <label className="sr-only" htmlFor="member-search">Search members</label><input id="member-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, program, or status" className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500" />
      <label className="sr-only" htmlFor="member-filter">Filter members</label><select id="member-filter" value={filter} onChange={(event) => setFilter(event.target.value as MemberFilter)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500">{MEMBER_FILTERS.map((value) => <option key={value}>{value}</option>)}</select>
      <label className="sr-only" htmlFor="member-sort">Sort members</label><select id="member-sort" value={sort} onChange={(event) => setSort(event.target.value as MemberSort)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500"><option value="urgency">Most urgent</option><option value="name">Name</option><option value="last-contact">Recent contact</option></select>
    </div>
    <div className="flex items-center justify-between text-xs text-zinc-500"><span>{rows.length} members</span><span>Read-only, opens Helm to update</span></div>
    {rows.length === 0 ? <Empty>No members match these filters.</Empty> : <div className="grid gap-3 xl:grid-cols-2">{rows.map((member) => <MemberCard key={member.id} member={member} />)}</div>}
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

export default function ClientsPage() {
  const [tab, setTab] = useState<ClientTab>("Dashboard");
  const [month, setMonth] = useState(() => new Date());
  const [data, setData] = useState<ClientsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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

    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-blue-200"><strong>Helm is the source of truth.</strong> This workspace is read-only so client records stay synchronized.</div>

    <div role="tablist" aria-label="Client workspace" aria-orientation="horizontal" className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/70 p-1.5 no-scrollbar">{CLIENT_TABS.map((value, index) => {
      const selected = tab === value;
      const slug = value.toLowerCase();
      return <button key={value} id={`clients-tab-${slug}`} role="tab" aria-selected={selected} aria-controls={`clients-panel-${slug}`} tabIndex={selected ? 0 : -1} onClick={() => setTab(value)} onKeyDown={(event) => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % CLIENT_TABS.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + CLIENT_TABS.length) % CLIENT_TABS.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = CLIENT_TABS.length - 1;
        else return;
        event.preventDefault();
        const nextTab = CLIENT_TABS[next];
        setTab(nextTab);
        document.getElementById(`clients-tab-${nextTab.toLowerCase()}`)?.focus();
      }} className={`min-w-28 flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${selected ? "bg-blue-600 text-white shadow" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"}`}>{value}</button>;
    })}</div>

    {CLIENT_TABS.map((value) => {
      const selected = tab === value;
      const slug = value.toLowerCase();
      return <section key={value} id={`clients-panel-${slug}`} role="tabpanel" aria-labelledby={`clients-tab-${slug}`} hidden={!selected} tabIndex={0}>
        {loading ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Loading client workspace">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60" />)}</div> : error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-10 text-center text-sm text-rose-200">{error}</div> : data ? <div className="transition">{value === "Dashboard" ? <Dashboard data={data} /> : value === "Members" ? <Members members={data.members} /> : <Calendar month={month} setMonth={changeMonth} events={data.calendar} />}</div> : <Empty>No client data returned.</Empty>}
      </section>;
    })}
    {data && <p className="text-right text-[11px] text-zinc-700">Updated {formatDate(data.generatedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
  </div>;
}
