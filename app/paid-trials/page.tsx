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
};

const CAL_LABEL: Record<string, string> = {
  queued: "⏳ Queued for the Mini worker",
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

function StatTile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? "text-white"}`}>{value}</p>
    </div>
  );
}

export default function PaidTrialsPage() {
  const [rows, setRows] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "qualified" | Status>("all");
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
    if (!confirm("Delete this trial entry? This can't be undone.")) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    setOpenId(null);
    await fetch(`/api/paid-trials?id=${id}`, { method: "DELETE" });
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "qualified" && !r.qualifies_for_call) return false;
      if (filter !== "all" && filter !== "qualified" && r.status !== filter) return false;
      if (!needle) return true;
      return [fullName(r), r.email, r.business_type, r.monthly_revenue, r.who_and_result]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, filter, q]);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: rows.length,
      week: rows.filter((r) => r.created_at && now - new Date(r.created_at).getTime() < 7 * 86400000).length,
      qualified: rows.filter((r) => r.qualifies_for_call).length,
      booked: rows.filter((r) => r.booked_call).length,
      invited: rows.filter((r) => r.app_status === "invited" || r.app_status === "existing_account").length,
      inApp: rows.filter((r) => r.app_first_login_at).length,
    };
  }, [rows]);

  const FILTERS: { k: "all" | "qualified" | Status; label: string; n: number }[] = [
    { k: "all", label: "All", n: rows.length },
    { k: "qualified", label: "$10K+", n: stats.qualified },
    ...STATUSES.map((s) => ({ k: s, label: STATUS_META[s].label, n: rows.filter((r) => r.status === s).length })),
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Paid Trials</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            $47 7-day trial onboarding · offer, AI tools, agents and marketing inputs
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs font-medium text-zinc-400 hover:text-white border border-zinc-800 rounded-lg px-3 py-2"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatTile label="Total" value={stats.total} />
        <StatTile label="Last 7 days" value={stats.week} accent="text-blue-300" />
        <StatTile label="$10K+/mo" value={stats.qualified} accent="text-emerald-300" />
        <StatTile label="Calls booked" value={stats.booked} accent="text-violet-300" />
        <StatTile label="In the app" value={stats.invited ? `${stats.inApp}/${stats.invited}` : "—"} accent="text-sky-300" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
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
          placeholder="Search name, email, niche..."
          className="flex-1 min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading trials...</p>
      ) : shown.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-zinc-400 text-sm">
            {rows.length === 0
              ? "No trial onboardings yet. They'll land here the moment someone submits."
              : "Nothing matches that filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => {
            const meta = STATUS_META[r.status as Status] ?? STATUS_META.new;
            return (
              <button
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-600 transition"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-sm font-bold">
                    {initials(r)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold truncate">{fullName(r)}</p>
                    <p className="text-zinc-500 text-xs truncate">{r.email || "—"}</p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-1 ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.monthly_revenue && (
                    <span
                      className={`text-[11px] rounded-md px-2 py-1 border ${
                        r.qualifies_for_call
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}
                    >
                      {r.monthly_revenue}
                    </span>
                  )}
                  {r.business_type && (
                    <span className="text-[11px] rounded-md px-2 py-1 bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {r.business_type}
                    </span>
                  )}
                  {r.booked_call && (
                    <span className="text-[11px] rounded-md px-2 py-1 bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      📅 Booked
                    </span>
                  )}
                  {r.app_status !== "skipped" && (
                    <span className={`text-[11px] rounded-md px-2 py-1 border ${appState(r).badge}`}>{appState(r).label}</span>
                  )}
                  {r.chat_joined_at ? (
                    <span className="text-[11px] rounded-md px-2 py-1 bg-green-500/10 text-green-300 border border-green-500/30">
                      💬 Trial Fam
                    </span>
                  ) : (
                    <span className="text-[11px] rounded-md px-2 py-1 bg-zinc-800 text-zinc-500 border border-zinc-700">
                      Not in chat
                    </span>
                  )}
                  {r.ai_plan && (
                    <span className="text-[11px] rounded-md px-2 py-1 bg-sky-500/10 text-sky-300 border border-sky-500/30">
                      ✨ AI plan
                    </span>
                  )}
                </div>

                {r.who_and_result && (
                  <p className="mt-3 text-zinc-400 text-xs leading-relaxed line-clamp-2">{r.who_and_result}</p>
                )}

                <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-600">
                  <span>{r.video_watched_at ? "🎬 Watched values video" : "—"}</span>
                  <span>{fmtWhen(r.created_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && <Detail t={open} onClose={() => setOpenId(null)} onPatch={patch} onDelete={remove} />}
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
              Onboarded {fmtFull(t.created_at)}
              {t.video_watched_at ? " · watched values video" : ""}
              {t.chat_joined_at ? " · tapped Join Trial Fam" : " · hasn't joined Trial Fam"}
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
                  onClick={() => onPatch(t.id, { status: s })}
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

          <button onClick={() => onDelete(t.id)} className="text-xs text-zinc-600 hover:text-red-400 transition">
            Delete entry
          </button>
        </div>
      </aside>
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
