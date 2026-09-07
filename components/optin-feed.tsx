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
};

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

const COLS = "grid grid-cols-[92px_minmax(0,1.1fr)_150px_minmax(0,1.3fr)_140px_44px] items-center gap-3";

export function OptInFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [via, setVia] = useState<string | null>(null);

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
        {["Opted in", "Person", "Where", "Email", "Phone", ""].map((h, i) => (
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
              <div key={o.id} className={cn("px-4 py-2.5 transition-colors hover:bg-zinc-900/50 md:px-4", COLS.replace("grid ", "md:grid "))}>
                <div className="flex items-baseline gap-2 md:block">
                  <span className="text-sm font-semibold text-zinc-200">{day}</span>
                  <span className="block text-[11px] text-zinc-500">{ago}</span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold capitalize text-white md:mt-0">{o.name ?? "—"}</p>
                <span className={cn("mt-1 inline-block w-fit rounded-full border px-2 py-0.5 text-[11px] font-bold md:mt-0", chipFor(o.opted_in_via))}>
                  {o.opted_in_via}
                </span>
                <p className="mt-1 truncate text-xs text-zinc-400 md:mt-0">{o.email ?? "—"}</p>
                <p className="mt-1 text-xs text-zinc-400 md:mt-0">{o.phone ?? "—"}</p>
                <a
                  href={o.ghl_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in GoHighLevel"
                  className="mt-1 inline-block text-zinc-500 hover:text-white md:mt-0"
                >↗</a>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
