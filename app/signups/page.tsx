"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SubTabs } from "@/components/sub-tabs";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type SignupApp = "claude" | "skool" | "flow";

interface Signup {
  id: string;
  app: SignupApp;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  last_seen: string | null;
  login_count: number | null;
  already_lead: boolean;
}

const APP_META: Record<SignupApp, { label: string; emoji: string; badge: string }> = {
  claude: { label: "Claude App", emoji: "✦", badge: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  skool: { label: "Skool App", emoji: "🎓", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  flow: { label: "Partnership App", emoji: "🤝", badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
function initials(name: string | null, email: string | null) {
  const base = (name || email || "?").trim();
  return base.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function telHref(phone: string | null) {
  if (!phone) return null;
  const d = phone.replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}

function dayKey(s: string | null): string | null {
  if (!s) return null;
  return new Date(s).toISOString().split("T")[0];
}

function StatTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-zinc-600 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Insights dashboard ───────────────────────────────────────────────────────
function DashboardView({ signups }: { signups: Signup[] }) {
  const m = useMemo(() => {
    const now = Date.now();
    const DAY = 86400000;
    const iso = (t: number) => new Date(t).toISOString().split("T")[0];

    const total = signups.length;
    const byApp = { claude: 0, skool: 0, flow: 0 } as Record<SignupApp, number>;
    let last7 = 0, last30 = 0, today = 0, inLeads = 0, returning = 0;
    const loginBuckets = { today: 0, week: 0, month: 0, older: 0, never: 0 };

    for (const s of signups) {
      byApp[s.app] = (byApp[s.app] ?? 0) + 1;
      if (s.already_lead) inLeads++;
      // signup recency
      if (s.created_at) {
        const age = now - new Date(s.created_at).getTime();
        if (age < DAY) today++;
        if (age < 7 * DAY) last7++;
        if (age < 30 * DAY) last30++;
      }
      // returning = came back after signup (login_count>1, or last_seen clearly after signup)
      const gap = s.last_seen && s.created_at ? new Date(s.last_seen).getTime() - new Date(s.created_at).getTime() : 0;
      if ((s.login_count ?? 0) > 1 || gap > 12 * 3600000) returning++;
      // last-login recency
      if (!s.last_seen) loginBuckets.never++;
      else {
        const age = now - new Date(s.last_seen).getTime();
        if (age < DAY) loginBuckets.today++;
        else if (age < 7 * DAY) loginBuckets.week++;
        else if (age < 30 * DAY) loginBuckets.month++;
        else loginBuckets.older++;
      }
    }

    // signups over the last 30 days, stacked by app
    const series: { day: string; label: string; claude: number; skool: number; flow: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const key = iso(now - i * DAY);
      const d = new Date(key + "T12:00");
      series.push({ day: key, label: `${d.getMonth() + 1}/${d.getDate()}`, claude: 0, skool: 0, flow: 0 });
    }
    const idx = new Map(series.map((r, i) => [r.day, i]));
    for (const s of signups) {
      const k = dayKey(s.created_at);
      if (k != null && idx.has(k)) series[idx.get(k)!][s.app]++;
    }

    return { total, byApp, last7, last30, today, inLeads, returning, loginBuckets, series };
  }, [signups]);

  const APP_COLORS: Record<SignupApp, string> = { claude: "#8b5cf6", skool: "#f59e0b", flow: "#06b6d4" };
  const returnPct = m.total ? Math.round((m.returning / m.total) * 100) : 0;
  const leadPct = m.total ? Math.round((m.inLeads / m.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Total signups" value={m.total} sub="across all apps" />
        <StatTile label="New this week" value={m.last7} sub={`${m.today} today · ${m.last30} this month`} accent="text-blue-400" />
        <StatTile label="Came back" value={`${m.returning}`} sub={`${returnPct}% logged in again`} accent="text-emerald-400" />
        <StatTile label="In your Leads" value={m.inLeads} sub={`${leadPct}% · ${m.total - m.inLeads} not yet added`} accent="text-violet-400" />
      </div>

      {/* Signups over time */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-semibold text-sm">Signups — last 30 days</p>
          <div className="flex items-center gap-3 text-[11px]">
            {(["claude", "skool", "flow"] as SignupApp[]).map((a) => (
              <span key={a} className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: APP_COLORS[a] }} />
                {APP_META[a].label}
              </span>
            ))}
          </div>
        </div>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={m.series} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 10 }} interval={4} tickLine={false} axisLine={{ stroke: "#3f3f46" }} />
              <YAxis allowDecimals={false} tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "#e4e4e7" }} cursor={{ fill: "#ffffff08" }} />
              <Bar dataKey="claude" stackId="a" fill={APP_COLORS.claude} name="Claude App" />
              <Bar dataKey="skool" stackId="a" fill={APP_COLORS.skool} name="Skool App" />
              <Bar dataKey="flow" stackId="a" fill={APP_COLORS.flow} name="Partnership App" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* By app */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-white font-semibold text-sm mb-3">Signups by app</p>
          <div className="space-y-3">
            {(["claude", "skool", "flow"] as SignupApp[]).map((a) => {
              const n = m.byApp[a] ?? 0;
              const pct = m.total ? Math.round((n / m.total) * 100) : 0;
              return (
                <div key={a}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-300">{APP_META[a].emoji} {APP_META[a].label}</span>
                    <span className="text-zinc-500">{n} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: APP_COLORS[a] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Login activity */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-white font-semibold text-sm mb-1">Last login activity</p>
          <p className="text-zinc-600 text-xs mb-3">When each person most recently logged in</p>
          <div className="space-y-2">
            {([
              { key: "today", label: "🟢 Today", color: "text-emerald-400" },
              { key: "week", label: "This week", color: "text-blue-400" },
              { key: "month", label: "This month", color: "text-zinc-300" },
              { key: "older", label: "Over a month ago", color: "text-amber-400" },
              { key: "never", label: "Never came back", color: "text-zinc-500" },
            ] as const).map((row) => {
              const n = m.loginBuckets[row.key];
              const pct = m.total ? Math.round((n / m.total) * 100) : 0;
              return (
                <div key={row.key} className="flex items-center gap-3">
                  <span className={`text-xs w-32 flex-shrink-0 ${row.color}`}>{row.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full bg-zinc-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-zinc-500 text-xs w-10 text-right flex-shrink-0">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupsPage() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appTab, setAppTab] = useState<"all" | SignupApp | "dashboard">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/signups", { cache: "no-store" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSignups(json.signups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load signups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function importOne(s: Signup) {
    setBusyId(s.id);
    try {
      const res = await fetch("/api/signups/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signups: [{ name: s.name, email: s.email, phone: s.phone, created_at: s.created_at, app: s.app }] }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSignups((prev) => prev.map((x) => (x.id === s.id ? { ...x, already_lead: true } : x)));
      setFlash(`Added ${s.name ?? s.email} to Leads`);
      setTimeout(() => setFlash(null), 2500);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Failed to add");
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setBusyId(null);
    }
  }

  async function importAllNew() {
    const news = signups.filter((s) => !s.already_lead && s.email && (appTab === "all" || s.app === appTab));
    if (news.length === 0) return;
    setImportingAll(true);
    try {
      const res = await fetch("/api/signups/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signups: news.map((s) => ({ name: s.name, email: s.email, phone: s.phone, created_at: s.created_at, app: s.app })) }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const ids = new Set(news.map((s) => s.id));
      setSignups((prev) => prev.map((x) => (ids.has(x.id) ? { ...x, already_lead: true } : x)));
      setFlash(`Added ${json.inserted} new lead${json.inserted === 1 ? "" : "s"}`);
      setTimeout(() => setFlash(null), 2500);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Failed to add");
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setImportingAll(false);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => signups.filter((s) =>
      (appTab === "all" || s.app === appTab) &&
      (!q || [s.name, s.email, s.phone].some((v) => (v ?? "").toLowerCase().includes(q)))),
    [signups, q, appTab]
  );
  const counts = useMemo(() => ({
    all: signups.length,
    claude: signups.filter((s) => s.app === "claude").length,
    skool: signups.filter((s) => s.app === "skool").length,
    flow: signups.filter((s) => s.app === "flow").length,
  }), [signups]);
  const newCount = filtered.filter((s) => !s.already_lead).length;

  return (
    <div className="max-w-5xl mx-auto">
      <SubTabs group="leads" />
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">🆕 App Signups</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Everyone who created a free login on your apps. Add the new ones to your Leads in one tap.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={load} title="Refresh" className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">🔄</button>
          {appTab !== "dashboard" && (
            <button
              onClick={importAllNew}
              disabled={importingAll || newCount === 0}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
            >
              {importingAll ? "Adding…" : `+ Add all new (${newCount})`}
            </button>
          )}
        </div>
      </div>

      {flash && <div className="mb-3 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm">{flash}</div>}

      {/* Source tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1 mb-4 max-w-2xl overflow-x-auto">
        {([
          { key: "dashboard", label: "Dashboard", emoji: "📊" },
          { key: "all", label: "All", emoji: "📋" },
          { key: "claude", label: "Claude App", emoji: "✦" },
          { key: "skool", label: "Skool App", emoji: "🎓" },
          { key: "flow", label: "Partnership App", emoji: "🤝" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setAppTab(t.key)}
            className={`flex-1 whitespace-nowrap py-2 px-3 rounded-xl text-sm font-semibold transition-all ${appTab === t.key ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white"}`}
          >
            {t.emoji} {t.label}{t.key !== "dashboard" && <span className="opacity-60"> ({counts[t.key]})</span>}
          </button>
        ))}
      </div>

      {/* Search (list views only) */}
      {appTab !== "dashboard" && (
        <div className="relative mb-4 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500" />
        </div>
      )}

      {loading ? (
        <p className="text-zinc-600 text-sm text-center py-12 animate-pulse">Loading signups…</p>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-rose-400 text-sm">{error}</p>
          <button onClick={load} className="mt-3 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm">Try again</button>
        </div>
      ) : appTab === "dashboard" ? (
        <DashboardView signups={signups} />
      ) : filtered.length === 0 ? (
        <div className="text-center text-zinc-600 py-14">
          <p className="text-3xl mb-2">🌱</p>
          <p>No signups yet.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {/* Column header */}
          <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-b border-zinc-800 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
            <span className="w-9 flex-shrink-0" />
            <span style={{ flex: "1.4 1 0%" }}>Person</span>
            <span className="hidden sm:block" style={{ flex: "1.6 1 0%" }}>Email</span>
            <span className="hidden md:block w-[140px] flex-shrink-0">Phone</span>
            <span className="w-[110px] flex-shrink-0">Signed up</span>
            <span className="hidden lg:block w-[110px] flex-shrink-0">Last login</span>
            <span className="w-[130px] flex-shrink-0 text-right">Action</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {filtered.map((s) => {
              const tel = telHref(s.phone);
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {initials(s.name, s.email)}
                  </span>
                  <div className="min-w-0" style={{ flex: "1.4 1 0%" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium truncate">{s.name || (s.email ? s.email.split("@")[0] : "—")}</span>
                      {appTab === "all" && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 border ${APP_META[s.app].badge}`}>
                          {APP_META[s.app].emoji} {APP_META[s.app].label}
                        </span>
                      )}
                      {(s.login_count ?? 0) > 1 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex-shrink-0">{s.login_count}× logins</span>}
                    </div>
                    {/* email under name on mobile only (dedicated column on sm+) */}
                    {s.email && <a href={`mailto:${s.email}`} className="sm:hidden text-zinc-500 text-xs truncate block hover:text-blue-300">{s.email}</a>}
                  </div>
                  {/* Email column */}
                  <div className="hidden sm:flex items-center gap-1.5 min-w-0" style={{ flex: "1.6 1 0%" }}>
                    {s.email ? (
                      <>
                        <a href={`mailto:${s.email}`} className="text-zinc-300 text-xs truncate hover:text-blue-300">{s.email}</a>
                        <button
                          onClick={() => { void navigator.clipboard.writeText(s.email!); setFlash(`Copied ${s.email}`); setTimeout(() => setFlash(null), 1500); }}
                          title="Copy email"
                          className="flex-shrink-0 text-zinc-600 hover:text-zinc-300 text-xs"
                        >⧉</button>
                      </>
                    ) : <span className="text-zinc-700 text-xs">—</span>}
                  </div>
                  <div className="hidden md:block w-[140px] flex-shrink-0">
                    {tel ? <a href={tel} className="text-zinc-300 text-xs hover:text-blue-300">{s.phone}</a> : <span className="text-zinc-700 text-xs">—</span>}
                  </div>
                  <span className="w-[110px] flex-shrink-0 text-zinc-400 text-xs">{fmtDate(s.created_at)}</span>
                  <span className="hidden lg:block w-[110px] flex-shrink-0 text-zinc-400 text-xs">{fmtWhen(s.last_seen)}</span>
                  <div className="w-[130px] flex-shrink-0 flex justify-end">
                    {s.already_lead ? (
                      <span className="text-emerald-400 text-xs font-medium">✓ In Leads</span>
                    ) : (
                      <button
                        onClick={() => importOne(s)}
                        disabled={busyId === s.id}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                      >
                        {busyId === s.id ? "Adding…" : "+ Add to Leads"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-zinc-600 text-xs mt-4">
        {counts.all} total signup{counts.all === 1 ? "" : "s"} · {newCount} shown not yet in Leads. Sources: <a href="https://claude-for-founders.vercel.app/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Claude for Founders</a> · <a href="https://skool-graphics-generator.vercel.app/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Skool Blueprint</a> · <a href="https://flow-deal-system.vercel.app/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Partnership System</a>
      </p>
    </div>
  );
}
