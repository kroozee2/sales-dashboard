"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// The Signups spreadsheet. Built to answer "who is actually using these apps",
// so engagement sorts first and names are never cut off.

export type SignupRow = {
  id: string;
  app: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  last_seen: string | null;
  login_count: number | null;
  already_lead: boolean;
  source?: string | null;
  extra?: Record<string, string | number> | null;
};

type SortKey = "engagement" | "last_seen" | "created_at" | "name";

const APP_CHIP: Record<string, string> = {
  claude: "bg-orange-500/15 text-orange-200 border-orange-500/30",
  skool: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  flow: "bg-violet-500/15 text-violet-200 border-violet-500/30",
};
const APP_NAME: Record<string, string> = { claude: "Claude for Founders", skool: "Skool Blueprint", flow: "Partnership" };

function ago(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
const short = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—";

// A phone that is one digit long is junk, not a number.
const realPhone = (p: string | null) => (p && p.replace(/\D/g, "").length >= 7 ? p : null);

const prettyKey = (k: string) => k.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export function SignupsTable({ rows }: { rows: SignupRow[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("engagement");
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Whatever extra the apps collect (monthly revenue and the like) becomes a
  // column, but only when something actually populates it.
  const extraKeys = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) for (const k of Object.keys(r.extra ?? {})) seen.set(k, (seen.get(k) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  }, [rows]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort === "name") return (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "");
      if (sort === "created_at") return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      if (sort === "last_seen") return (b.last_seen ?? "").localeCompare(a.last_seen ?? "");
      // Engagement: logins first, then how recently they showed up.
      const d = (b.login_count ?? 0) - (a.login_count ?? 0);
      return d !== 0 ? d : (b.last_seen ?? "").localeCompare(a.last_seen ?? "");
    });
    return copy;
  }, [rows, sort]);

  const busiest = Math.max(1, ...rows.map((r) => r.login_count ?? 0));

  async function openAsLead(s: SignupRow) {
    setOpening(s.id); setError(null);
    try {
      const res = await fetch("/api/signups/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name, email: s.email, phone: s.phone, source: APP_NAME[s.app] ?? s.app, created_at: s.created_at }),
      });
      const j = (await res.json()) as { error?: string; lead?: { id: string } };
      if (j.error) throw new Error(j.error);
      if (j.lead) router.push(`/leads?lead=${j.lead.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this signup");
      setOpening(null);
    }
  }

  // Written out in full: Tailwind only keeps classes it can see as literals, so
  // a template-built grid-cols string gets purged and the table never lays out.
  const COLS_BY_EXTRA = [
    "md:grid md:grid-cols-[minmax(0,1.5fr)_130px_150px_110px_120px] md:items-center md:gap-3",
    "md:grid md:grid-cols-[minmax(0,1.5fr)_130px_150px_110px_130px_120px] md:items-center md:gap-3",
    "md:grid md:grid-cols-[minmax(0,1.5fr)_130px_150px_110px_130px_130px_120px] md:items-center md:gap-3",
  ];
  const cols = COLS_BY_EXTRA[Math.min(extraKeys.length, 2)];
  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => setSort(k)}
      className={cn("text-left text-[10px] font-bold uppercase tracking-wide transition-colors",
        sort === k ? "text-blue-300" : "text-zinc-500 hover:text-zinc-300")}>
      {label}{sort === k ? " ↓" : ""}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {error && <p role="alert" className="border-b border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200">{error}</p>}

      <div className={cn("hidden border-b border-zinc-800 bg-zinc-950/50 px-4 py-2", cols)}>
        <SortBtn k="name" label="Person" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">App</span>
        <SortBtn k="engagement" label="Usage" />
        <SortBtn k="created_at" label="Joined" />
        {extraKeys.map((k) => (
          <span key={k} className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{prettyKey(k)}</span>
        ))}
        <span className="text-right text-[10px] font-bold uppercase tracking-wide text-zinc-500">Open</span>
      </div>

      <div className="divide-y divide-zinc-800/60">
        {sorted.map((s) => {
          const logins = s.login_count ?? 0;
          const seen = ago(s.last_seen);
          const phone = realPhone(s.phone);
          return (
            <div key={s.id} className={cn("px-4 py-3 transition-colors hover:bg-zinc-800/40", cols)}>
              {/* Name wraps in full — the whole point of this view is knowing who they are. */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-words text-sm font-semibold text-white">{s.name || s.email?.split("@")[0] || "—"}</span>
                  {s.already_lead && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">IN LEADS</span>}
                </div>
                {s.email && (
                  <a href={`mailto:${s.email}`} onClick={(e) => e.stopPropagation()} className="block break-all text-xs text-zinc-500 hover:text-blue-300">{s.email}</a>
                )}
                {phone && <span className="block text-xs text-zinc-600">{phone}</span>}
              </div>

              <span className={cn("mt-2 inline-block w-fit rounded-full border px-2 py-0.5 text-[11px] font-bold md:mt-0", APP_CHIP[s.app] ?? "border-zinc-700 bg-zinc-800 text-zinc-300")}>
                {APP_NAME[s.app] ?? s.app}
              </span>

              <div className="mt-2 md:mt-0">
                <div className="flex items-baseline gap-1.5">
                  <span className={cn("text-sm font-bold tabular-nums", logins > 1 ? "text-white" : "text-zinc-500")}>{logins}</span>
                  <span className="text-[11px] text-zinc-500">{logins === 1 ? "login" : "logins"}</span>
                </div>
                <div className="mt-1 h-1 w-full max-w-[90px] overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max((logins / busiest) * 100, logins ? 6 : 0)}%` }} />
                </div>
                <span className="mt-0.5 block text-[11px] text-zinc-600">{seen ? `seen ${seen}` : "never returned"}</span>
              </div>

              <div className="mt-2 text-xs text-zinc-400 md:mt-0">
                {short(s.created_at)}
                <span className="block text-[11px] text-zinc-600">{ago(s.created_at)}</span>
              </div>

              {extraKeys.map((k) => (
                <div key={k} className="mt-2 text-xs text-zinc-300 md:mt-0">
                  {s.extra?.[k] ?? <span className="text-zinc-700">—</span>}
                </div>
              ))}

              <div className="mt-3 md:mt-0 md:text-right">
                <button
                  onClick={() => void openAsLead(s)}
                  disabled={opening === s.id}
                  className="w-full rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 transition-colors hover:border-blue-500 hover:text-white disabled:opacity-50 md:w-auto"
                >
                  {opening === s.id ? "Opening…" : s.already_lead ? "Open lead →" : "Open as lead →"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
