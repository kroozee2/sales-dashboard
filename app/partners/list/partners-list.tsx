"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Scorecard = {
  audience_alignment: number; audience_quality: number;
  engagement_level: number; receptiveness: number; complementary_offer: number;
};

type Research = {
  business_model?: string; target_market?: string; jv_angles?: string[];
  what_they_need?: string; conversation_starters?: string[]; watch_outs?: string;
  overall_score?: number; score_reason?: string; sources?: string[];
};

type Partner = {
  id: string; flow_id: string | null; name: string;
  title: string | null; company: string | null; industry: string | null;
  website: string | null; linkedin: string | null; instagram: string | null;
  email: string | null; phone: string | null; bio: string | null;
  headshot_url: string | null;
  partner_scorecard: Scorecard | null;
  partnership_strength: string | null; partnership_status: string | null;
  opportunity_types: string[] | null;
  research: Research | null; research_at: string | null; notes: string | null;
};

const CRITERIA: { key: keyof Scorecard; label: string; opts: string[] }[] = [
  { key: "audience_alignment", label: "Audience alignment", opts: ["Different market", "Partial overlap", "Direct match"] },
  { key: "audience_quality", label: "Audience quality", opts: ["Small or inactive", "Growing or niche", "Engaged, large"] },
  { key: "engagement_level", label: "Engagement", opts: ["Low", "Moderate", "High"] },
  { key: "receptiveness", label: "Receptive to JVs", opts: ["Never done one", "Open but cautious", "Active JV partner"] },
  { key: "complementary_offer", label: "Complementary offer", opts: ["Competing", "Adjacent", "Fills a clear gap"] },
];

const STATUSES = ["active_partner", "in_conversation", "new", "closed"];
const STRENGTHS = ["high", "medium", "low"];
const OPP_TYPES = ["joint_venture", "referral_partner", "client", "speaking", "sponsorship", "referral_lead", "other"];

const nice = (s: string | null) => (s ? s.replace(/_/g, " ") : "");
const total = (sc: Scorecard | null) => (sc ? CRITERIA.reduce((n, c) => n + (sc[c.key] || 0), 0) : 0);

function tier(t: number) {
  if (t >= 12) return { label: "Priority", cls: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" };
  if (t >= 8) return { label: "Pipeline", cls: "bg-amber-500/15 text-amber-400 ring-amber-500/30" };
  if (t > 0) return { label: "Hold", cls: "bg-zinc-800 text-zinc-400 ring-zinc-700" };
  return { label: "Unscored", cls: "bg-zinc-800/60 text-zinc-600 ring-zinc-800" };
}

const STATUS_STYLE: Record<string, string> = {
  active_partner: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  in_conversation: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  new: "bg-zinc-800 text-zinc-400 ring-zinc-700",
  closed: "bg-zinc-800/60 text-zinc-600 ring-zinc-800",
};

const STRENGTH_DOT: Record<string, string> = {
  high: "bg-emerald-400", medium: "bg-amber-400", low: "bg-zinc-600",
};

// Stable colour per industry so the eye can group the list without reading it.
const HUES = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-fuchsia-500"];
function hue(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) % 997;
  return HUES[n % HUES.length];
}
const initials = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

type SortKey = "name" | "score" | "ai" | "recent";

export default function PartnersList() {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [strength, setStrength] = useState("");
  const [opp, setOpp] = useState("");
  const [industry, setIndustry] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [onlyResearched, setOnlyResearched] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() =>
    fetch("/api/jv-partners", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b.error ? setError(b.error) : setPartners(b.partners ?? [])))
      .catch((e) => setError(String(e))), []);

  useEffect(() => { void load(); }, [load]);

  // Esc closes the drawer, the way every other drawer in the world does.
  useEffect(() => {
    if (!openId) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenId(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [openId]);

  const industries = useMemo(() => {
    const set = new Map<string, number>();
    for (const p of partners ?? []) {
      const v = (p.industry ?? "").trim();
      if (v) set.set(v, (set.get(v) ?? 0) + 1);
    }
    return [...set.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [partners]);

  const rows = useMemo(() => {
    if (!partners) return [];
    const needle = q.trim().toLowerCase();
    const out = partners.filter((p) => {
      if (status && p.partnership_status !== status) return false;
      if (strength && p.partnership_strength !== strength) return false;
      if (opp && !(p.opportunity_types ?? []).includes(opp)) return false;
      if (industry && (p.industry ?? "") !== industry) return false;
      if (onlyResearched && !p.research) return false;
      if (tierFilter) {
        const t = total(p.partner_scorecard);
        if (tierFilter === "priority" && t < 12) return false;
        if (tierFilter === "pipeline" && (t < 8 || t >= 12)) return false;
        if (tierFilter === "unscored" && t > 0) return false;
      }
      if (!needle) return true;
      return [p.name, p.company, p.industry, p.title, p.email, p.bio]
        .some((v) => (v ?? "").toLowerCase().includes(needle));
    });
    const by: Record<SortKey, (a: Partner, b: Partner) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      score: (a, b) => total(b.partner_scorecard) - total(a.partner_scorecard) || a.name.localeCompare(b.name),
      ai: (a, b) => (b.research?.overall_score ?? -1) - (a.research?.overall_score ?? -1) || a.name.localeCompare(b.name),
      recent: (a, b) => (b.research_at ?? "").localeCompare(a.research_at ?? "") || a.name.localeCompare(b.name),
    };
    return [...out].sort(by[sort]);
  }, [partners, q, status, strength, opp, industry, tierFilter, onlyResearched, sort]);

  const clearAll = () => {
    setQ(""); setStatus(""); setStrength(""); setOpp(""); setIndustry(""); setTierFilter(""); setOnlyResearched(false);
  };
  const activeFilters = [
    q && { k: "search", label: `"${q}"`, clear: () => setQ("") },
    status && { k: "status", label: nice(status), clear: () => setStatus("") },
    strength && { k: "strength", label: `${strength} strength`, clear: () => setStrength("") },
    opp && { k: "opp", label: nice(opp), clear: () => setOpp("") },
    industry && { k: "ind", label: industry, clear: () => setIndustry("") },
    tierFilter && { k: "tier", label: tierFilter, clear: () => setTierFilter("") },
    onlyResearched && { k: "res", label: "has AI brief", clear: () => setOnlyResearched(false) },
  ].filter(Boolean) as { k: string; label: string; clear: () => void }[];

  async function patch(id: string, fields: Record<string, unknown>) {
    setSaveError(null);
    setPartners((prev) => prev?.map((p) => (p.id === id ? { ...p, ...fields } as Partner : p)) ?? prev);
    const res = await fetch("/api/jv-partners", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) {
      setSaveError(`Save failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
      void load();
    }
  }

  async function research(id: string) {
    setBusy(id); setSaveError(null);
    const res = await fetch("/api/jv-partners/research", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setSaveError(body.error ?? "Research failed.");
    setBusy(null);
    void load();
  }

  if (error) return <p className="p-6 text-sm text-red-400">{error}</p>;
  if (!partners) {
    return (
      <div className="space-y-3 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-900" />
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-900" />
        <div className="h-96 animate-pulse rounded-2xl bg-zinc-900" />
      </div>
    );
  }

  const n = (f: (p: Partner) => boolean) => partners.filter(f).length;
  const tiles = [
    { key: "", label: "All partners", value: partners.length, hint: "everyone on the list", on: !status && !tierFilter && !onlyResearched, apply: clearAll, accent: "text-white" },
    { key: "active_partner", label: "Active", value: n((p) => p.partnership_status === "active_partner"), hint: "partnership running", on: status === "active_partner", apply: () => { setStatus("active_partner"); setTierFilter(""); setOnlyResearched(false); }, accent: "text-emerald-400" },
    { key: "in_conversation", label: "In conversation", value: n((p) => p.partnership_status === "in_conversation"), hint: "talks underway", on: status === "in_conversation", apply: () => { setStatus("in_conversation"); setTierFilter(""); setOnlyResearched(false); }, accent: "text-blue-400" },
    { key: "priority", label: "Priority scored", value: n((p) => total(p.partner_scorecard) >= 12), hint: "12+ of 15", on: tierFilter === "priority", apply: () => { setTierFilter("priority"); setStatus(""); setOnlyResearched(false); }, accent: "text-amber-400" },
    { key: "researched", label: "AI brief", value: n((p) => !!p.research), hint: "researched", on: onlyResearched, apply: () => { setOnlyResearched(true); setStatus(""); setTierFilter(""); }, accent: "text-violet-400" },
  ];

  const open = partners.find((p) => p.id === openId) ?? null;

  return (
    <div className="space-y-5 p-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Partners</h1>
          <p className="mt-1 text-sm text-zinc-500">
            The running list. Click anyone to open their record.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          + Add partner
        </button>
      </header>

      {/* Tiles double as the primary filters. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <button
            key={t.key} onClick={t.apply}
            className={`rounded-2xl border p-4 text-left transition ${
              t.on ? "border-blue-500/60 bg-blue-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
            }`}
          >
            <div className={`text-2xl font-bold tabular-nums ${t.accent}`}>{t.value}</div>
            <div className="mt-0.5 text-xs font-medium text-zinc-300">{t.label}</div>
            <div className="text-[11px] text-zinc-600">{t.hint}</div>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">⌕</span>
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, company, industry, bio…"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <Select value={status} onChange={setStatus} placeholder="Any status"
            options={STATUSES.map((s) => [s, nice(s)])} />
          <Select value={strength} onChange={setStrength} placeholder="Any strength"
            options={STRENGTHS.map((s) => [s, s])} />
          <Select value={opp} onChange={setOpp} placeholder="Any opportunity"
            options={OPP_TYPES.map((s) => [s, nice(s)])} />
          <Select value={industry} onChange={setIndustry} placeholder="Any industry"
            options={industries.map(([v, c]) => [v, `${v} (${c})`])} />
          <Select value={sort} onChange={(v) => setSort(v as SortKey)} placeholder="Sort"
            options={[["name", "A → Z"], ["score", "Scorecard high → low"], ["ai", "AI score high → low"], ["recent", "Recently researched"]]}
            allowEmpty={false} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.length > 0 ? (
            <>
              <span className="text-xs text-zinc-600">Filters:</span>
              {activeFilters.map((f) => (
                <button key={f.k} onClick={f.clear}
                  className="group flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-1 text-xs text-blue-300 ring-1 ring-blue-500/30 hover:bg-blue-500/25">
                  {f.label}<span className="text-blue-400/60 group-hover:text-blue-200">✕</span>
                </button>
              ))}
              <button onClick={clearAll} className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
                clear all
              </button>
            </>
          ) : (
            <span className="text-xs text-zinc-600">No filters. Showing everyone.</span>
          )}
          <span className="ml-auto text-xs font-medium text-zinc-400">
            {rows.length} of {partners.length}
          </span>
        </div>
      </div>

      {saveError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{saveError}</p>}

      {/* List */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-900/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Partner</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Industry</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Scorecard</th>
              <th className="hidden px-3 py-2.5 font-medium sm:table-cell">AI</th>
              <th className="px-3 py-2.5 font-medium">Reach out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70 bg-zinc-950">
            {rows.map((p) => {
              const t = total(p.partner_scorecard);
              const ti = tier(t);
              return (
                <tr key={p.id}
                  onClick={() => setOpenId(p.id)}
                  className={`cursor-pointer transition hover:bg-zinc-900 ${openId === p.id ? "bg-zinc-900" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${hue(p.industry || p.name)}`}>
                        {initials(p.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {p.partnership_strength && (
                            <span title={`${p.partnership_strength} strength`}
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${STRENGTH_DOT[p.partnership_strength]}`} />
                          )}
                          <span className="truncate font-medium text-white">{p.name}</span>
                        </div>
                        <div className="truncate text-xs text-zinc-500">
                          {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-zinc-400 md:table-cell">{p.industry || "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS_STYLE[p.partnership_status ?? ""] ?? STATUS_STYLE.new}`}>
                      {nice(p.partnership_status) || "—"}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 lg:table-cell">
                    {t > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                          <div className={`h-full rounded-full ${t >= 12 ? "bg-emerald-400" : t >= 8 ? "bg-amber-400" : "bg-zinc-600"}`}
                            style={{ width: `${(t / 15) * 100}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-zinc-400">{t}/15</span>
                      </div>
                    ) : <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${ti.cls}`}>Unscored</span>}
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">
                    {p.research?.overall_score ? (
                      <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-300 ring-1 ring-violet-500/30">
                        {p.research.overall_score}/10
                      </span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); research(p.id); }}
                        disabled={busy === p.id}
                        className="rounded-md border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-50">
                        {busy === p.id ? "…" : "research"}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1.5 text-[11px]">
                      {p.email && <IconLink href={`mailto:${p.email}`} title={p.email}>✉</IconLink>}
                      {p.phone && <IconLink href={`tel:${p.phone}`} title={p.phone}>☎</IconLink>}
                      {p.linkedin && <IconLink href={url(p.linkedin)} title="LinkedIn" ext>in</IconLink>}
                      {p.website && <IconLink href={url(p.website)} title={p.website} ext>↗</IconLink>}
                      {!p.email && !p.phone && !p.linkedin && !p.website && <span className="text-zinc-700">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center">
                <p className="text-sm text-zinc-500">Nobody matches these filters.</p>
                <button onClick={clearAll} className="mt-2 text-xs text-blue-400 hover:underline">clear the filters</button>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <Drawer p={open} busy={busy === open.id}
          onClose={() => setOpenId(null)}
          onResearch={() => research(open.id)}
          onPatch={(f) => patch(open.id, f)} />
      )}

      {adding && <AddPartner onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); void load().then(() => setOpenId(id)); }} />}
    </div>
  );
}

const url = (v: string) => (v.startsWith("http") ? v : `https://${v}`);

function IconLink({ href, title, children, ext }: { href: string; title: string; children: React.ReactNode; ext?: boolean }) {
  return (
    <a href={href} title={title} {...(ext ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 transition hover:border-blue-500/40 hover:text-blue-300">
      {children}
    </a>
  );
}

function Select({ value, onChange, options, placeholder, allowEmpty = true }: {
  value: string; onChange: (v: string) => void; options: [string, string][];
  placeholder: string; allowEmpty?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border bg-zinc-950 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none ${
        value ? "border-blue-500/40 text-zinc-100" : "border-zinc-800 text-zinc-400"}`}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

// ─── The drawer ───────────────────────────────────────────────────────────────
function Drawer({ p, busy, onClose, onResearch, onPatch }: {
  p: Partner; busy: boolean; onClose: () => void;
  onResearch: () => void; onPatch: (f: Record<string, unknown>) => void;
}) {
  const [tab, setTab] = useState<"overview" | "score" | "brief">("overview");
  const [editing, setEditing] = useState(false);
  const blank: Scorecard = { audience_alignment: 0, audience_quality: 0, engagement_level: 0, receptiveness: 0, complementary_offer: 0 };
  const sc = p.partner_scorecard ?? blank;
  const t = total(sc);
  const r = p.research;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={p.name}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-800 p-5">
          <div className="flex items-start gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${hue(p.industry || p.name)}`}>
              {initials(p.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-white">{p.name}</h2>
              <p className="truncate text-sm text-zinc-400">{[p.title, p.company].filter(Boolean).join(" · ") || "—"}</p>
              {p.industry && <p className="text-xs text-zinc-600">{p.industry}</p>}
            </div>
            <button onClick={onClose} aria-label="Close"
              className="rounded-lg p-1.5 text-xl leading-none text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200">×</button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select value={p.partnership_status ?? ""}
              onChange={(e) => onPatch({ partnership_status: e.target.value || null })}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${STATUS_STYLE[p.partnership_status ?? ""] ?? STATUS_STYLE.new}`}>
              <option value="">no status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
            </select>
            <select value={p.partnership_strength ?? ""}
              onChange={(e) => onPatch({ partnership_strength: e.target.value || null })}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
              <option value="">no strength</option>
              {STRENGTHS.map((s) => <option key={s} value={s}>{s} strength</option>)}
            </select>
            {t > 0 && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tier(t).cls}`}>{t}/15 {tier(t).label}</span>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {p.email && <Action href={`mailto:${p.email}`}>✉ Email</Action>}
            {p.phone && <Action href={`tel:${p.phone}`}>☎ Call</Action>}
            {p.linkedin && <Action href={url(p.linkedin)} ext>LinkedIn</Action>}
            {p.website && <Action href={url(p.website)} ext>Website</Action>}
            {p.instagram && <Action href={url(p.instagram)} ext>Instagram</Action>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 border-b border-zinc-800 px-4">
          {([["overview", "Overview"], ["score", "Scorecard"], ["brief", r ? `JV brief · ${r.overall_score ?? "–"}/10` : "JV brief"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition ${
                tab === k ? "border-blue-500 font-medium text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "overview" && (
            <div className="space-y-5">
              {editing ? (
                <EditFields p={p} onDone={(f) => { onPatch(f); setEditing(false); }} onCancel={() => setEditing(false)} />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Details</h3>
                    <button onClick={() => setEditing(true)} className="text-xs text-blue-400 hover:underline">edit</button>
                  </div>
                  <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                    {([["Title", p.title], ["Company", p.company], ["Industry", p.industry],
                       ["Email", p.email], ["Phone", p.phone], ["Website", p.website], ["LinkedIn", p.linkedin]] as const)
                      .map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-xs text-zinc-600">{k}</dt>
                          <dd className="truncate text-zinc-300">{v || <span className="text-zinc-700">not on file</span>}</dd>
                        </div>
                      ))}
                  </dl>
                </>
              )}

              {(p.opportunity_types?.length ?? 0) > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Opportunity</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {p.opportunity_types!.map((o) => (
                      <span key={o} className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 ring-1 ring-zinc-800">{nice(o)}</span>
                    ))}
                  </div>
                </div>
              )}

              {p.bio && (
                <div>
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Bio</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{p.bio}</p>
                </div>
              )}

              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Your notes</h3>
                <textarea
                  className="h-28 w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                  defaultValue={p.notes ?? ""}
                  placeholder="What you know about them that isn't public."
                  onBlur={(e) => { if (e.target.value !== (p.notes ?? "")) onPatch({ notes: e.target.value }); }}
                />
              </div>
            </div>
          )}

          {tab === "score" && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-500">Five criteria, three levels each. Saves as you click.</p>
              {CRITERIA.map((c) => (
                <div key={c.key}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-sm text-zinc-300">{c.label}</span>
                    <span className="text-xs text-zinc-600">{sc[c.key] ? c.opts[sc[c.key] - 1] : "not scored"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1, 2, 3].map((v) => (
                      <button key={v} onClick={() => onPatch({ partner_scorecard: { ...sc, [c.key]: v } })}
                        className={`rounded-lg px-2 py-2 text-xs transition ${
                          sc[c.key] === v ? "bg-blue-600 font-semibold text-white" : "border border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"}`}>
                        {c.opts[v - 1]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <span className="text-sm text-zinc-400">Total</span>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${tier(t).cls}`}>{t}/15 · {tier(t).label}</span>
              </div>
            </div>
          )}

          {tab === "brief" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {p.research_at ? `Researched ${new Date(p.research_at).toLocaleDateString()}` : "Not researched yet"}
                </h3>
                <button onClick={onResearch} disabled={busy}
                  className="rounded-lg bg-violet-600/20 px-3 py-1.5 text-xs font-medium text-violet-300 ring-1 ring-violet-500/30 transition hover:bg-violet-600/30 disabled:opacity-50">
                  {busy ? "researching…" : r ? "refresh brief" : "research this partner"}
                </button>
              </div>

              {busy && <p className="text-sm text-zinc-500">Searching the web and writing the brief. Takes about a minute.</p>}

              {!r && !busy && (
                <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                  No brief yet. Research searches the web and writes only what it can verify.
                </p>
              )}

              {r && (
                <div className="space-y-4">
                  {r.score_reason && (
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-bold text-violet-300">{r.overall_score}/10</span>
                        <span className="text-[11px] uppercase tracking-wider text-zinc-500">JV fit</span>
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-300">{r.score_reason}</p>
                    </div>
                  )}
                  {r.business_model && <Block label="Business model" v={r.business_model} />}
                  {r.target_market && <Block label="Who they serve" v={r.target_market} />}
                  {r.jv_angles?.length ? <BlockList label="JV angles" items={r.jv_angles} /> : null}
                  {r.what_they_need && <Block label="What they need" v={r.what_they_need} />}
                  {r.conversation_starters?.length ? <BlockList label="Conversation starters" items={r.conversation_starters} /> : null}
                  {r.watch_outs && <Block label="Watch outs" v={r.watch_outs} />}
                  {r.sources?.length ? (
                    <div>
                      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Sources</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {r.sources.map((s, i) => (
                          <a key={i} href={s} target="_blank" rel="noreferrer"
                            className="rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 ring-1 ring-zinc-800 hover:text-blue-300">
                            {safeHost(s)}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function safeHost(s: string) {
  try { return new URL(s).hostname.replace(/^www\./, ""); } catch { return s; }
}

function Action({ href, children, ext }: { href: string; children: React.ReactNode; ext?: boolean }) {
  return (
    <a href={href} {...(ext ? { target: "_blank", rel: "noreferrer" } : {})}
      className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-blue-500/40 hover:text-blue-300">
      {children}
    </a>
  );
}

function Block({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</h4>
      <p className="text-sm leading-relaxed text-zinc-300">{v}</p>
    </div>
  );
}

function BlockList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</h4>
      <ul className="space-y-1.5">
        {items.map((i, n) => (
          <li key={n} className="flex gap-2 text-sm leading-relaxed text-zinc-300">
            <span className="text-zinc-600">{n + 1}.</span><span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FIELDS = [
  ["name", "Name"], ["title", "Title"], ["company", "Company"], ["industry", "Industry"],
  ["email", "Email"], ["phone", "Phone"], ["website", "Website"], ["linkedin", "LinkedIn"],
] as const;

function EditFields({ p, onDone, onCancel }: {
  p: Partner; onDone: (f: Record<string, unknown>) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { bio: p.bio ?? "" };
    for (const [k] of FIELDS) init[k] = (p[k] as string | null) ?? "";
    return init;
  });
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Edit details</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map(([k, l]) => (
          <label key={k} className="block">
            <span className="mb-1 block text-[11px] text-zinc-600">{l}</span>
            <input value={f[k] ?? ""} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none" />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] text-zinc-600">Bio</span>
        <textarea defaultValue={p.bio ?? ""} onChange={(e) => setF((s) => ({ ...s, bio: e.target.value }))}
          className="h-24 w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
        <button onClick={() => onDone(f)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500">Save</button>
      </div>
    </div>
  );
}

function AddPartner({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setErr("Name is required."); return; }
    setSaving(true); setErr("");
    const res = await fetch("/api/jv-partners", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, name: f.name.trim(), partnership_status: "new" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(body.error ?? "Could not add."); setSaving(false); return; }
    onAdded(body.partner.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-lg font-bold text-white">Add partner</h2>
        <p className="text-xs text-zinc-500">Just the basics. Fill in the rest from their record.</p>
        {([["name", "Name *"], ["company", "Company"], ["email", "Email"], ["phone", "Phone"]] as const).map(([k, l]) => (
          <label key={k} className="block">
            <span className="mb-1 block text-[11px] text-zinc-600">{l}</span>
            <input value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none" />
          </label>
        ))}
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400">Cancel</button>
          <button type="submit" disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
