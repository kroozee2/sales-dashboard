"use client";

import { useEffect, useState } from "react";

type Attendee = { name: string; email?: string | null; source?: string };
type FollowUp = { text: string; owner?: string | null; done?: boolean };

type Call = {
  id: string;
  call_date: string;
  title: string | null;
  source: string | null;
  duration_minutes: number | null;
  share_url: string | null;
  recording_url: string | null;
  attendees: Attendee[] | null;
  attendee_count: number | null;
  invited_count: number | null;
  summary: string | null;
  follow_ups: FollowUp[] | null;
  recording_sent: boolean | null;
  recording_sent_at: string | null;
  fam_draft: string | null;
  fam_sent_at: string | null;
  mastermind_draft: string | null;
  mastermind_sent_at: string | null;
};

function fmtDate(d: string) {
  return new Date(`${d}T12:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function GroupCallsWorkspace() {
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Load failures replace the page. Save and send failures must not -- they are
  // transient, and blowing away the list loses the drafts you were reading.
  const [actionError, setActionError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/client-calls", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b.error ? setError(b.error) : setCalls(b.calls ?? [])))
      .catch((e) => setError(String(e)));

  useEffect(() => { void load(); }, []);

  async function patch(id: string, fields: Record<string, unknown>) {
    setCalls((prev) => prev?.map((c) => (c.id === id ? { ...c, ...fields } as Call : c)) ?? prev);
    const res = await fetch("/api/client-calls", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) { setActionError(`Save failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`); void load(); }
  }

  // Sends the stored draft, unchanged, only after an explicit confirm.
  async function send(id: string, channel: "fam" | "mastermind") {
    const key = `${id}:${channel}`;
    setSending(key); setActionError(null); setConfirming(null);
    const res = await fetch("/api/client-calls/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, channel }),
    });
    const body = await res.json().catch(() => ({}));
    setSending(null);
    if (!res.ok) setActionError(body.error ?? "Send failed.");
    void load();
  }

  if (error) return <p className="p-6 text-sm text-red-400">{error}</p>;
  if (!calls) return <p className="p-6 text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Group Calls</h1>
        <p className="mt-1 text-sm text-zinc-500">
          The Tuesday AI &amp; Systems call. Recording, who showed, follow-ups, and the two posts
          waiting on your approval.
        </p>
      </header>

      {actionError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="flex-1 text-sm text-red-300">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-xs text-red-400/70 hover:text-red-200">dismiss</button>
        </div>
      )}

      {calls.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
          No calls logged yet. Each Tuesday&apos;s call lands here once the recording finishes processing.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Showed up</th>
              <th className="px-3 py-2">Follow-ups</th>
              <th className="px-3 py-2">Recording sent</th>
              <th className="px-3 py-2">Fam channel</th>
              <th className="px-3 py-2">Mastermind</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => {
              const att = c.attendees ?? [];
              const fus = c.follow_ups ?? [];
              const open = openId === c.id;
              return (
                <tr key={c.id} className="border-t border-zinc-800 align-top">
                  <td className="px-3 py-3">
                    <button className="font-medium text-white underline-offset-2 hover:underline" onClick={() => setOpenId(open ? null : c.id)}>
                      {fmtDate(c.call_date)}
                    </button>
                    <div className="text-xs text-zinc-500">
                      {c.duration_minutes ? `${c.duration_minutes} min · ` : ""}{c.source ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-medium">{att.length}</span>
                    {c.invited_count ? <span className="text-zinc-500"> of {c.invited_count} invited</span> : null}
                    <div className="mt-1 text-xs text-zinc-400">{att.map((a) => a.name).join(", ") || "—"}</div>
                  </td>
                  <td className="px-3 py-3">
                    {fus.length === 0 ? <span className="text-zinc-500">—</span> : (
                      <ul className="space-y-1 text-xs">
                        {fus.slice(0, open ? fus.length : 3).map((f, i) => (
                          <li key={i}>• {f.text}{f.owner ? <span className="text-zinc-500"> ({f.owner})</span> : null}</li>
                        ))}
                        {!open && fus.length > 3 && <li className="text-zinc-500">+{fus.length - 3} more</li>}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!c.recording_sent}
                        onChange={(e) => patch(c.id, { recording_sent: e.target.checked })} />
                      {c.recording_sent_at ? new Date(c.recording_sent_at).toLocaleDateString() : "not sent"}
                    </label>
                    {c.share_url && (
                      <a href={c.share_url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-blue-400 hover:underline">
                        open recording
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {c.fam_sent_at ? <span className="text-emerald-400">posted {new Date(c.fam_sent_at).toLocaleDateString()}</span>
                      : <span className="text-amber-400">draft ready</span>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {c.mastermind_sent_at ? <span className="text-emerald-400">posted {new Date(c.mastermind_sent_at).toLocaleDateString()}</span>
                      : <span className="text-amber-400">draft ready</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {calls.filter((c) => c.id === openId).map((c) => (
        <section key={c.id} className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold text-white">{c.title ?? "Call"} — {fmtDate(c.call_date)}</h2>
          {c.summary && <p className="whitespace-pre-wrap text-sm text-zinc-300">{c.summary}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {(["fam", "mastermind"] as const).map((k) => {
              const field = `${k}_draft` as const;
              const sentAt = k === "fam" ? c.fam_sent_at : c.mastermind_sent_at;
              return (
                <div key={k}>
                  <h3 className="mb-1 text-sm font-medium text-zinc-200">
                    {k === "fam" ? "7-Figure CEO Fam channel" : "Mastermind channel"}
                  </h3>
                  <textarea
                    className="h-48 w-full rounded border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs"
                    defaultValue={(k === "fam" ? c.fam_draft : c.mastermind_draft) ?? ""}
                    onBlur={(e) => patch(c.id, { [field]: e.target.value })}
                  />
                  {sentAt ? (
                    <p className="mt-1 text-xs text-emerald-400">
                      Posted {new Date(sentAt).toLocaleString()}.
                    </p>
                  ) : confirming === `${c.id}:${k}` ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-amber-400">Post this to the group?</span>
                      <button onClick={() => send(c.id, k)}
                        className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500">
                        Yes, post it
                      </button>
                      <button onClick={() => setConfirming(null)}
                        className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => setConfirming(`${c.id}:${k}`)}
                        disabled={sending === `${c.id}:${k}`}
                        className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50">
                        {sending === `${c.id}:${k}` ? "sending…" : "Send to WhatsApp"}
                      </button>
                      <span className="text-xs text-zinc-600">Nothing posts on its own.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
