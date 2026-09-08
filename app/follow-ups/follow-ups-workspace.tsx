"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame, Loader2, RefreshCw, Search, Sparkles, Video } from "lucide-react";

type HeatReason = { points: number; because: string };
type Intel = {
  pains: string[];
  goals: string[];
  challenges: string[];
  wants: string[];
  objections: string[];
  in_their_words: string[];
  source: "recording" | "notes" | "none";
  confidence: "high" | "medium" | "low";
};
type Item = {
  id: string;
  name: string | null;
  call_date: string | null;
  call_type: string | null;
  result: string | null;
  offer: string | null;
  deal_amount: number | null;
  recording_url: string | null;
  email: string | null;
  phone: string | null;
  ghl_url: string | null;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  objections: string[];
  score: number;
  band: "hot" | "warm" | "cool";
  reasons: HeatReason[];
  available_source: "recording" | "notes" | "none";
  intel: Intel | null;
  intel_generated_at: string | null;
};
type Draft = { text?: string; email_subject?: string; email_body?: string; key_moments?: { label: string; value: string }[] };

const BAND_STYLE: Record<Item["band"], string> = {
  hot: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  warm: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  cool: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
};

const SOURCE_LABEL: Record<Intel["source"], string> = {
  recording: "Read from the recording",
  notes: "Read from typed notes, not a recording",
  none: "Nothing to read yet",
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0c]";

function whenLabel(value: string | null): string {
  if (!value) return "no date";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "no date";
  const days = Math.round((Date.now() - parsed.getTime()) / 86_400_000);
  const date = parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days <= 0) return `${date} · today`;
  if (days === 1) return `${date} · yesterday`;
  if (days <= 30) return `${date} · ${days} days ago`;
  return date;
}

function IntelList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="min-w-0">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="min-w-0 break-words text-sm leading-6 text-zinc-300 [overflow-wrap:anywhere]">• {item}</li>
        ))}
      </ul>
    </section>
  );
}

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</h4>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
          className={`${FOCUS} min-h-11 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-300 hover:text-white`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mt-2 min-w-0 whitespace-pre-wrap break-words rounded-xl border border-white/[0.07] bg-black/30 p-4 font-sans text-sm leading-6 text-zinc-200 [overflow-wrap:anywhere]">{value}</pre>
    </div>
  );
}

export default function FollowUpsWorkspace() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<"all" | Item["band"]>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, "analyzing" | "drafting" | undefined>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/follow-ups", { cache: "no-store" });
      const data = await response.json() as { items?: Item[]; error?: string };
      if (!response.ok || !data.items) throw new Error(data.error || "Follow-ups could not be loaded.");
      setItems(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Follow-ups could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const analyze = async (item: Item) => {
    setBusy((prev) => ({ ...prev, [item.id]: "analyzing" }));
    setRowError((prev) => ({ ...prev, [item.id]: "" }));
    try {
      const response = await fetch("/api/follow-ups/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: item.id }),
      });
      const data = await response.json() as { intel?: Intel; generated_at?: string; error?: string };
      if (!response.ok || !data.intel) throw new Error(data.error || "That call could not be analysed.");
      setItems((prev) => prev?.map((row) => row.id === item.id
        ? { ...row, intel: data.intel!, intel_generated_at: data.generated_at ?? null }
        : row) ?? prev);
    } catch (caught) {
      setRowError((prev) => ({ ...prev, [item.id]: caught instanceof Error ? caught.message : "That call could not be analysed." }));
    } finally {
      setBusy((prev) => ({ ...prev, [item.id]: undefined }));
    }
  };

  const draft = async (item: Item) => {
    setBusy((prev) => ({ ...prev, [item.id]: "drafting" }));
    setRowError((prev) => ({ ...prev, [item.id]: "" }));
    try {
      const intelBlock = item.intel
        ? [
            item.intel.pains.length && `Pain: ${item.intel.pains.join("; ")}`,
            item.intel.goals.length && `Goals: ${item.intel.goals.join("; ")}`,
            item.intel.challenges.length && `Challenges: ${item.intel.challenges.join("; ")}`,
            item.intel.wants.length && `What they wanted: ${item.intel.wants.join("; ")}`,
            item.intel.in_their_words.length && `Their words: ${item.intel.in_their_words.join(" | ")}`,
          ].filter(Boolean).join("\n")
        : "";
      const response = await fetch("/api/followup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          result: item.result,
          call_notes: intelBlock || undefined,
          objections: item.intel?.objections.length ? item.intel.objections : item.objections,
          offer: item.offer,
          deal_amount: item.deal_amount,
          showed: true,
          success: false,
          call_type: item.call_type,
          call_date: item.call_date,
          fathom_url: item.recording_url,
        }),
      });
      const data = await response.json() as Draft & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || "The follow-up could not be drafted.");
      setDrafts((prev) => ({ ...prev, [item.id]: data }));
    } catch (caught) {
      setRowError((prev) => ({ ...prev, [item.id]: caught instanceof Error ? caught.message : "The follow-up could not be drafted." }));
    } finally {
      setBusy((prev) => ({ ...prev, [item.id]: undefined }));
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (items ?? [])
      .filter((item) => band === "all" || item.band === band)
      .filter((item) => !needle || [item.name, item.offer, item.result, ...(item.intel?.pains ?? []), ...(item.intel?.goals ?? [])]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)));
  }, [band, items, query]);

  const counts = useMemo(() => ({
    hot: (items ?? []).filter((i) => i.band === "hot").length,
    warm: (items ?? []).filter((i) => i.band === "warm").length,
    analysed: (items ?? []).filter((i) => i.intel).length,
    recordings: (items ?? []).filter((i) => i.available_source === "recording").length,
  }), [items]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0a0a0c] p-4 shadow-2xl sm:p-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-rose-300/70"><Flame size={13} /> Sales</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Follow-Ups</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Everyone who took a sales call, did not buy, and is still worth a message. Ranked by how recoverable the conversation looks, with what they actually said and a draft ready to send.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading} className={`${FOCUS} flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-300 hover:text-white disabled:opacity-60`}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Hot", value: counts.hot },
          { label: "Warm", value: counts.warm },
          { label: "Analysed", value: counts.analysed },
          { label: "With a readable recording", value: counts.recordings },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5 sm:p-4">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">{label}</div>
            <p className="mt-2 text-xl font-semibold text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div role="alert" className="mt-5 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-300">
          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{error}</span>
          <button onClick={() => void load()} className={`${FOCUS} min-h-11 shrink-0 rounded px-2 underline`}>Reload</button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <label className="relative min-w-[12rem] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <span className="sr-only">Search follow-ups</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, offer, or what they said"
            className={`${FOCUS} min-h-11 w-full rounded-xl border border-zinc-600 bg-[#151518] pl-9 pr-3 text-base text-white placeholder:text-zinc-400 sm:text-sm`} />
        </label>
        <label>
          <span className="sr-only">Filter by heat</span>
          <select value={band} onChange={(event) => setBand(event.target.value as "all" | Item["band"])}
            className={`${FOCUS} min-h-11 w-full rounded-xl border border-zinc-600 bg-[#151518] px-3 text-base text-zinc-300 sm:w-44 sm:text-sm`}>
            <option value="all">All heat levels</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cool">Cool</option>
          </select>
        </label>
      </div>

      {items && <p aria-live="polite" className="mt-2 text-xs text-zinc-400">Showing {visible.length} of {items.length} follow-ups.</p>}

      {loading && !items && <div className="mt-6 rounded-2xl border border-white/[0.07] py-16 text-center text-sm text-zinc-400">Loading follow-ups…</div>}

      {items && visible.length === 0 && !loading && (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 py-16 text-center">
          <p className="text-sm text-zinc-400">{items.length === 0 ? "No calls in the last 90 days need a follow-up." : "No follow-ups match this filter."}</p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {visible.map((item) => {
          const expanded = open === item.id;
          const state = busy[item.id];
          return (
            <article key={item.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] transition hover:border-rose-400/20">
              <button
                onClick={() => setOpen(expanded ? null : item.id)}
                aria-expanded={expanded}
                className={`${FOCUS} flex min-h-11 w-full flex-wrap items-center gap-3 rounded-2xl p-4 text-left sm:p-5`}
              >
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ${BAND_STYLE[item.band]}`}>{item.band} · {item.score}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-zinc-100">{item.name || "Unnamed prospect"}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-400">
                    {whenLabel(item.call_date)}{item.result ? ` · ${item.result}` : ""}{item.offer ? ` · ${item.offer}` : ""}
                  </span>
                </span>
                {item.available_source === "recording" && <Video size={14} className="shrink-0 text-zinc-400" aria-label="A recording is available" />}
                {item.intel && <Sparkles size={14} className="shrink-0 text-blue-300" aria-label="Already analysed" />}
              </button>

              {expanded && (
                <div className="border-t border-white/[0.06] p-4 sm:p-5">
                  <section>
                    <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Why they are ranked here</h4>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {item.reasons.map((reason) => (
                        <li key={reason.because} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300">
                          {reason.because} <span className="text-zinc-500">+{reason.points}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  {item.intel ? (
                    <>
                      <p className="mt-5 text-xs text-zinc-400">
                        {SOURCE_LABEL[item.intel.source]} · {item.intel.confidence} confidence
                      </p>
                      <div className="mt-3 grid gap-5 sm:grid-cols-2">
                        <IntelList label="Pain points" items={item.intel.pains} />
                        <IntelList label="Goals" items={item.intel.goals} />
                        <IntelList label="Challenges" items={item.intel.challenges} />
                        <IntelList label="What they wanted" items={item.intel.wants} />
                        <IntelList label="Objections" items={item.intel.objections} />
                        <IntelList label="In their words" items={item.intel.in_their_words} />
                      </div>
                    </>
                  ) : (
                    <p className="mt-5 text-sm text-zinc-400">
                      {item.available_source === "recording"
                        ? "A recording is available. Analyse it to pull out their pain, goals, and objections."
                        : item.available_source === "notes"
                          ? "No recording we can reach, but there are typed notes to read."
                          : "No recording and no notes for this call, so there is nothing to analyse yet."}
                    </p>
                  )}

                  {rowError[item.id] && (
                    <p role="alert" className="mt-4 break-words rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-300 [overflow-wrap:anywhere]">{rowError[item.id]}</p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      onClick={() => void analyze(item)}
                      disabled={Boolean(state) || item.available_source === "none"}
                      className={`${FOCUS} flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-200 hover:text-white disabled:opacity-50`}
                    >
                      {state === "analyzing" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                      {item.intel ? "Re-analyse call" : "Analyse call"}
                    </button>
                    <button
                      onClick={() => void draft(item)}
                      disabled={Boolean(state)}
                      className={`${FOCUS} flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50`}
                    >
                      {state === "drafting" ? <Loader2 size={15} className="animate-spin" /> : <Flame size={15} />}
                      Draft follow-up
                    </button>
                    {item.recording_url && (
                      <a href={item.recording_url} target="_blank" rel="noreferrer"
                        className={`${FOCUS} flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-zinc-300 hover:text-white`}>
                        <Video size={15} /> Recording
                      </a>
                    )}
                    {item.ghl_url && (
                      <a href={item.ghl_url} target="_blank" rel="noreferrer"
                        className={`${FOCUS} flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm text-zinc-300 hover:text-white`}>
                        Open in GoHighLevel
                      </a>
                    )}
                  </div>

                  {drafts[item.id] && (
                    <div className="mt-6 space-y-5 border-t border-white/[0.06] pt-5">
                      {drafts[item.id].text && <Copyable label="Text message" value={drafts[item.id].text!} />}
                      {drafts[item.id].email_body && (
                        <Copyable
                          label={`Email${drafts[item.id].email_subject ? ` · ${drafts[item.id].email_subject}` : ""}`}
                          value={`${drafts[item.id].email_subject ?? ""}\n\n${drafts[item.id].email_body ?? ""}`.trim()}
                        />
                      )}
                      <p className="text-xs text-zinc-400">Drafted for you to review. Nothing is sent from this page.</p>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
