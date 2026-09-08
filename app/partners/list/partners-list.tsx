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

const STATUSES = ["new", "in_conversation", "active_partner", "closed"];
const STRENGTHS = ["high", "medium", "low"];

const label = (s: string | null) => (s ? s.replace(/_/g, " ") : "");
const total = (sc: Scorecard | null) =>
  sc ? CRITERIA.reduce((n, c) => n + (sc[c.key] || 0), 0) : 0;

function tier(t: number) {
  if (t >= 12) return { label: "Priority", cls: "bg-emerald-500/15 text-emerald-400" };
  if (t >= 8) return { label: "Pipeline", cls: "bg-amber-500/15 text-amber-400" };
  if (t > 0) return { label: "Hold", cls: "bg-zinc-800 text-zinc-300" };
  return { label: "Unscored", cls: "bg-zinc-800 text-zinc-500" };
}

const STATUS_CLS: Record<string, string> = {
  active_partner: "bg-emerald-500/15 text-emerald-400",
  in_conversation: "bg-blue-500/15 text-blue-400",
  new: "bg-zinc-800 text-zinc-400",
  closed: "bg-zinc-800 text-zinc-500",
};

export default function PartnersList() {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [strength, setStrength] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() =>
    fetch("/api/jv-partners", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b.error ? setError(b.error) : setPartners(b.partners ?? [])))
      .catch((e) => setError(String(e))), []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    if (!partners) return [];
    const needle = q.trim().toLowerCase();
    return partners.filter((p) => {
      if (status && p.partnership_status !== status) return false;
      if (strength && p.partnership_strength !== strength) return false;
      if (!needle) return true;
      return [p.name, p.company, p.industry, p.title, p.email]
        .some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [partners, q, status, strength]);

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
  if (!partners) return <p className="p-6 text-sm text-zinc-500">Loading partners…</p>;

  const counts = {
    active: partners.filter((p) => p.partnership_status === "active_partner").length,
    talking: partners.filter((p) => p.partnership_status === "in_conversation").length,
    researched: partners.filter((p) => p.research).length,
  };

  return (
    <div className="space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Partners</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {partners.length} partners, migrated from Flow. {counts.active} active · {counts.talking} in
          conversation · {counts.researched} with an AI brief.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company, industry…"
          className="w-72 rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select value={strength} onChange={(e) => setStrength(e.target.value)} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm">
          <option value="">All strengths</option>
          {STRENGTHS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-zinc-500">{rows.length} shown</span>
      </div>

      {saveError && <p className="text-sm text-red-400">{saveError}</p>}

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Partner</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Industry</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Strength</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">AI brief</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const t = total(p.partner_scorecard);
              const ti = tier(t);
              return (
                <tr key={p.id} className="border-t hover:bg-zinc-900/60">
                  <td className="px-3 py-2">
                    <button className="font-medium text-white underline-offset-2 hover:underline"
                      onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                      {p.name}
                    </button>
                    {p.title && <div className="text-xs text-zinc-500">{p.title}</div>}
                  </td>
                  <td className="px-3 py-2">{p.company || <span className="text-zinc-600">—</span>}</td>
                  <td className="px-3 py-2 text-xs text-zinc-400">{p.industry || "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={p.partnership_status ?? ""}
                      onChange={(e) => patch(p.id, { partnership_status: e.target.value || null })}
                      className={`rounded px-2 py-0.5 text-xs ${STATUS_CLS[p.partnership_status ?? ""] ?? "bg-zinc-800 text-zinc-500"}`}
                    >
                      <option value="">—</option>
                      {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={p.partnership_strength ?? ""}
                      onChange={(e) => patch(p.id, { partnership_strength: e.target.value || null })}
                      className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 text-xs"
                    >
                      <option value="">—</option>
                      {STRENGTHS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ti.cls}`}>
                      {t > 0 ? `${t}/15 · ${ti.label}` : ti.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex gap-2">
                      {p.email && <a className="text-blue-400 hover:underline" href={`mailto:${p.email}`}>email</a>}
                      {p.phone && <a className="text-blue-400 hover:underline" href={`tel:${p.phone}`}>call</a>}
                      {p.linkedin && <a className="text-blue-400 hover:underline" target="_blank" rel="noreferrer"
                        href={p.linkedin.startsWith("http") ? p.linkedin : `https://${p.linkedin}`}>in</a>}
                      {!p.email && !p.phone && !p.linkedin && <span className="text-zinc-600">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p.research?.overall_score
                      ? <button className="font-semibold text-blue-400 hover:underline" onClick={() => setOpenId(p.id)}>
                          {p.research.overall_score}/10
                        </button>
                      : <button
                          onClick={() => research(p.id)} disabled={busy === p.id}
                          className="rounded border border-zinc-800 px-2 py-0.5 text-xs hover:bg-zinc-800 disabled:opacity-50">
                          {busy === p.id ? "researching…" : "🔎 research"}
                        </button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.filter((p) => p.id === openId).map((p) => (
        <PartnerDetail key={p.id} p={p} busy={busy === p.id}
          onResearch={() => research(p.id)} onPatch={(f) => patch(p.id, f)} />
      ))}
    </div>
  );
}

function PartnerDetail({ p, busy, onResearch, onPatch }: {
  p: Partner; busy: boolean;
  onResearch: () => void; onPatch: (f: Record<string, unknown>) => void;
}) {
  const blank: Scorecard = { audience_alignment: 0, audience_quality: 0, engagement_level: 0, receptiveness: 0, complementary_offer: 0 };
  const sc = p.partner_scorecard ?? blank;
  const t = total(sc);
  const r = p.research;

  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">
          {p.name}
          {p.company && <span className="ml-2 text-sm font-normal text-zinc-500">{p.title ? `${p.title}, ` : ""}{p.company}</span>}
        </h2>
        <div className="flex gap-3 text-xs">
          {p.website && <a className="text-blue-400 hover:underline" target="_blank" rel="noreferrer"
            href={p.website.startsWith("http") ? p.website : `https://${p.website}`}>{p.website}</a>}
          {p.email && <span className="text-zinc-500">{p.email}</span>}
          {p.phone && <span className="text-zinc-500">{p.phone}</span>}
        </div>
      </div>

      {p.bio && <p className="whitespace-pre-wrap text-sm text-zinc-300">{p.bio}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-zinc-800 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Partner scorecard</h3>
            {t > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tier(t).cls}`}>{t}/15 · {tier(t).label}</span>}
          </div>
          {CRITERIA.map((c) => (
            <div key={c.key} className="mb-1.5 flex items-center gap-2">
              <span className="w-36 shrink-0 text-xs text-zinc-400">{c.label}</span>
              {[1, 2, 3].map((v) => (
                <button key={v} title={c.opts[v - 1]}
                  onClick={() => onPatch({ partner_scorecard: { ...sc, [c.key]: v } })}
                  className={`h-6 w-7 rounded text-xs font-bold ${sc[c.key] === v ? "bg-blue-600 text-white" : "border border-zinc-700 text-zinc-500 hover:bg-zinc-800"}`}>
                  {v}
                </button>
              ))}
              <span className="text-xs text-zinc-500">{sc[c.key] ? c.opts[sc[c.key] - 1] : ""}</span>
            </div>
          ))}
        </div>

        <div className="rounded border border-zinc-800 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Your notes</h3>
          <textarea
            className="h-28 w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
            defaultValue={p.notes ?? ""}
            placeholder="What you know about them that isn't public."
            onBlur={(e) => { if (e.target.value !== (p.notes ?? "")) onPatch({ notes: e.target.value }); }}
          />
        </div>
      </div>

      <div className="rounded border border-zinc-800 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            JV brief {r?.overall_score ? `· ${r.overall_score}/10` : ""}
          </h3>
          <button onClick={onResearch} disabled={busy}
            className="rounded border border-zinc-800 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50">
            {busy ? "researching…" : r ? "🔎 refresh" : "🔎 research"}
          </button>
        </div>

        {!r && <p className="text-sm text-zinc-500">No brief yet. Research searches the web and writes what it can verify.</p>}

        {r && (
          <div className="space-y-3 text-sm">
            {r.score_reason && <p className="text-zinc-400">{r.score_reason}</p>}
            {r.business_model && <Field label="Business model" v={r.business_model} />}
            {r.target_market && <Field label="Who they serve" v={r.target_market} />}
            {r.jv_angles?.length ? <ListField label="JV angles" items={r.jv_angles} /> : null}
            {r.what_they_need && <Field label="What they need" v={r.what_they_need} />}
            {r.conversation_starters?.length ? <ListField label="Conversation starters" items={r.conversation_starters} /> : null}
            {r.watch_outs && <Field label="Watch outs" v={r.watch_outs} />}
            {r.sources?.length ? (
              <p className="text-xs text-zinc-500">
                Sources: {r.sources.map((s, i) => (
                  <a key={i} href={s} target="_blank" rel="noreferrer" className="mr-2 hover:underline">{new URL(s).hostname}</a>
                ))}
              </p>
            ) : null}
            {p.research_at && <p className="text-xs text-zinc-500">Researched {new Date(p.research_at).toLocaleString()}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <p className="text-zinc-300">{v}</p>
    </div>
  );
}

function ListField({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <ul className="ml-4 list-disc text-zinc-300">{items.map((i, n) => <li key={n}>{i}</li>)}</ul>
    </div>
  );
}
