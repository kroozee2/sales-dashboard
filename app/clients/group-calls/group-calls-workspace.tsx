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
    if (!res.ok) { setError(`Save failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`); void load(); }
  }

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!calls) return <p className="p-6 text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Group Calls</h1>
        <p className="mt-1 text-sm text-neutral-500">
          The Tuesday AI &amp; Systems call. Recording, who showed, follow-ups, and the two posts
          waiting on your approval.
        </p>
      </header>

      {calls.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-sm text-neutral-500">
          No calls logged yet. Each Tuesday&apos;s call lands here once the recording finishes processing.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
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
                <tr key={c.id} className="border-t align-top">
                  <td className="px-3 py-3">
                    <button className="font-medium underline-offset-2 hover:underline" onClick={() => setOpenId(open ? null : c.id)}>
                      {fmtDate(c.call_date)}
                    </button>
                    <div className="text-xs text-neutral-500">
                      {c.duration_minutes ? `${c.duration_minutes} min · ` : ""}{c.source ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-medium">{att.length}</span>
                    {c.invited_count ? <span className="text-neutral-500"> of {c.invited_count} invited</span> : null}
                    <div className="mt-1 text-xs text-neutral-600">{att.map((a) => a.name).join(", ") || "—"}</div>
                  </td>
                  <td className="px-3 py-3">
                    {fus.length === 0 ? <span className="text-neutral-400">—</span> : (
                      <ul className="space-y-1 text-xs">
                        {fus.slice(0, open ? fus.length : 3).map((f, i) => (
                          <li key={i}>• {f.text}{f.owner ? <span className="text-neutral-500"> ({f.owner})</span> : null}</li>
                        ))}
                        {!open && fus.length > 3 && <li className="text-neutral-500">+{fus.length - 3} more</li>}
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
                      <a href={c.share_url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-blue-600 hover:underline">
                        open recording
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {c.fam_sent_at ? <span className="text-green-700">posted {new Date(c.fam_sent_at).toLocaleDateString()}</span>
                      : <span className="text-amber-700">draft ready</span>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {c.mastermind_sent_at ? <span className="text-green-700">posted {new Date(c.mastermind_sent_at).toLocaleDateString()}</span>
                      : <span className="text-amber-700">draft ready</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {calls.filter((c) => c.id === openId).map((c) => (
        <section key={c.id} className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">{c.title ?? "Call"} — {fmtDate(c.call_date)}</h2>
          {c.summary && <p className="whitespace-pre-wrap text-sm text-neutral-700">{c.summary}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {(["fam", "mastermind"] as const).map((k) => {
              const field = `${k}_draft` as const;
              const sentAt = k === "fam" ? c.fam_sent_at : c.mastermind_sent_at;
              return (
                <div key={k}>
                  <h3 className="mb-1 text-sm font-medium">
                    {k === "fam" ? "7-Figure CEO Fam channel" : "Mastermind channel"}
                  </h3>
                  <textarea
                    className="h-48 w-full rounded border p-2 font-mono text-xs"
                    defaultValue={(k === "fam" ? c.fam_draft : c.mastermind_draft) ?? ""}
                    onBlur={(e) => patch(c.id, { [field]: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    {sentAt
                      ? `Posted ${new Date(sentAt).toLocaleString()}.`
                      : "Edit here, then send it from WhatsApp. Nothing posts on its own."}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
