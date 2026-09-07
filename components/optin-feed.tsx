"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// Leads → New Leads. A live spreadsheet of who opted in and where, straight
// from GoHighLevel, newest first. Instagram is filtered out server-side.

type OptIn = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  opted_in_at: string | null;
  opted_in_via: string;
  medium: string | null;
  ghl_url: string;
  stage: string | null;
  lead_id: string | null;
};

const STAGES = [
  "👨 Prospect", "📣 Reached Out", "🔥 Hot Prospect",
  "📞 Call Booked", "🔗 Pay Link Sent", "🏦 Payment Received",
];

type Feed = { optins: OptIn[]; scanned: number; skipped_instagram: number; error?: string };

const VIA_CHIP: Record<string, string> = {
  Skool: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  "Lead magnet": "bg-violet-500/15 text-violet-200 border-violet-500/30",
  "Booked a call": "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  Facebook: "bg-blue-500/15 text-blue-200 border-blue-500/30",
};
const chipFor = (via: string) => VIA_CHIP[via] ?? "bg-zinc-800 text-zinc-300 border-zinc-700";

function dayLabel(iso: string | null) {
  if (!iso) return { day: "—", ago: "" };
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return {
    day: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    ago: days <= 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`,
  };
}

const COLS = "grid grid-cols-[86px_minmax(0,1fr)_130px_168px_minmax(0,1.1fr)_40px] items-center gap-3";

export function OptInFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [via, setVia] = useState<string | null>(null);
  const [open, setOpen] = useState<OptIn | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Setting a stage promotes the opt-in into a real lead if it isn't one yet.
  const setStage = useCallback(async (o: OptIn, stage: string) => {
    if (!stage) return;
    setSaving(o.id);
    try {
      const res = await fetch(`/api/leads/optins/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, name: o.name, email: o.email, phone: o.phone, source: o.opted_in_via, opted_in_at: o.opted_in_at }),
      });
      const json = (await res.json()) as { error?: string; lead_id?: string };
      if (json.error) throw new Error(json.error);
      const patch = (x: OptIn) => (x.id === o.id ? { ...x, stage, lead_id: json.lead_id ?? x.lead_id } : x);
      setFeed((f) => (f ? { ...f, optins: f.optins.map(patch) } : f));
      setOpen((cur) => (cur && cur.id === o.id ? patch(cur) : cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the stage");
    } finally {
      setSaving(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/leads/optins?limit=150", { cache: "no-store" });
      const json = (await res.json()) as Feed;
      if (json.error) throw new Error(json.error);
      setFeed(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load opt-ins");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const all = useMemo(() => feed?.optins ?? [], [feed]);
  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of all) counts.set(o.opted_in_via, (counts.get(o.opted_in_via) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const q = query.trim().toLowerCase();
  const rows = all
    .filter((o) => !via || o.opted_in_via === via)
    .filter((o) => !q || [o.name, o.email, o.phone, o.opted_in_via].some((v) => (v ?? "").toLowerCase().includes(q)));

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
      <div className="border-b border-zinc-800 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-white">🌱 New Leads</h2>
            <p className="text-xs text-zinc-400">
              Live opt-ins from GoHighLevel, newest first. Instagram is left out.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {feed && (
              <span className="text-xs text-zinc-500">
                {rows.length} shown · {feed.skipped_instagram} Instagram skipped of {feed.scanned} scanned
              </span>
            )}
            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, phone…"
          aria-label="Search opt-ins"
          className="mb-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-600 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setVia(null)}
            className={cn("rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
              !via ? "border-blue-500 bg-blue-500/20 text-blue-100" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white")}
          >
            All {all.length}
          </button>
          {sources.map(([label, count]) => (
            <button
              key={label}
              onClick={() => setVia(via === label ? null : label)}
              className={cn("rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                via === label ? "border-blue-500 bg-blue-500/20 text-blue-100" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white")}
            >
              {label} {count}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("hidden border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 md:grid", COLS)}>
        {["Opted in", "Person", "Where", "Stage", "Email", ""].map((h, i) => (
          <span key={i} className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{h}</span>
        ))}
      </div>

      {error ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-rose-300">{error}</p>
          <button onClick={() => void load()} className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white">Try again</button>
        </div>
      ) : loading && !feed ? (
        <p className="px-4 py-12 text-center text-sm text-zinc-500 animate-pulse">Reading opt-ins from GoHighLevel…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-zinc-500">
          {all.length === 0 ? "No opt-ins found outside Instagram." : "Nothing matches those filters."}
        </p>
      ) : (
        <div className="divide-y divide-zinc-800/80">
          {rows.map((o) => {
            const { day, ago } = dayLabel(o.opted_in_at);
            return (
              <div
                key={o.id}
                onClick={() => setOpen(o)}
                className={cn("cursor-pointer px-4 py-2.5 transition-colors hover:bg-zinc-900/50", COLS.replace("grid ", "md:grid "))}
              >
                <div className="flex items-baseline gap-2 md:block">
                  <span className="text-sm font-semibold text-zinc-200">{day}</span>
                  <span className="block text-[11px] text-zinc-500">{ago}</span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold capitalize text-white md:mt-0">{o.name ?? "\u2014"}</p>
                <span className={cn("mt-1 inline-block w-fit rounded-full border px-2 py-0.5 text-[11px] font-bold md:mt-0", chipFor(o.opted_in_via))}>
                  {o.opted_in_via}
                </span>

                {/* Setting a stage on an opt-in is what makes it a real lead. */}
                <select
                  aria-label={`Pipeline stage for ${o.name ?? "this opt-in"}`}
                  value={o.stage ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => void setStage(o, e.target.value)}
                  disabled={saving === o.id}
                  className={cn(
                    "mt-1 w-full rounded-lg border bg-zinc-950 px-2 py-1.5 text-xs disabled:opacity-50 md:mt-0",
                    o.stage ? "border-zinc-700 text-zinc-200" : "border-dashed border-zinc-700 text-zinc-500",
                  )}
                >
                  <option value="">{saving === o.id ? "Saving…" : "Add to pipeline…"}</option>
                  {STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>

                <p className="mt-1 truncate text-xs text-zinc-400 md:mt-0">{o.email ?? "\u2014"}</p>
                <a
                  href={o.ghl_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open in GoHighLevel"
                  className="mt-1 inline-block text-zinc-500 hover:text-white md:mt-0"
                >\u2197</a>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <OptInDrawer
          optin={open}
          onClose={() => setOpen(null)}
          onStage={(stage: string) => void setStage(open, stage)}
          saving={saving === open.id}
        />
      )}
    </section>
  );
}

// Click-into view for one opt-in: who they are, where they came from, their
// pipeline stage, and a composer to reach them through GoHighLevel.
function OptInDrawer({ optin, onClose, onStage, saving }: {
  optin: OptIn;
  onClose: () => void;
  onStage: (stage: string) => void;
  saving: boolean;
}) {
  const [channel, setChannel] = useState<"SMS" | "Email">(optin.phone ? "SMS" : "Email");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const destination = channel === "Email" ? optin.email : optin.phone;
  const { day } = dayLabel(optin.opted_in_at);

  async function send() {
    if (!destination || !message.trim() || sending) return;
    setSending(true); setSendError(null); setSent(null);
    try {
      const res = await fetch(`/api/leads/optins/${optin.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The address shown here is sent back and re-checked against GoHighLevel,
        // so a stale screen can't quietly message the wrong person.
        body: JSON.stringify({ channel, message: message.trim(), expected_destination: destination }),
      });
      const json = (await res.json()) as { error?: string; warning?: string };
      if (json.error) throw new Error(json.error);
      setSent(json.warning ?? `Sent by ${channel}.`);
      setMessage("");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 p-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black capitalize text-white">{optin.name ?? "Unnamed opt-in"}</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Opted in {day} via <span className="font-semibold text-zinc-300">{optin.opted_in_via}</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-zinc-500 hover:text-white">×</button>
        </div>

        <div className="space-y-5 p-4">
          <div className="space-y-1.5 text-sm">
            {optin.email && <p className="break-all text-zinc-300"><span className="text-zinc-500">Email </span>{optin.email}</p>}
            {optin.phone && <p className="text-zinc-300"><span className="text-zinc-500">Phone </span>{optin.phone}</p>}
            <a href={optin.ghl_url} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 text-xs font-bold text-blue-400 hover:text-blue-300">
              Open in GoHighLevel ↗
            </a>
          </div>

          <div>
            <label htmlFor="optin-stage" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">Pipeline stage</label>
            <select
              id="optin-stage"
              value={optin.stage ?? ""}
              disabled={saving}
              onChange={(e) => onStage(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white disabled:opacity-50"
            >
              <option value="">{saving ? "Saving…" : "Add to pipeline…"}</option>
              {STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
            {!optin.stage && <p className="mt-1.5 text-[11px] text-zinc-500">Choosing a stage adds them to Leads.</p>}
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Send a message</p>
            <div className="mb-2 flex gap-1 rounded-xl bg-zinc-900 p-1">
              {(["SMS", "Email"] as const).map((c) => {
                const usable = c === "Email" ? !!optin.email : !!optin.phone;
                return (
                  <button
                    key={c}
                    onClick={() => setChannel(c)}
                    disabled={!usable}
                    title={usable ? undefined : `No ${c === "Email" ? "email address" : "phone number"} on this contact`}
                    className={cn("flex-1 rounded-lg py-2 text-xs font-bold transition-colors disabled:opacity-40",
                      channel === c ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white")}
                  >
                    {c === "SMS" ? "💬 Text" : "✉️ Email"}
                  </button>
                );
              })}
            </div>
            <p className="mb-1.5 truncate text-[11px] text-zinc-500">To {destination ?? "— no address on file"}</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder={channel === "SMS" ? "Write the text…" : "Write the email…"}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-600 focus:outline-none"
            />
            <button
              onClick={() => void send()}
              disabled={!destination || !message.trim() || sending}
              className="mt-2 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            >
              {sending ? "Sending…" : `Send ${channel === "SMS" ? "text" : "email"} via GoHighLevel`}
            </button>
            {sent && <p role="status" className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">{sent}</p>}
            {sendError && <p role="alert" className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">{sendError}</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}
