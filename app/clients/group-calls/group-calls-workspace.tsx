"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { Attendance } from "@/lib/group-calls";
import {
  CALL_TYPES, SERIES, buildShareMessage, callDateLabel, formatStamp, groupByWeek, linkName, matchesQuery,
  type CallType, type Chapter, type SharedLink,
} from "@/lib/group-call-recap";

// Every Monday, Tuesday and Thursday group call from the last 60 days: what it
// was about, the links shared on it, and a replay link that can be sent as is.
//
// The recap, chapters and links are written once when the recording comes in.
// This page reads them, lets Andrew correct a word the transcript misheard, and
// copies a ready-to-send message. Nothing here posts anywhere on its own.

type Attendee = { name: string; email?: string | null; source?: string };
type FollowUp = { text: string; owner?: string | null; done?: boolean };
type Spotlight = { name: string; topic?: string | null };
type Recording = { source: string; url: string };

type Call = {
  id: string;
  call_date: string;
  call_type: CallType | null;
  starts_at: string | null;
  title: string | null;
  source: string | null;
  duration_minutes: number | null;
  share_url: string | null;
  recording_url: string | null;
  recordings: Recording[] | null;
  attendees: Attendee[] | null;
  attendee_count: number | null;
  invited_count: number | null;
  summary: string | null;
  highlights: string[] | null;
  chapters: (Chapter & { url?: string | null })[] | null;
  links: SharedLink[] | null;
  spotlights: Spotlight[] | null;
  follow_ups: FollowUp[] | null;
  recording_sent: boolean | null;
  recording_sent_at: string | null;
  fam_draft: string | null;
  fam_sent_at: string | null;
  mastermind_draft: string | null;
  mastermind_sent_at: string | null;
  attendance?: Attendance;
};

type Payload = { calls: Call[]; today: string; windowStart: string; windowDays: number };

// One accent per series, used for the date tile, the pill and the filter card.
const ACCENT: Record<CallType, { bar: string; pill: string; card: string; ring: string; dot: string }> = {
  laser: {
    bar: "border-l-orange-500", pill: "border-orange-500/30 bg-orange-500/10 text-orange-200",
    card: "from-orange-500/15", ring: "ring-orange-500/60", dot: "bg-orange-400",
  },
  ai: {
    bar: "border-l-violet-500", pill: "border-violet-500/30 bg-violet-500/10 text-violet-200",
    card: "from-violet-500/15", ring: "ring-violet-500/60", dot: "bg-violet-400",
  },
  mastermind: {
    bar: "border-l-sky-500", pill: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    card: "from-sky-500/15", ring: "ring-sky-500/60", dot: "bg-sky-400",
  },
  referral: {
    bar: "border-l-emerald-500", pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    card: "from-emerald-500/15", ring: "ring-emerald-500/60", dot: "bg-emerald-400",
  },
};
const NEUTRAL = { bar: "border-l-zinc-600", pill: "border-zinc-700 bg-zinc-800/60 text-zinc-300" };

function accent(type: CallType | null) {
  return type ? ACCENT[type] : NEUTRAL;
}

function minutes(n: number | null) {
  if (!n) return null;
  return n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m` : `${n} min`;
}

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/**
 * The older copy path, for browsers and embedded views that refuse the
 * Clipboard API. Selecting a hidden textarea still works almost everywhere.
 */
function copyBySelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Copy to the clipboard and say so for two seconds. A copy that fails says so
 * too: a button that silently does nothing gets a link pasted that was never
 * on the clipboard.
 */
function useCopy() {
  const [state, setState] = useState<{ key: string; ok: boolean } | null>(null);
  const copy = useCallback(async (key: string, text: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = copyBySelection(text);
    }
    setState({ key, ok });
    window.setTimeout(() => setState((s) => (s?.key === key ? null : s)), ok ? 2000 : 4000);
  }, []);
  const label = (key: string, idle: string, done = "✓ Copied") =>
    state?.key !== key ? idle : state.ok ? done : "Couldn't copy";
  return { copy, label };
}

/* ── Attendance: kept from the board this page replaced ─────────────────── */

function Showed({ call, onCount }: { call: Call; onCount: (n: number) => void }) {
  const a = call.attendance;
  const fallback = call.attendees ?? [];
  const names = a?.names.length ? a.names : fallback;

  if (!a || a.source === "none") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Headcount not recorded</span>
        <input type="number" min={0} placeholder="—" aria-label={`How many came to the ${callDateLabel(call.call_date)} call`}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const n = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(n) && n >= 0) onCount(Math.floor(n));
          }}
          className="w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none" />
        <span className="text-[11px] text-zinc-600">type a number, press enter</span>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <span className="font-semibold text-white">{a.count}</span>
      <span className="text-zinc-500"> on the call</span>
      {call.invited_count ? <span className="text-zinc-600"> · {call.invited_count} invited</span> : null}
      {names.length > 0 && <div className="mt-1 text-zinc-400">{names.map((n) => n.name).join(", ")}</div>}
    </div>
  );
}

/* ── One call, opened ──────────────────────────────────────────────────── */

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function CallDetail({ call, onPatch, onSend, sending, confirming, setConfirming }: {
  call: Call;
  onPatch: (fields: Record<string, unknown>) => void;
  onSend: (channel: "fam" | "mastermind") => void;
  sending: string | null;
  confirming: string | null;
  setConfirming: (key: string | null) => void;
}) {
  const { copy, label } = useCopy();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(call.title ?? "");
  const [draftSummary, setDraftSummary] = useState(call.summary ?? "");
  const [draftHighlights, setDraftHighlights] = useState((call.highlights ?? []).join("\n"));

  const links = call.links ?? [];
  const chapters = call.chapters ?? [];
  const highlights = call.highlights ?? [];
  const spotlights = call.spotlights ?? [];
  const followUps = call.follow_ups ?? [];
  const recordings = call.recordings?.length
    ? call.recordings
    : call.share_url ? [{ source: call.source ?? "recording", url: call.share_url }] : [];
  const message = buildShareMessage(call);
  const hasDrafts = Boolean(call.fam_draft || call.mastermind_draft);

  const save = () => {
    onPatch({
      title: draftTitle.trim() || call.title,
      summary: draftSummary.trim() || null,
      highlights: draftHighlights.split("\n").map((h) => h.trim()).filter(Boolean),
    });
    setEditing(false);
  };

  return (
    <div className="grid gap-6 border-t border-zinc-800/70 bg-zinc-950/40 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {editing ? (
          <div className="space-y-3 rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-4">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Title</span>
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recap</span>
              <textarea value={draftSummary} onChange={(e) => setDraftSummary(e.target.value)} rows={4}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-white focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">What we covered · one per line</span>
              <textarea value={draftHighlights} onChange={(e) => setDraftHighlights(e.target.value)} rows={6}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-white focus:border-blue-500 focus:outline-none" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={save}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">Save</button>
              <button type="button" onClick={() => setEditing(false)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500">Cancel</button>
            </div>
          </div>
        ) : (
          <Section title="Recap" aside={
            <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-zinc-500 hover:text-white">
              ✎ Edit
            </button>
          }>
            {call.summary
              ? <p className="text-sm leading-relaxed text-zinc-200">{call.summary}</p>
              : <p className="text-sm text-zinc-500">No recap written yet.</p>}
            {highlights.length > 0 && (
              <ul className="mt-4 space-y-2">
                {highlights.map((h, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-zinc-300">
                    <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${call.call_type ? ACCENT[call.call_type].dot : "bg-zinc-500"}`} />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {links.length > 0 && (
          <Section title={`Links shared · ${links.length}`}>
            <ul className="divide-y divide-zinc-800/70 overflow-hidden rounded-xl border border-zinc-800">
              {links.map((link) => (
                <li key={link.url} className="flex items-center gap-3 bg-zinc-900/40 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <a href={link.url} target="_blank" rel="noreferrer"
                      className="block truncate text-sm font-medium text-white hover:text-blue-300">
                      {linkName(link)}
                    </a>
                    <p className="truncate text-[11px] text-zinc-500">
                      {host(link.url)}
                      {link.sharedBy ? ` · shared by ${link.sharedBy}` : ""}
                      {link.at ? ` at ${link.at.replace(/^00:/, "")}` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={() => void copy(link.url, link.url)}
                    className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-white">
                    {label(link.url, "Copy")}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {chapters.length > 0 && (
          <Section title="Chapters">
            <ol className="grid gap-1.5 sm:grid-cols-2">
              {chapters.map((c) => {
                const body = (
                  <>
                    <span className="w-16 shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">{formatStamp(c.seconds)}</span>
                    <span className="min-w-0 truncate">{c.label}</span>
                  </>
                );
                return (
                  <li key={`${c.seconds}-${c.label}`}>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800/60 hover:text-white">
                        {body}
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Section>
        )}

        {followUps.length > 0 && (
          <Section title="Next steps from the call">
            <ul className="space-y-1.5">
              {followUps.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-zinc-300">
                  <span className="text-zinc-600">→</span>
                  <span>{f.text}{f.owner ? <span className="text-zinc-500"> · {f.owner}</span> : null}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <aside className="space-y-5">
        <Section title="Share">
          <div className="space-y-2">
            {recordings.map((r) => (
              <div key={r.url} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2">
                <a href={r.url} target="_blank" rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-white hover:text-blue-300">
                  <span>▶</span>
                  <span className="truncate">Watch on {r.source === "fathom" ? "Fathom" : r.source === "zoom" ? "Zoom" : "the recording"}</span>
                </a>
                <button type="button" onClick={() => void copy(r.url, r.url)}
                  className="shrink-0 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700">
                  {label(r.url, "Copy link")}
                </button>
              </div>
            ))}
            <button type="button" onClick={() => void copy("message", message)}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 hover:from-blue-500 hover:to-blue-400">
              {label("message", "Copy recap message", "✓ Recap message copied")}
            </button>
            <p className="text-[11px] leading-relaxed text-zinc-600">
              Title, recap, replay link and the links from the call, ready to paste into WhatsApp, Skool or an email.
            </p>
            <label className="flex items-center gap-2 pt-1 text-xs text-zinc-400">
              <input type="checkbox" checked={!!call.recording_sent}
                onChange={(e) => onPatch({ recording_sent: e.target.checked })} />
              {call.recording_sent_at
                ? `Sent to members ${new Date(call.recording_sent_at).toLocaleDateString()}`
                : "Mark as sent to members"}
            </label>
          </div>
        </Section>

        {spotlights.length > 0 && (
          <Section title="In the spotlight">
            <ul className="space-y-2">
              {spotlights.map((s) => (
                <li key={s.name} className="text-sm">
                  <span className="font-medium text-white">{s.name}</span>
                  {s.topic ? <span className="block text-xs text-zinc-500">{s.topic}</span> : null}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Attendance">
          <Showed call={call} onCount={(n) => onPatch({ attendee_count: n })} />
        </Section>

        {hasDrafts && (
          <Section title="Posts waiting on you">
            <div className="space-y-4">
              {(["fam", "mastermind"] as const).map((k) => {
                const draft = k === "fam" ? call.fam_draft : call.mastermind_draft;
                if (!draft) return null;
                const sentAt = k === "fam" ? call.fam_sent_at : call.mastermind_sent_at;
                const key = `${call.id}:${k}`;
                return (
                  <div key={k}>
                    <p className="mb-1 text-xs font-medium text-zinc-300">
                      {k === "fam" ? "7-Figure CEO Fam channel" : "Mastermind channel"}
                    </p>
                    <textarea
                      className="h-32 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-300"
                      defaultValue={draft}
                      onBlur={(e) => onPatch({ [`${k}_draft`]: e.target.value })}
                    />
                    {sentAt ? (
                      <p className="mt-1 text-xs text-emerald-400">Posted {new Date(sentAt).toLocaleString()}.</p>
                    ) : confirming === key ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-amber-400">Post this to the group?</span>
                        <button type="button" onClick={() => onSend(k)}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500">Yes, post it</button>
                        <button type="button" onClick={() => setConfirming(null)}
                          className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirming(key)} disabled={sending === key}
                        className="mt-2 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50">
                        {sending === key ? "sending…" : "Send to WhatsApp"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </aside>
    </div>
  );
}

/* ── A row in the list ─────────────────────────────────────────────────── */

function CallRow({ call, open, onToggle }: { call: Call; open: boolean; onToggle: () => void }) {
  const { copy, label } = useCopy();
  const tone = accent(call.call_type);
  const series = call.call_type ? SERIES[call.call_type] : null;
  const links = call.links?.length ?? 0;
  const primary = call.recordings?.[0]?.url ?? call.share_url;

  return (
    <div className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-5 ${open ? "bg-zinc-900/60" : ""}`}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex min-w-0 flex-1 items-start gap-4 text-left">
        <div className={`w-14 shrink-0 border-l-[3px] ${tone.bar} pl-3`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {callDateLabel(call.call_date, { weekday: "short" })}
          </p>
          <p className="text-2xl font-bold leading-none text-white tabular-nums">
            {callDateLabel(call.call_date, { day: "numeric" })}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
            {callDateLabel(call.call_date, { month: "short" })}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.pill}`}>
              {series ? `${series.emoji} ${series.short}` : "Group call"}
            </span>
            {minutes(call.duration_minutes) && <span className="text-[11px] text-zinc-500">{minutes(call.duration_minutes)}</span>}
            {links > 0 && <span className="text-[11px] text-zinc-500">🔗 {links} {links === 1 ? "link" : "links"}</span>}
            {call.recording_sent && <span className="text-[11px] text-emerald-400">✓ sent</span>}
          </div>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{call.title ?? series?.name ?? "Group call"}</p>
          {call.summary && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-400">{call.summary}</p>}
        </div>

        <span aria-hidden className={`mt-1 hidden text-zinc-600 transition-transform sm:block ${open ? "rotate-90" : ""}`}>›</span>
      </button>

      {primary && (
        <div className="flex shrink-0 gap-2 pl-[4.5rem] sm:pl-0">
          <a href={primary} target="_blank" rel="noreferrer"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-white">
            ▶ Watch
          </a>
          <button type="button" onClick={() => void copy("link", primary)}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700">
            {label("link", "Copy link")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── The page ──────────────────────────────────────────────────────────── */

export default function GroupCallsWorkspace() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CallType | "all">("all");
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Load failures replace the page. Save and send failures must not -- they are
  // transient, and blowing away the list loses the drafts you were reading.
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-calls", { cache: "no-store" });
      const body = await res.json();
      if (body.error) setError(body.error);
      else setData(body as Payload);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function patch(id: string, fields: Record<string, unknown>) {
    setData((prev) => prev && { ...prev, calls: prev.calls.map((c) => (c.id === id ? { ...c, ...fields } as Call : c)) });
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

  const inWindow = useMemo(
    () => (data?.calls ?? []).filter((c) => c.call_date >= (data?.windowStart ?? "") && c.call_date <= (data?.today ?? "9999")),
    [data],
  );
  const counts = useMemo(() => {
    const byType = Object.fromEntries(CALL_TYPES.map((t) => [t, inWindow.filter((c) => c.call_type === t)])) as Record<CallType, Call[]>;
    const hours = Math.round(inWindow.reduce((sum, c) => sum + (c.duration_minutes ?? 0), 0) / 60);
    const links = inWindow.reduce((sum, c) => sum + (c.links?.length ?? 0), 0);
    return { byType, hours, links };
  }, [inWindow]);
  const visible = useMemo(
    () => inWindow.filter((c) => (filter === "all" || c.call_type === filter) && matchesQuery(c, query)),
    [inWindow, filter, query],
  );
  const weeks = useMemo(() => groupByWeek(visible), [visible]);

  if (error) return <p className="p-6 text-sm text-red-400">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-zinc-800/60" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-900" />)}
        </div>
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-900" />)}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl">📞 Group Calls</h1>
        <p className="text-sm text-zinc-500">
          Every Monday, Tuesday and Thursday call from the last {data.windowDays} days. {inWindow.length} calls,
          {" "}{counts.hours} hours of coaching, {counts.links} links shared. Open one for the recap and a link you can send.
        </p>
      </header>

      {actionError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="flex-1 text-sm text-red-300">{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} className="text-xs text-red-400/70 hover:text-red-200">dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CALL_TYPES.map((type) => {
          const series = SERIES[type];
          const list = counts.byType[type];
          const active = filter === type;
          return (
            <button key={type} type="button" onClick={() => setFilter(active ? "all" : type)} aria-pressed={active}
              className={`rounded-2xl border border-zinc-800 bg-gradient-to-br ${ACCENT[type].card} to-zinc-900/40 p-4 text-left transition hover:border-zinc-700 ${active ? `ring-2 ${ACCENT[type].ring}` : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-xl">{series.emoji}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{series.day}s</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{series.short}</p>
              <p className="text-xs text-zinc-400">
                {list.length} {list.length === 1 ? "call" : "calls"}
                {list[0] ? ` · last ${callDateLabel(list[0].call_date, { month: "short", day: "numeric" })}` : ""}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === "all" ? "border-white/20 bg-white text-zinc-900" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
            All · {inWindow.length}
          </button>
          {CALL_TYPES.map((type) => (
            <button key={type} type="button" onClick={() => setFilter(type)} aria-pressed={filter === type}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === type ? ACCENT[type].pill : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
              {SERIES[type].emoji} {SERIES[type].short}
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topics, members, tools, links…"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none sm:ml-auto sm:w-72" />
      </div>

      {weeks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
          <p className="text-sm text-zinc-400">
            {inWindow.length === 0 ? "No group calls in the last 60 days yet." : "No calls match that."}
          </p>
          {(query || filter !== "all") && (
            <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}
              className="mt-3 text-xs text-blue-400 hover:underline">Clear the filters</button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {weeks.map(({ week, calls }) => (
            <section key={week}>
              <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Week of {callDateLabel(week, { month: "long", day: "numeric" })}
              </h2>
              <div className="divide-y divide-zinc-800/70 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30">
                {calls.map((call) => (
                  <div key={call.id}>
                    <CallRow call={call} open={openId === call.id} onToggle={() => setOpenId(openId === call.id ? null : call.id)} />
                    {openId === call.id && (
                      <CallDetail
                        call={call}
                        onPatch={(fields) => void patch(call.id, fields)}
                        onSend={(channel) => void send(call.id, channel)}
                        sending={sending}
                        confirming={confirming}
                        setConfirming={setConfirming}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
