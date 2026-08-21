"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SubTabs } from "@/components/sub-tabs";
import type { PublicHotInstagramContext } from "@/lib/hot-leads";

type HotLeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  prospect_stage: string | null;
  quality: string | null;
  source: string | null;
  notes: string | null;
  ongoing_message_feed: string | null;
  ghl_contact_id: string | null;
  instagram_url: string | null;
  social_url: string | null;
  last_update: string | null;
  hot: boolean | null;
  instagram: PublicHotInstagramContext | null;
};

type ResponseBody = { leads: HotLeadRow[]; total: number; limit: 50; instagram_synced_at: string };

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?"; }
function formatTime(value: string | null) { return value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No recent activity"; }
function errorMessage(value: unknown) {
  if (typeof value !== "object" || value === null || !("error" in value) || typeof value.error !== "string") return "Something went wrong. Refresh and try again.";
  return value.error.slice(0, 500);
}

export default function HotLeadsPage() {
  const [data, setData] = useState<ResponseBody | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/hot-leads", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const next = body as ResponseBody;
      setData(next);
      setDrafts((current) => ({ ...Object.fromEntries(next.leads.filter((row) => row.instagram).map((row) => [row.id, row.instagram!.draft_reply])), ...current }));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load Hot leads."); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data?.leads ?? [];
    return (data?.leads ?? []).filter((row) => [row.full_name, row.email, row.source, row.prospect_stage, row.instagram?.instagram_handle].some((value) => value?.toLowerCase().includes(term)));
  }, [data, query]);

  async function remove(row: HotLeadRow) {
    const confirmed = window.confirm(`Remove ${row.full_name || "this person"} from Hot?${row.prospect_stage === "🔥 Hot Prospect" ? " Their pipeline stage will move back to Prospect." : ""}`);
    if (!confirmed) return;
    setBusy(row.id);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${row.id}/hot`, { method: "DELETE" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      setData((current) => current ? { ...current, leads: current.leads.filter((lead) => lead.id !== row.id), total: Math.max(0, current.total - 1) } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove this lead."); }
    finally { setBusy(null); }
  }

  async function patchInstagram(row: HotLeadRow, body: Record<string, unknown>) {
    if (!row.instagram) return;
    setBusy(row.id);
    setError(null);
    try {
      const response = await fetch(`/api/hot-leads/current/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(result));
      const context = result as PublicHotInstagramContext;
      setData((current) => current ? { ...current, leads: current.leads.map((lead) => lead.id === row.id ? { ...lead, instagram: context } : lead) } : current);
      setDrafts((current) => ({ ...current, [row.id]: context.draft_reply }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the Instagram message."); }
    finally { setBusy(null); }
  }

  async function saveDraft(row: HotLeadRow) {
    if (!row.instagram) return;
    await patchInstagram(row, { draft_reply: drafts[row.id] ?? "", expected_revision: row.instagram.revision });
  }

  async function approve(row: HotLeadRow) {
    if (!row.instagram) return;
    const confirmed = window.confirm(`Send on Instagram to @${row.instagram.instagram_handle}?\n\n${row.instagram.draft_reply}`);
    if (!confirmed) return;
    await patchInstagram(row, { status: "approved", expected_draft_reply: row.instagram.draft_reply, expected_revision: row.instagram.revision });
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SubTabs group="leads" />
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><h1 className="text-2xl font-bold">🔥 Hot</h1><p className="mt-1 max-w-3xl text-sm text-zinc-400">Up to 50 priority prospects from your regular Leads list, including everyone marked Hot or in the Hot Prospect stage. Review Instagram history, message them, or remove them from Hot.</p></div>
          <div className="text-xs text-zinc-500">{data ? `${data.leads.length} shown · ${data.total} total` : "Loading…"}<br />{data?.instagram_synced_at.startsWith("1970-") ? "Instagram not synced yet" : `Instagram synced ${data ? formatTime(data.instagram_synced_at) : "—"}`}</div>
        </div>

        <div className="mb-4 flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Hot leads…" className="min-h-11 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm outline-none focus:border-orange-500" /><button onClick={() => void load()} className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-sm font-semibold">Refresh</button></div>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-800/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {!data && !error && <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-500">Loading Hot leads…</div>}
        {data && rows.length === 0 && <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-500">No Hot leads match this view. Tap 🔥 beside any person in Leads to add them here.</div>}

        <div className="space-y-4">
          {rows.map((row) => {
            const instagram = row.instagram;
            const draft = drafts[row.id] ?? instagram?.draft_reply ?? "";
            const changed = !!instagram && draft !== instagram.draft_reply;
            const locked = instagram?.status === "sending" || instagram?.status === "sent";
            return (
              <article key={row.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
                <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(200px,0.75fr)_minmax(300px,1.2fr)_minmax(330px,1.25fr)]">
                  <section>
                    <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full bg-orange-500 text-sm font-bold text-white">{initials(row.full_name || "Lead")}</div><div className="min-w-0"><h2 className="truncate font-semibold">{row.full_name || "Unnamed lead"}</h2><p className="truncate text-xs text-zinc-500">{row.source || "SalesOS lead"}</p></div></div>
                    <div className="mt-3 flex flex-wrap gap-2">{row.prospect_stage && <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs text-orange-300">{row.prospect_stage}</span>}{row.quality && <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">{row.quality}</span>}</div>
                    <p className="mt-3 text-xs text-zinc-500">Last update {formatTime(row.last_update)}</p>
                    <button onClick={() => void remove(row)} disabled={busy === row.id} className="mt-4 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 hover:border-rose-700 hover:text-rose-300 disabled:opacity-50">Remove from Hot</button>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Instagram conversation</h3>
                    {instagram ? <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">{instagram.messages.length ? instagram.messages.map((message) => <div key={message.id} className={`flex ${message.is_sender ? "justify-end" : "justify-start"}`}><div className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm ${message.is_sender ? "bg-pink-600 text-white" : "bg-zinc-800 text-zinc-200"}`}><p className="whitespace-pre-wrap break-words">{message.text || "(media message)"}</p><p className={`mt-1 text-[10px] ${message.is_sender ? "text-white/70" : "text-zinc-500"}`}>{formatTime(message.timestamp)}</p></div></div>) : <p className="py-4 text-center text-xs text-zinc-600">No recent text messages.</p>}</div> : <div className="mt-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-950 p-5 text-center text-sm text-zinc-500">{row.instagram_url ? "Instagram is linked. The automatic Unipile sync is matching this conversation." : "Add their Instagram URL in Leads so Unipile can match the conversation."}</div>}
                    {instagram && <a href={`https://www.instagram.com/${encodeURIComponent(instagram.instagram_handle)}/`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-pink-300">Open @{instagram.instagram_handle} ↗</a>}
                  </section>

                  <section>
                    <label htmlFor={`draft-${row.id}`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Instagram message</label>
                    <textarea id={`draft-${row.id}`} value={draft} maxLength={2000} disabled={!instagram || locked || busy === row.id} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))} placeholder={instagram ? "Write the exact message…" : "Instagram conversation not matched yet"} className="mt-2 min-h-36 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm leading-6 outline-none focus:border-pink-500 disabled:opacity-50" />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><button onClick={() => void saveDraft(row)} disabled={!instagram || !changed || locked || busy === row.id} className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-sm font-semibold disabled:opacity-40">Save edit</button><button onClick={() => void approve(row)} disabled={!instagram || changed || !instagram.draft_reply || locked || busy === row.id || instagram.status === "approved"} className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-pink-600 to-fuchsia-600 px-4 text-sm font-semibold text-white disabled:opacity-40">Send on Instagram</button></div>
                    {changed && <p className="mt-2 text-xs text-amber-300">Save this edit before sending.</p>}
                    {instagram?.status === "approved" && <p className="mt-2 text-xs text-blue-300">Approved and queued through Unipile. Only this exact copy can send.</p>}
                    {instagram?.status === "sending" && <p className="mt-2 text-xs text-amber-300">Sending through Unipile now.</p>}
                    {instagram?.status === "sent" && <p className="mt-2 text-xs text-emerald-300">Sent through Unipile {formatTime(instagram.sent_at)}</p>}
                    {instagram?.status === "failed" && <p className="mt-2 text-xs text-rose-300">{instagram.last_error || "Send failed. Review and retry."}</p>}
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
