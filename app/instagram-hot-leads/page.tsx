"use client";

import { useEffect, useState } from "react";
import { SubTabs } from "@/components/sub-tabs";
import type { InstagramHotLead, InstagramHotLeadsDocument } from "@/lib/instagram-hot-leads";

const STATUS_STYLE: Record<InstagramHotLead["status"], string> = {
  draft: "bg-zinc-700/60 text-zinc-300",
  approved: "bg-blue-500/20 text-blue-300",
  sending: "bg-amber-500/20 text-amber-300",
  sent: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-rose-500/20 text-rose-300",
  skipped: "bg-zinc-800 text-zinc-500",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function errorMessage(value: unknown): string {
  if (typeof value !== "object" || value === null || !("error" in value) || typeof value.error !== "string") return "Something went wrong. Refresh and try again.";
  return value.error.slice(0, 500);
}

export default function InstagramHotLeadsPage() {
  const [document, setDocument] = useState<InstagramHotLeadsDocument | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/instagram-hot-leads", { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(errorMessage(body));
        return body as InstagramHotLeadsDocument;
      })
      .then((next) => {
        if (!active) return;
        setDocument(next);
        setDrafts(Object.fromEntries(next.leads.map((row) => [row.username, row.draft_reply])));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load the shortlist.");
      });
    return () => { active = false; };
  }, []);

  async function patch(row: InstagramHotLead, body: Record<string, unknown>) {
    setBusy(row.username);
    setError(null);
    try {
      const response = await fetch(`/api/instagram-hot-leads/${encodeURIComponent(row.username)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(result));
      const saved = result as InstagramHotLead;
      setDocument((current) => current ? { ...current, leads: current.leads.map((lead) => lead.username === saved.username ? saved : lead) } : current);
      setDrafts((current) => ({ ...current, [saved.username]: saved.draft_reply }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this lead.");
    } finally {
      setBusy(null);
    }
  }

  async function save(row: InstagramHotLead) {
    await patch(row, { draft_reply: drafts[row.username] ?? "", expected_revision: row.revision });
  }

  async function approve(row: InstagramHotLead) {
    const confirmed = window.confirm(`Send on Instagram to @${row.username}?\n\n${row.draft_reply}`);
    if (!confirmed) return;
    await patch(row, {
      status: "approved",
      expected_draft_reply: row.draft_reply,
      expected_revision: row.revision,
    });
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SubTabs group="leads" />
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Instagram Hot Leads</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Review the monthly shortlist, edit the exact reply, then approve it. Queued messages send within about a minute.
            </p>
          </div>
          {document && <p className="text-xs text-zinc-500">Generated {formatDate(document.generated_at)} · {document.leads.length} leads</p>}
        </div>

        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-800/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {!document && !error && <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-500">Loading shortlist…</div>}
        {document?.leads.length === 0 && <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-500">No hot leads have been imported for this month.</div>}

        <div className="space-y-4">
          {document?.leads.map((row) => {
            const editedDraft = drafts[row.username] ?? row.draft_reply;
            const changed = editedDraft !== row.draft_reply;
            const isBusy = busy === row.username;
            const canEdit = row.status !== "sending" && row.status !== "sent";
            const canApprove = !changed && (row.status === "draft" || row.status === "failed") && row.draft_reply.length > 0;
            return (
              <article key={row.username} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.25fr)_minmax(320px,1.5fr)]">
                  <section>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-zinc-500">#{row.rank}</span>
                      <a href={`https://www.instagram.com/${encodeURIComponent(row.username)}/`} target="_blank" rel="noreferrer" className="font-semibold text-pink-300 hover:text-pink-200">@{row.username}</a>
                    </div>
                    {row.display_name && <p className="mt-1 text-sm text-zinc-300">{row.display_name}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-orange-500/20 px-2.5 py-1 text-xs font-semibold text-orange-300">Heat {row.heat_score}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[row.status]}`}>{row.status}</span>
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">Updated {formatDate(row.updated_time)}</p>
                    {row.status === "sent" && row.sent_at && <p className="mt-2 text-xs text-emerald-300">Sent {formatDate(row.sent_at)}</p>}
                    {row.status === "failed" && <p className="mt-2 rounded-lg bg-rose-950/40 p-2 text-xs text-rose-300">Send failed{row.last_error ? `: ${row.last_error}` : ". Please review and retry."}</p>}
                  </section>

                  <section className="space-y-3 text-sm">
                    <div><h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Why hot</h2><p className="mt-1 whitespace-pre-wrap text-zinc-200">{row.heat_reason || "—"}</p></div>
                    <div><h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Relevant offer</h2><p className="mt-1 whitespace-pre-wrap text-zinc-200">{row.relevant_offer || "—"}</p></div>
                    <div><h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Latest inbound</h2><p className="mt-1 whitespace-pre-wrap text-zinc-300">{row.latest_inbound_summary || "—"}</p></div>
                    <div><h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">SalesOS match</h2><p className="mt-1 text-zinc-300">{row.salesos_match || "No match"}</p></div>
                  </section>

                  <section>
                    <label htmlFor={`draft-${row.username}`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Exact draft reply</label>
                    <textarea
                      id={`draft-${row.username}`}
                      value={editedDraft}
                      maxLength={2000}
                      disabled={!canEdit || isBusy}
                      onChange={(event) => setDrafts((current) => ({ ...current, [row.username]: event.target.value }))}
                      className="mt-2 min-h-36 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm leading-6 text-zinc-100 outline-none transition focus:border-pink-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button onClick={() => void save(row)} disabled={!canEdit || !changed || isBusy} className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40">Save</button>
                      <button onClick={() => void approve(row)} disabled={!canApprove || isBusy} className="min-h-11 flex-1 rounded-xl bg-pink-600 px-4 text-sm font-semibold text-white transition hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-40">
                        {row.status === "failed" ? "Retry on Instagram" : "Send on Instagram"}
                      </button>
                    </div>
                    {changed && <p className="mt-2 text-xs text-amber-300">Save this edit before approving it.</p>}
                    {row.status === "approved" && <p className="mt-2 text-xs text-blue-300">Approved and queued. It should send within about a minute.</p>}
                    {row.status === "sending" && <p className="mt-2 text-xs text-amber-300">Sending is in progress.</p>}
                  </section>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
