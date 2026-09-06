"use client";

import { useCallback, useEffect, useState } from "react";

type Member = {
  id: string; name: string; email: string; role: string; title: string | null; emoji: string | null;
  active: boolean; last_login_at: string | null; login_count: number;
  must_change_password: boolean; has_password: boolean; created_at: string;
};
type Activity = {
  id: string; member_id: string | null; member_name: string | null;
  type: string; summary: string | null; path: string | null; created_at: string;
};

const TYPE_META: Record<string, { emoji: string; chip: string }> = {
  login: { emoji: "🔑", chip: "bg-blue-500/15 text-blue-300" },
  view: { emoji: "👀", chip: "bg-zinc-700/50 text-zinc-300" },
  password: { emoji: "🔒", chip: "bg-amber-500/15 text-amber-300" },
  team: { emoji: "👥", chip: "bg-violet-500/15 text-violet-300" },
};
const meta = (t: string) => TYPE_META[t] ?? TYPE_META.view;

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TeamPage() {
  const [tab, setTab] = useState<"members" | "activity">("members");
  const [me, setMe] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/team")).json();
    setMe(d.me ?? null); setMembers(d.members ?? []); setActivity(d.activity ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const isOwner = me?.role === "owner";

  async function patch(id: string, updates: Record<string, unknown>) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } as Member : m)));
    const r = await (await fetch("/api/team", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    })).json();
    if (r.error) { setMsg(r.error); void load(); }
  }

  async function resetPassword(m: Member) {
    if (!confirm(`Issue a new temporary password for ${m.name}? Their current one stops working.`)) return;
    const r = await (await fetch("/api/team", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: m.id, resetPassword: true }),
    })).json();
    if (r.error) { setMsg(r.error); return; }
    setTemp({ name: m.name, password: r.tempPassword });
    void load();
  }

  // Usage per person, from the activity feed
  const usage = members.map((m) => {
    const mine = activity.filter((a) => a.member_id === m.id);
    const week = mine.filter((a) => Date.now() - new Date(a.created_at).getTime() < 7 * 86400000);
    return { id: m.id, total: mine.length, week: week.length, last: mine[0]?.created_at ?? m.last_login_at };
  });
  const usageFor = (id: string) => usage.find((u) => u.id === id);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">👥 Team</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Who&apos;s on the tools, and what they&apos;ve been working in.</p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {([["members", "👥 Members"], ["activity", "📊 Activity"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${tab === k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{l}</button>
          ))}
        </div>
      </div>

      {msg && <p className="text-rose-400 text-xs mb-3">{msg}</p>}

      {/* A temporary password is shown exactly once — copy it before closing. */}
      {temp && (
        <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] p-4">
          <p className="text-amber-200 font-semibold text-sm">Temporary password for {temp.name}</p>
          <p className="text-zinc-400 text-xs mt-0.5">Send it to them yourself. They&apos;ll set their own password when they sign in — this is the only time it&apos;s shown.</p>
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <code className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-white font-mono text-sm">{temp.password}</code>
            <button onClick={() => { void navigator.clipboard?.writeText(temp.password); setMsg("Copied."); }}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold">📋 Copy</button>
            <button onClick={() => setTemp(null)} className="px-3 py-2 rounded-lg text-zinc-500 hover:text-white text-xs">Done</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-zinc-600 text-center py-16 animate-pulse">Loading…</p>
      ) : tab === "members" ? (
        <div className="space-y-3">
          {members.map((m) => {
            const u = usageFor(m.id);
            return (
              <div key={m.id} className={`bg-zinc-900 border rounded-2xl p-4 ${m.active ? "border-zinc-800" : "border-zinc-800/60 opacity-60"}`}>
                <div className="flex items-start gap-3 flex-wrap">
                  <span className="text-3xl leading-none">{m.emoji ?? "🧑"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-bold">{m.name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.role === "owner" ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" : "bg-violet-500/15 text-violet-300 border border-violet-500/30"}`}>
                        {m.title || (m.role === "owner" ? "Owner" : "Member")}
                      </span>
                      {m.id === me?.id && <span className="text-[10px] text-zinc-500">that&apos;s you</span>}
                    </div>
                    <a href={`mailto:${m.email}`} className="text-sm text-blue-400 hover:text-blue-300 break-all">{m.email}</a>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500 flex-wrap">
                      <span>🔑 {m.login_count} sign-in{m.login_count === 1 ? "" : "s"}</span>
                      {m.last_login_at && <span>Last in {ago(m.last_login_at)}</span>}
                      {u && u.week > 0 && <span className="text-emerald-400">{u.week} action{u.week === 1 ? "" : "s"} this week</span>}
                      {m.must_change_password && <span className="text-amber-400">⚠️ still on a temporary password</span>}
                      {!m.has_password && <span className="text-zinc-600">no password set yet</span>}
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => void resetPassword(m)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold whitespace-nowrap">🔑 New temp password</button>
                      {m.id !== me?.id && (
                        <button onClick={() => void patch(m.id, { active: !m.active })}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500 hover:text-white">{m.active ? "Deactivate" : "Reactivate"}</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {me && (
            <ChangeOwnPassword needsChange={me.must_change_password} onDone={() => { setMsg("Password updated."); void load(); }} />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* per-person usage summary */}
          <div className="grid sm:grid-cols-2 gap-3">
            {members.map((m) => {
              const u = usageFor(m.id);
              return (
                <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{m.emoji ?? "🧑"}</span>
                    <p className="text-white font-semibold text-sm">{m.name}</p>
                  </div>
                  <div className="flex gap-5 mt-2.5">
                    <div>
                      <p className="text-xl font-extrabold text-white tabular-nums leading-none">{u?.week ?? 0}</p>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-1">This week</p>
                    </div>
                    <div>
                      <p className="text-xl font-extrabold text-white tabular-nums leading-none">{m.login_count}</p>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-1">Sign-ins</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-300 leading-none pt-1.5">{u?.last ? ago(u.last) : "—"}</p>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-1">Last seen</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* the feed */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <p className="text-white font-semibold text-sm px-4 py-3 border-b border-zinc-800">Recent activity</p>
            {activity.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-12">Nothing logged yet. Activity appears as the team uses the app.</p>
            ) : (
              <div className="divide-y divide-zinc-800/60 max-h-[560px] overflow-y-auto">
                {activity.map((a) => {
                  const mt = meta(a.type);
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] ${mt.chip}`}>{mt.emoji}</span>
                      <p className="text-sm text-zinc-200 min-w-0 flex-1 truncate">{a.summary}</p>
                      <span className="text-[11px] text-zinc-600 whitespace-nowrap">{ago(a.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Change your own password from inside the app.
function ChangeOwnPassword({ needsChange, onDone }: { needsChange: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(needsChange);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = "w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500";

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await (await fetch("/api/auth/set-password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })).json();
      if (r.error) { setErr(r.error); return; }
      setCurrent(""); setNext(""); setOpen(false); onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className={`rounded-2xl border p-4 ${needsChange ? "border-amber-500/40 bg-amber-500/[0.05]" : "border-zinc-800 bg-zinc-900"}`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="text-white font-semibold text-sm">🔒 {needsChange ? "Set your own password" : "Change your password"}</span>
        <span className="text-zinc-500 text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2 max-w-sm">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" autoComplete="current-password" className={input} />
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" className={input} />
          {err && <p className="text-rose-400 text-xs">{err}</p>}
          <button onClick={() => void save()} disabled={busy || next.length < 8}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40">{busy ? "Saving…" : "Save password"}</button>
        </div>
      )}
    </div>
  );
}
