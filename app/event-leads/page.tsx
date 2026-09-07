"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface EventLead {
  id: string;
  event_key: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  instagram: string | null;
  ticket_status: string | null;
  ticket_price: number | null;
  is_client: boolean;
  pitch_offer: string | null;
  owner: string | null;
  potential_revenue: number | null;
  outcome: string | null;
  notes: string | null;
  source_slug: string | null;
}
interface Offer { id: string; name: string; emoji: string }

const EVENT = {
  key: "miami-2026",
  title: "7-Figure CEO AI Mastermind — Miami",
  when: "Sept 18–20, 2026",
};

const OWNERS = ["Andrew", "Jameson"] as const;
const ownerEmoji = (o?: string | null) => (o === "Jameson" ? "🧑" : o === "Andrew" ? "🧔" : "");
const OWNER_CHIP: Record<string, string> = {
  Andrew: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  Jameson: "bg-violet-500/20 text-violet-200 border-violet-500/40",
};

const OUTCOMES = [
  { key: "", label: "—", chip: "bg-zinc-800/60 text-zinc-500 border-zinc-700" },
  { key: "Pitched", label: "Pitched", chip: "bg-amber-500/15 text-amber-200 border-amber-500/40" },
  { key: "Closed", label: "Closed", chip: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40" },
  { key: "Passed", label: "Passed", chip: "bg-zinc-600/25 text-zinc-400 border-zinc-600/50" },
];
const outcomeChip = (o?: string | null) => OUTCOMES.find((x) => x.key === (o ?? ""))?.chip ?? OUTCOMES[0].chip;

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const moneyShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`;

// ─── Page ────────────────────────────────────────────────────────────────────
export default function EventLeadsPage() {
  const [leads, setLeads] = useState<EventLead[] | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [view, setView] = useState<"sheet" | "revenue">("sheet");
  const [q, setQ] = useState("");
  const [needsOffer, setNeedsOffer] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/event-leads?event=${EVENT.key}`)
      .then((r) => r.json())
      .then((d) => { setLeads(d.leads ?? []); setOffers(d.offers ?? []); })
      .catch(() => setLeads([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = useCallback(async (id: string, updates: Partial<EventLead>) => {
    setLeads((prev) => prev?.map((l) => (l.id === id ? { ...l, ...updates } : l)) ?? prev);
    await fetch("/api/event-leads", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
  }, []);

  const all = leads ?? [];

  // Biggest opportunity first, then the people still needing a plan, then A–Z.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((l) => !needsOffer || !l.pitch_offer)
      .filter((l) =>
        !needle ||
        [l.name, l.company, l.email, l.instagram, l.pitch_offer, l.owner]
          .some((f) => (f ?? "").toLowerCase().includes(needle)),
      )
      .sort((a, b) => (b.potential_revenue ?? -1) - (a.potential_revenue ?? -1) || a.name.localeCompare(b.name));
  }, [all, q, needsOffer]);

  // ── The revenue picture ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const val = (l: EventLead) => l.potential_revenue ?? 0;
    const potential = all.reduce((s, l) => s + val(l), 0);
    const closed = all.filter((l) => l.outcome === "Closed").reduce((s, l) => s + val(l), 0);
    const openPipeline = all.filter((l) => l.outcome !== "Closed" && l.outcome !== "Passed").reduce((s, l) => s + val(l), 0);
    const withPlan = all.filter((l) => l.pitch_offer && val(l) > 0).length;
    const priced = all.filter((l) => val(l) > 0);
    const ticket = all.reduce((s, l) => s + (l.ticket_price ?? 0), 0);

    const group = (key: (l: EventLead) => string) => {
      const m = new Map<string, { total: number; count: number }>();
      for (const l of all) {
        const k = key(l);
        const cur = m.get(k) ?? { total: 0, count: 0 };
        cur.total += val(l); cur.count += 1;
        m.set(k, cur);
      }
      return Array.from(m.entries())
        .map(([k, v]) => ({ key: k, ...v }))
        .sort((a, b) => b.total - a.total || b.count - a.count);
    };

    return {
      potential, closed, openPipeline, withPlan, ticket,
      avg: priced.length ? potential / priced.length : 0,
      byOffer: group((l) => l.pitch_offer || "No offer yet"),
      byOwner: group((l) => l.owner || "Unassigned"),
      top: [...all].filter((l) => val(l) > 0).sort((a, b) => val(b) - val(a)).slice(0, 8),
    };
  }, [all]);

  const coverage = all.length ? Math.round((stats.withPlan / all.length) * 100) : 0;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">🎟️ Event Leads</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {EVENT.title} · {EVENT.when} · {all.length} ticket buyers
          </p>
        </div>
        {/* The toggle: the sheet you work, and the revenue it adds up to */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {([["sheet", "📋 Spreadsheet"], ["revenue", "📊 Revenue"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${view === k ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Always-on headline — the number this page exists for */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Potential revenue" value={money(stats.potential)} tone="text-emerald-400" big />
        <Stat label="Closed" value={money(stats.closed)} tone="text-white" />
        <Stat label="Still open" value={money(stats.openPipeline)} tone="text-amber-400" />
        <Stat label="Planned" value={`${stats.withPlan}/${all.length}`} tone="text-blue-400" sub={`${coverage}% have an offer + number`} />
      </div>

      {leads === null ? (
        <p className="text-zinc-600 text-center py-16 animate-pulse">Loading…</p>
      ) : all.length === 0 ? (
        <p className="text-zinc-600 text-center py-16">No ticket buyers yet.</p>
      ) : view === "revenue" ? (
        <RevenueDashboard stats={stats} coverage={coverage} total={all.length} />
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, offer, owner…"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500" />
              {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs">✕</button>}
            </div>
            <button onClick={() => setNeedsOffer((v) => !v)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${needsOffer ? "bg-amber-500/20 border-amber-500/40 text-amber-200" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
              ⚠️ Needs an offer ({all.filter((l) => !l.pitch_offer).length})
            </button>
            <span className="text-xs text-zinc-600 whitespace-nowrap">{rows.length} shown</span>
          </div>

          <LeadSheet rows={rows} offers={offers} onPatch={patch} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, sub, big }: { label: string; value: string; tone: string; sub?: string; big?: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3">
      <p className={`font-bold tabular-nums ${big ? "text-2xl" : "text-xl"} ${tone}`}>{value}</p>
      <p className="text-zinc-500 text-[10px] uppercase tracking-wide mt-0.5">{label}</p>
      {sub && <p className="text-zinc-600 text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── The spreadsheet ─────────────────────────────────────────────────────────
function LeadSheet({ rows, offers, onPatch }: {
  rows: EventLead[]; offers: Offer[]; onPatch: (id: string, u: Partial<EventLead>) => void;
}) {
  return (
    <div className="border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[1040px]">
          <thead>
            <tr className="bg-zinc-900/80 border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-2.5 font-semibold min-w-[210px]">Person</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Ticket</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap min-w-[190px]">Offer we&apos;ll pitch</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Responsible</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Potential</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Outcome</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={l.id} className={`border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors ${i % 2 ? "bg-zinc-900/30" : ""}`}>
                <td className="px-3 py-2 align-middle">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                      {l.name}
                      {l.is_client && <span className="text-[9px] font-bold uppercase tracking-wide rounded-full bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5">Client</span>}
                    </p>
                    {l.company && <p className="text-[11px] text-zinc-500 truncate">{l.company}</p>}
                  </div>
                </td>
                <td className="px-3 py-2 align-middle whitespace-nowrap">
                  <span className="text-[11px] text-zinc-400">{l.ticket_status ?? "—"}</span>
                  {!!l.ticket_price && <span className="text-[11px] text-zinc-600"> · {money(l.ticket_price)}</span>}
                </td>
                <td className="px-3 py-2 align-middle">
                  <select value={l.pitch_offer ?? ""} onChange={(e) => onPatch(l.id, { pitch_offer: e.target.value || null })}
                    className={`w-full max-w-[210px] rounded-lg border px-2 py-1 text-xs focus:outline-none focus:border-emerald-500 ${l.pitch_offer ? "bg-zinc-950 border-zinc-700 text-zinc-100" : "bg-zinc-900/60 border-zinc-800 text-zinc-500"}`}>
                    <option value="">— pick an offer —</option>
                    {offers.map((o) => <option key={o.id} value={o.name}>{o.emoji} {o.name}</option>)}
                    {l.pitch_offer && !offers.some((o) => o.name === l.pitch_offer) && (
                      <option value={l.pitch_offer}>{l.pitch_offer}</option>
                    )}
                  </select>
                </td>
                <td className="px-3 py-2 align-middle whitespace-nowrap">
                  <select value={l.owner ?? ""} onChange={(e) => onPatch(l.id, { owner: e.target.value || null })}
                    className={`appearance-none cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 ${l.owner ? OWNER_CHIP[l.owner] ?? "" : "bg-zinc-800/60 text-zinc-500 border-zinc-700"}`}>
                    <option value="" className="bg-zinc-900 text-white">— who?</option>
                    {OWNERS.map((o) => <option key={o} value={o} className="bg-zinc-900 text-white">{ownerEmoji(o)} {o}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 align-middle whitespace-nowrap">
                  <MoneyCell value={l.potential_revenue} onCommit={(n) => onPatch(l.id, { potential_revenue: n })} />
                </td>
                <td className="px-3 py-2 align-middle whitespace-nowrap">
                  <select value={l.outcome ?? ""} onChange={(e) => onPatch(l.id, { outcome: e.target.value || null })}
                    className={`appearance-none cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 ${outcomeChip(l.outcome)}`}>
                    {OUTCOMES.map((o) => <option key={o.key} value={o.key} className="bg-zinc-900 text-white">{o.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 align-middle whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {l.email && <a href={`mailto:${l.email}`} title={l.email} className="text-zinc-500 hover:text-emerald-300 text-sm">✉️</a>}
                    {l.instagram && (
                      <a href={l.instagram.startsWith("http") ? l.instagram : `https://instagram.com/${l.instagram}`}
                        target="_blank" rel="noreferrer" title={l.instagram} className="text-zinc-500 hover:text-pink-300 text-sm">📸</a>
                    )}
                    {!l.email && !l.instagram && <span className="text-zinc-700 text-xs">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// A money field that never fights you: type freely, commits on blur or Enter,
// Escape puts it back.
function MoneyCell({ value, onCommit }: { value: number | null; onCommit: (n: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const shown = draft ?? (value != null ? String(value) : "");

  function commit() {
    if (cancelRef.current) { cancelRef.current = false; setDraft(null); return; }
    if (draft == null) return;
    const trimmed = draft.trim();
    const n = trimmed === "" ? null : Number(trimmed);
    if (trimmed === "" || Number.isFinite(n)) onCommit(trimmed === "" ? null : (n as number));
    setDraft(null);
  }

  return (
    <div className="relative w-[110px]">
      <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${value ? "text-emerald-400" : "text-zinc-600"}`}>$</span>
      <input
        type="text" inputMode="decimal" value={shown}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
        onFocus={(e) => { setDraft(value != null ? String(value) : ""); const el = e.currentTarget; requestAnimationFrame(() => el.select()); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { cancelRef.current = true; e.currentTarget.blur(); }
        }}
        placeholder="0"
        className={`w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-5 pr-2 py-1 text-xs font-semibold tabular-nums focus:outline-none focus:border-emerald-500 ${value ? "text-emerald-300" : "text-zinc-500"}`}
      />
    </div>
  );
}

// ─── The revenue dashboard ───────────────────────────────────────────────────
type Stats = {
  potential: number; closed: number; openPipeline: number; withPlan: number; ticket: number; avg: number;
  byOffer: { key: string; total: number; count: number }[];
  byOwner: { key: string; total: number; count: number }[];
  top: EventLead[];
};

function RevenueDashboard({ stats, coverage, total }: { stats: Stats; coverage: number; total: number }) {
  const maxOffer = Math.max(1, ...stats.byOffer.map((o) => o.total));
  const maxOwner = Math.max(1, ...stats.byOwner.map((o) => o.total));

  return (
    <div className="space-y-4">
      {/* The room, in one line */}
      <div className="bg-gradient-to-br from-emerald-950/40 to-zinc-950 border border-emerald-500/25 rounded-3xl p-5 sm:p-6">
        <p className="text-emerald-300/80 text-xs uppercase tracking-wide">Potential revenue in the room</p>
        <p className="text-white font-extrabold text-4xl sm:text-5xl tracking-tight mt-1 tabular-nums">{money(stats.potential)}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-sm">
          <span className="text-emerald-400 font-semibold">{money(stats.closed)} closed</span>
          <span className="text-amber-300">{money(stats.openPipeline)} still open</span>
          <span className="text-zinc-500">avg {money(stats.avg)} per priced lead</span>
          <span className="text-zinc-500">{money(stats.ticket)} in tickets collected</span>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-zinc-400">{stats.withPlan} of {total} have an offer + a number</span>
            <span className="text-zinc-500">{coverage}% planned</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all" style={{ width: `${coverage}%` }} />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="💼 By offer" subtitle="Where the money is concentrated">
          {stats.byOffer.map((o) => (
            <BarRow key={o.key} label={o.key} count={o.count} total={o.total} max={maxOffer}
              muted={o.key === "No offer yet"} />
          ))}
        </Panel>
        <Panel title="🧑‍🤝‍🧑 By owner" subtitle="Who's carrying what">
          {stats.byOwner.map((o) => (
            <BarRow key={o.key} label={`${ownerEmoji(o.key)} ${o.key}`.trim()} count={o.count} total={o.total} max={maxOwner}
              muted={o.key === "Unassigned"} />
          ))}
        </Panel>
      </div>

      <Panel title="🏆 Biggest opportunities" subtitle="Where to spend your time at the event">
        {stats.top.length === 0 ? (
          <p className="text-zinc-600 text-sm py-4 text-center">Add potential revenue to a few people and they&apos;ll rank here.</p>
        ) : (
          <div className="divide-y divide-zinc-800/70">
            {stats.top.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{l.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{l.pitch_offer ?? "No offer yet"}</p>
                </div>
                {l.owner && (
                  <span className={`text-[10px] font-semibold rounded-full border px-1.5 py-0.5 whitespace-nowrap ${OWNER_CHIP[l.owner] ?? ""}`}>
                    {ownerEmoji(l.owner)} {l.owner}
                  </span>
                )}
                <span className={`text-[10px] font-semibold rounded-full border px-1.5 py-0.5 whitespace-nowrap ${outcomeChip(l.outcome)}`}>
                  {l.outcome || "—"}
                </span>
                <span className="text-emerald-300 font-bold text-sm tabular-nums whitespace-nowrap w-20 text-right">
                  {moneyShort(l.potential_revenue ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-white font-semibold text-sm">{title}</p>
      {subtitle && <p className="text-zinc-500 text-[11px] mt-0.5 mb-2.5">{subtitle}</p>}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BarRow({ label, count, total, max, muted }: { label: string; count: number; total: number; max: number; muted?: boolean }) {
  const pct = Math.max((total / max) * 100, total > 0 ? 4 : 0);
  return (
    <div className="flex items-center gap-3">
      <div className={`w-36 shrink-0 truncate text-xs ${muted ? "text-zinc-500" : "text-zinc-200"}`} title={label}>{label}</div>
      <div className="flex-1 h-5 rounded-md bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-md ${muted ? "bg-zinc-700" : "bg-gradient-to-r from-emerald-500 to-blue-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-9 shrink-0 text-right text-[11px] text-zinc-500 tabular-nums">{count}</div>
      <div className={`w-16 shrink-0 text-right text-xs font-bold tabular-nums ${muted ? "text-zinc-500" : "text-emerald-300"}`}>{moneyShort(total)}</div>
    </div>
  );
}
