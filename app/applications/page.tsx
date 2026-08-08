"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SubTabs } from "@/components/sub-tabs";

interface Application {
  id: string;
  created_at: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  business_type: string | null;
  monthly_revenue: string | null;
  business_name: string | null;
  location: string | null;
  goals_12mo: string | null;
  holding_back: string | null;
  why_now: string | null;
  contribution: string | null;
  status: string;
  notes: string | null;
  booked_call: boolean;
  source: string | null;
}

const STATUSES = ["new", "reviewing", "approved", "declined"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_META: Record<Status, { label: string; badge: string; dot: string }> = {
  new: {
    label: "New",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    dot: "bg-blue-400",
  },
  reviewing: {
    label: "Reviewing",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    dot: "bg-amber-400",
  },
  approved: {
    label: "Approved",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  declined: {
    label: "Declined",
    badge: "bg-zinc-600/20 text-zinc-400 border-zinc-600/40",
    dot: "bg-zinc-500",
  },
};

// Which offer the application came in on. Anything unmapped falls back to
// showing the raw source string so a new funnel is never silently invisible.
const SOURCE_META: Record<string, { label: string; badge: string }> = {
  "mastermind-doc": {
    label: "Mastermind",
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
  "skool-launch": {
    label: "Skool Launch",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
};

function sourceLabel(s: string | null) {
  if (!s) return "Unknown";
  return SOURCE_META[s]?.label ?? s;
}

// Revenue brackets, richest first, so a hot applicant is obvious at a glance
const REV_RANK: Record<string, number> = {
  "$100k/m+": 5,
  "$50k - $100k/m": 4,
  "$20k - $50k/m": 3,
  "$10k - $20k/m": 2,
  "Under $10k/m": 1,
};

function fullName(a: Application) {
  return [a.first_name, a.last_name].filter(Boolean).join(" ") || "Unnamed";
}
function initials(a: Application) {
  const b = fullName(a);
  return (
    b
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

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Application | null>(null);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/applications");
      const d = await r.json();
      if (Array.isArray(d)) setApps(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, updates: Partial<Application>) {
    setApps((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    );
    setOpen((o) => (o && o.id === id ? { ...o, ...updates } : o));
    await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
  }

  // Every source present in the data, so a new funnel shows up here on its own
  const sources = useMemo(
    () => Array.from(new Set(apps.map((a) => a.source ?? "unknown"))).sort(),
    [apps],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return apps.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (sourceFilter !== "all" && (a.source ?? "unknown") !== sourceFilter)
        return false;
      if (!needle) return true;
      return [
        fullName(a),
        a.email,
        a.business_name,
        a.location,
        a.business_type,
        a.monthly_revenue,
        sourceLabel(a.source),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [apps, filter, sourceFilter, q]);

  // Scoped to the selected source so the tiles match what you're looking at
  const scoped = useMemo(
    () =>
      sourceFilter === "all"
        ? apps
        : apps.filter((a) => (a.source ?? "unknown") === sourceFilter),
    [apps, sourceFilter],
  );

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: scoped.length,
      week: scoped.filter(
        (a) =>
          a.created_at && now - new Date(a.created_at).getTime() < 7 * 86400000,
      ).length,
      newCount: scoped.filter((a) => a.status === "new").length,
      approved: scoped.filter((a) => a.status === "approved").length,
    };
  }, [scoped]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <SubTabs group="leads" />

      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Applications</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Answers from every apply page · Mastermind + Skool Launch
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs font-medium text-zinc-400 hover:text-white border border-zinc-800 rounded-lg px-3 py-2"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="Total" value={stats.total} />
        <StatTile label="Last 7 days" value={stats.week} accent="text-blue-300" />
        <StatTile label="Unread" value={stats.newCount} accent="text-amber-300" />
        <StatTile
          label="Approved"
          value={stats.approved}
          accent="text-emerald-300"
        />
      </div>

      {sources.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar mb-3">
          {(["all", ...sources] as const).map((s) => {
            const active = sourceFilter === s;
            const n =
              s === "all"
                ? apps.length
                : apps.filter((a) => (a.source ?? "unknown") === s).length;
            return (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={`shrink-0 text-xs font-medium rounded-lg px-3 py-2 border transition ${
                  active
                    ? "bg-white text-black border-white"
                    : "text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
                }`}
              >
                {s === "all" ? "All offers" : sourceLabel(s)}
                <span className="ml-1.5 opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {(["all", ...STATUSES] as const).map((s) => {
            const active = filter === s;
            const n =
              s === "all"
                ? scoped.length
                : scoped.filter((a) => a.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`shrink-0 text-xs font-medium rounded-lg px-3 py-2 border transition ${
                  active
                    ? "bg-white text-black border-white"
                    : "text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
                }`}
              >
                {s === "all" ? "All" : STATUS_META[s].label}
                <span className="ml-1.5 opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, business..."
          className="flex-1 min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading applications...</p>
      ) : shown.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-zinc-400 text-sm">
            {apps.length === 0
              ? "No applications yet. They'll land here the moment someone submits."
              : "Nothing matches that filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => {
            const meta = STATUS_META[(a.status as Status) ?? "new"] ?? STATUS_META.new;
            const rank = REV_RANK[a.monthly_revenue ?? ""] ?? 0;
            return (
              <button
                key={a.id}
                onClick={() => setOpen(a)}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-600 transition"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-sm font-bold">
                    {initials(a)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold truncate">
                      {fullName(a)}
                    </p>
                    <p className="text-zinc-500 text-xs truncate">
                      {a.business_name || a.email || "—"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-1 ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span
                    className={`text-[11px] rounded-md px-2 py-1 border ${
                      SOURCE_META[a.source ?? ""]?.badge ??
                      "bg-zinc-800 text-zinc-400 border-zinc-700"
                    }`}
                  >
                    {sourceLabel(a.source)}
                  </span>
                  {a.monthly_revenue && (
                    <span
                      className={`text-[11px] rounded-md px-2 py-1 border ${
                        rank >= 4
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}
                    >
                      {a.monthly_revenue}
                    </span>
                  )}
                  {a.business_type && (
                    <span className="text-[11px] rounded-md px-2 py-1 bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {a.business_type}
                    </span>
                  )}
                  {a.booked_call && (
                    <span className="text-[11px] rounded-md px-2 py-1 bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      📅 Booked
                    </span>
                  )}
                </div>

                {a.goals_12mo && (
                  <p className="mt-3 text-zinc-400 text-xs leading-relaxed line-clamp-2">
                    {a.goals_12mo}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-600">
                  <span>{a.location || "—"}</span>
                  <span>{fmtWhen(a.created_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <Detail app={open} onClose={() => setOpen(null)} onPatch={patch} />
      )}
    </div>
  );
}

/* ─── Slide-in detail ────────────────────────────────────────────────── */
function Detail({
  app,
  onClose,
  onPatch,
}: {
  app: Application;
  onClose: () => void;
  onPatch: (id: string, u: Partial<Application>) => void;
}) {
  const [notes, setNotes] = useState(app.notes ?? "");

  useEffect(() => setNotes(app.notes ?? ""), [app.id, app.notes]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // The three open-ended columns are shared across funnels but each apply page
  // asks a different question into them. Label them per source so the answers
  // read correctly instead of under the Mastermind wording.
  const skool = app.source === "skool-launch";
  const QA: [string, string | null][] = [
    [
      skool ? "What they coach or consult on" : "What type of business do you have?",
      app.business_type,
    ],
    ["Average monthly revenue", app.monthly_revenue],
    ["Business name", app.business_name],
    ["Where they live", app.location],
    [
      skool
        ? "Where their audience lives right now"
        : "What they can contribute",
      app.contribution,
    ],
    [
      skool
        ? "Do they have a Skool community today"
        : "What's holding them back",
      app.holding_back,
    ],
    [
      skool
        ? "What they want the community to do in 12 months"
        : "Main 1-2 things to accomplish in 12 months",
      app.goals_12mo,
    ],
    ["Why this, why now", app.why_now],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <aside className="relative w-full sm:max-w-xl bg-zinc-950 border-l border-zinc-800 overflow-y-auto">
        <div className="sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-5 py-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white truncate">
              {fullName(app)}
            </h2>
            <p className="text-zinc-500 text-xs">
              Applied {fmtFull(app.created_at)} · {sourceLabel(app.source)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {app.email && (
              <a
                href={`mailto:${app.email}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 hover:border-zinc-600 transition"
              >
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Email
                </p>
                <p className="text-sm text-white truncate">{app.email}</p>
              </a>
            )}
            {app.phone && (
              <a
                href={`tel:${app.phone.replace(/[^\d+]/g, "")}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 hover:border-zinc-600 transition"
              >
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Phone
                </p>
                <p className="text-sm text-white">{app.phone}</p>
              </a>
            )}
          </div>

          {/* status */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => {
                const active = app.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => onPatch(app.id, { status: s })}
                    className={`text-xs font-medium rounded-lg px-3 py-2 border transition ${
                      active
                        ? STATUS_META[s].badge
                        : "text-zinc-500 border-zinc-800 hover:text-white"
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                );
              })}
              <button
                onClick={() =>
                  onPatch(app.id, { booked_call: !app.booked_call })
                }
                className={`text-xs font-medium rounded-lg px-3 py-2 border transition ${
                  app.booked_call
                    ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                    : "text-zinc-500 border-zinc-800 hover:text-white"
                }`}
              >
                📅 {app.booked_call ? "Call booked" : "Mark booked"}
              </button>
            </div>
          </div>

          {/* answers */}
          <div className="space-y-3">
            {QA.map(([q, a]) => (
              <div
                key={q}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {q}
                </p>
                <p className="text-sm text-zinc-200 mt-1.5 whitespace-pre-wrap leading-relaxed">
                  {a || "—"}
                </p>
              </div>
            ))}
          </div>

          {/* notes */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">
              Your notes
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (app.notes ?? "")) onPatch(app.id, { notes });
              }}
              rows={4}
              placeholder="Thoughts before the call..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
