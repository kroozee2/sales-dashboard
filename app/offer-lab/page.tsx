"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface OfferBrief {
  id: string;
  name: string;
  emoji: string;
  braindump: string | null;
  person: string | null;
  problems: string | null;
  promise: string | null;
  path: string | null;
  packaging: string | null;
  proof: string | null;
  price_point: string | null;
  price: string | null;
  payment_link: string | null;
  sales_page: string | null;
  one_sheeter: string | null;
  graphic_url: string | null;
  seats_total: number | null;
  seats_taken: number | null;
  event_date: string | null;
}
type PKey = "person" | "problems" | "promise" | "path" | "packaging" | "proof" | "price_point";
interface StripeLink { id: string; url: string; label: string; amount: number | null; currency: string }

// Seat / capacity math for an offer (progress + days-to-sell).
function seatInfo(o: { seats_total: number | null; seats_taken: number | null; event_date: string | null }) {
  const total = o.seats_total ?? 0;
  const taken = Math.max(0, o.seats_taken ?? 0);
  const has = total > 0;
  const pct = has ? Math.min(100, Math.round((taken / total) * 100)) : 0;
  const remaining = Math.max(0, total - taken);
  let daysLeft: number | null = null;
  if (o.event_date) {
    const d = new Date(o.event_date + "T00:00:00");
    const now = new Date(); now.setHours(0, 0, 0, 0);
    daysLeft = Math.round((d.getTime() - now.getTime()) / 86400000);
  }
  return { has, total, taken, pct, remaining, daysLeft };
}
const daysLabel = (d: number | null) =>
  d == null ? "" : d > 1 ? `${d} days to sell` : d === 1 ? "1 day to sell" : d === 0 ? "closes today" : "date passed";

// Reusable capacity bar — turns amber→rose as it fills up (near sold out).
function SeatBar({ pct, className = "" }: { pct: number; className?: string }) {
  const hot = pct >= 85;
  return (
    <div className={`rounded-full bg-zinc-800 overflow-hidden ${className || "h-2"}`}>
      <div className={`h-full rounded-full transition-all ${hot ? "bg-gradient-to-r from-amber-500 to-rose-500" : "bg-gradient-to-r from-blue-500 to-violet-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const PS: { key: PKey; label: string; emoji: string; q: string }[] = [
  { key: "person", label: "Person", emoji: "🧍", q: "Who am I?" },
  { key: "problems", label: "Problems", emoji: "😖", q: "Describe my undesired situation better than I can" },
  { key: "promise", label: "Promise", emoji: "✨", q: "Describe my desired situation better than I can" },
  { key: "path", label: "Path", emoji: "🛤️", q: "The 3-5 steps from undesired to desired" },
  { key: "packaging", label: "Packaging", emoji: "📦", q: "How is this delivered?" },
  { key: "proof", label: "Proof", emoji: "🏆", q: "How do I know this is real?" },
  { key: "price_point", label: "Price Point", emoji: "💰", q: "How do I get started?" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OfferLabPage() {
  const [offers, setOffers] = useState<OfferBrief[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "gallery">("grid");

  const load = useCallback(async () => {
    const d = await fetch("/api/offer-briefs").then((r) => r.json());
    setOffers(Array.isArray(d) ? d : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const addOffer = useCallback(async () => {
    const res = await fetch("/api/offer-briefs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New Offer", emoji: "📦" }) });
    const created = await res.json();
    if (created?.id) { setOffers((prev) => [...(prev ?? []), created]); setSelectedId(created.id); }
  }, []);
  const patchLocal = useCallback((id: string, updates: Partial<OfferBrief>) => {
    setOffers((prev) => prev?.map((o) => (o.id === id ? { ...o, ...updates } : o)) ?? prev);
  }, []);
  // Inline-edit save (grid view): update locally, then persist.
  const savePatch = useCallback(async (id: string, updates: Partial<OfferBrief>) => {
    patchLocal(id, updates);
    await fetch("/api/offer-briefs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
  }, [patchLocal]);
  const removeOffer = useCallback(async (id: string) => {
    setOffers((prev) => prev?.filter((o) => o.id !== id) ?? prev);
    setSelectedId((cur) => (cur === id ? null : cur));
    await fetch("/api/offer-briefs", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  }, []);

  const selected = offers?.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">📦 Offers</h1>
          <p className="text-zinc-500 text-sm mt-1">The 7Ps of Perfect Positioning. Braindump, get messaging, one-sheeter, graphics, sales page, and a payment link.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {([["grid", "▦ Grid"], ["gallery", "🖼️ Gallery"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${view === k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{l}</button>
            ))}
          </div>
          <button onClick={addOffer} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold whitespace-nowrap transition-colors">＋ New Offer</button>
        </div>
      </div>

      {!offers ? (
        <p className="text-zinc-600 text-center py-16 animate-pulse">Loading…</p>
      ) : offers.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl">
          <p className="text-zinc-500">No offers yet.</p>
          <button onClick={addOffer} className="mt-3 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">＋ Create your first offer</button>
        </div>
      ) : view === "grid" ? (
        <OffersGrid offers={offers} onSave={savePatch} onOpen={setSelectedId} onRemove={removeOffer} />
      ) : (
        <div className="space-y-2 max-w-3xl">
          {offers.map((o) => {
            const filled = PS.filter((p) => (o[p.key] ?? "").trim()).length;
            const si = seatInfo(o);
            return (
              <button key={o.id} onClick={() => setSelectedId(o.id)} className="w-full text-left flex items-center gap-3 bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 transition-colors">
                <span className="text-2xl flex-shrink-0">{o.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">{o.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                    {o.price && <span className="text-emerald-400 font-semibold">{o.price}</span>}
                    <span>{filled}/7 Ps</span>
                    {o.sales_page && <span className="text-sky-400">🔗 page</span>}
                    {o.payment_link && <span className="text-emerald-400">💳 link</span>}
                    {o.one_sheeter && <span className="text-blue-400">📄 sheet</span>}
                    {o.graphic_url && <span className="text-violet-400">🖼️ graphic</span>}
                  </div>
                  {si.has && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-zinc-200 font-semibold">{si.taken}/{si.total} seats <span className="text-zinc-500 font-normal">· {si.pct}%</span></span>
                        <span className="text-zinc-500">{si.remaining} left{si.daysLeft != null ? ` · ${daysLabel(si.daysLeft)}` : ""}</span>
                      </div>
                      <SeatBar pct={si.pct} />
                    </div>
                  )}
                </div>
                <span className="text-zinc-600 flex-shrink-0">→</span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <OfferPanel key={selected.id} offer={selected} onPatchLocal={patchLocal} onRemove={removeOffer} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

// ─── Grid (spreadsheet) view — pertinent info, editable inline ────────────────
function OffersGrid({ offers, onSave, onOpen, onRemove }: {
  offers: OfferBrief[]; onSave: (id: string, u: Partial<OfferBrief>) => void; onOpen: (id: string) => void; onRemove: (id: string) => void;
}) {
  // Save on blur only when the value actually changed.
  const onBlurSave = (o: OfferBrief, field: keyof OfferBrief, raw: string, kind: "text" | "int" = "text") => {
    const val = kind === "int" ? (raw.trim() === "" ? null : Math.max(0, parseInt(raw, 10) || 0)) : (raw.trim() === "" ? null : raw);
    if ((o[field] ?? null) === (val ?? null)) return;
    onSave(o.id, { [field]: val } as Partial<OfferBrief>);
  };
  const cell = "bg-transparent focus:bg-zinc-950 border border-transparent focus:border-blue-500/50 rounded-md px-2 py-1 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none w-full transition-colors";
  const LinkCell = ({ o, field, placeholder }: { o: OfferBrief; field: "sales_page" | "payment_link"; placeholder: string }) => (
    <div className="flex items-center gap-1">
      <input defaultValue={o[field] ?? ""} onBlur={(e) => onBlurSave(o, field, e.target.value)} placeholder={placeholder} className={cell} />
      {o[field] && <a href={o[field]!} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-blue-400 flex-shrink-0" title="Open">↗</a>}
    </div>
  );

  return (
    <div className="border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-zinc-900/80 border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-2 font-semibold w-8"></th>
              <th className="px-3 py-2 font-semibold">Offer</th>
              <th className="px-3 py-2 font-semibold">💵 Price</th>
              <th className="px-3 py-2 font-semibold">🔗 Sales page</th>
              <th className="px-3 py-2 font-semibold">💳 Payment link</th>
              <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Seats</th>
              <th className="px-3 py-2 font-semibold text-center">Assets</th>
              <th className="px-3 py-2 font-semibold text-right">Edit</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o, i) => {
              const filled = PS.filter((p) => (o[p.key] ?? "").trim()).length;
              return (
                <tr key={o.id} className={`border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors ${i % 2 ? "bg-zinc-900/30" : ""}`}>
                  <td className="px-2 py-2 align-middle">
                    <input defaultValue={o.emoji} onBlur={(e) => onBlurSave(o, "emoji", e.target.value)} className={`${cell} text-center text-lg w-10`} />
                  </td>
                  <td className="px-2 py-2 align-middle min-w-[220px]">
                    <input defaultValue={o.name} onBlur={(e) => onBlurSave(o, "name", e.target.value)} placeholder="Offer name" className={`${cell} font-semibold text-white`} />
                  </td>
                  <td className="px-2 py-2 align-middle min-w-[120px]">
                    <input defaultValue={o.price ?? ""} onBlur={(e) => onBlurSave(o, "price", e.target.value)} placeholder="$—" className={`${cell} text-emerald-300 font-medium`} />
                  </td>
                  <td className="px-2 py-2 align-middle min-w-[200px]"><LinkCell o={o} field="sales_page" placeholder="Paste sales page URL…" /></td>
                  <td className="px-2 py-2 align-middle min-w-[180px]"><LinkCell o={o} field="payment_link" placeholder="Paste payment link…" /></td>
                  <td className="px-3 py-2 align-middle w-[120px]">
                    <span className="inline-flex items-center justify-center gap-0.5 w-full">
                      <input defaultValue={o.seats_taken ?? ""} onBlur={(e) => onBlurSave(o, "seats_taken", e.target.value, "int")} className={`${cell} text-center !w-10 tabular-nums`} placeholder="0" />
                      <span className="text-zinc-600 flex-shrink-0">/</span>
                      <input defaultValue={o.seats_total ?? ""} onBlur={(e) => onBlurSave(o, "seats_total", e.target.value, "int")} className={`${cell} text-center !w-10 tabular-nums`} placeholder="—" />
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle text-center whitespace-nowrap text-xs">
                    <span className={filled === 7 ? "text-emerald-400" : "text-zinc-500"}>{filled}/7</span>
                    {o.one_sheeter && <span title="One-sheeter" className="ml-1.5">📄</span>}
                    {o.graphic_url && <span title="Graphic" className="ml-1">🖼️</span>}
                  </td>
                  <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                    <button onClick={() => onOpen(o.id)} className="text-blue-400 hover:text-blue-300 text-xs font-medium">Open →</button>
                    <button onClick={() => { if (confirm(`Delete "${o.name}"?`)) onRemove(o.id); }} className="ml-2 text-zinc-600 hover:text-rose-400 text-xs" title="Delete">🗑</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Offer sidebar panel ───────────────────────────────────────────────────────
function OfferPanel({ offer, onPatchLocal, onRemove, onClose }: { offer: OfferBrief; onPatchLocal: (id: string, u: Partial<OfferBrief>) => void; onRemove: (id: string) => void; onClose: () => void }) {
  const [form, setForm] = useState<OfferBrief>(offer);
  const [genAll, setGenAll] = useState(false);
  const [genOne, setGenOne] = useState<PKey | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [graphicBusy, setGraphicBusy] = useState(false);
  const [graphicWant, setGraphicWant] = useState("");
  const [links, setLinks] = useState<StripeLink[] | null>(null);
  const [copied, setCopied] = useState(false);
  const savedRef = useRef(JSON.stringify(offer));

  // Load Stripe payment links once.
  useEffect(() => { fetch("/api/stripe/payment-links").then((r) => r.json()).then((d) => setLinks(d.links ?? [])).catch(() => setLinks([])); }, []);
  // Esc to close.
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  // Debounced auto-save of text fields.
  useEffect(() => {
    const snap = JSON.stringify(form);
    if (snap === savedRef.current) return;
    const t = setTimeout(async () => {
      savedRef.current = snap;
      const { id, ...updates } = form;
      onPatchLocal(id, updates);
      await fetch("/api/offer-briefs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
    }, 700);
    return () => clearTimeout(t);
  }, [form, onPatchLocal]);

  const set = (patch: Partial<OfferBrief>) => setForm((f) => ({ ...f, ...patch }));

  async function generate(only?: PKey) {
    const dump = (form.braindump ?? "").trim();
    if (!dump) { setErr("Write your braindump first, then generate."); return; }
    setErr(null);
    if (only) setGenOne(only); else setGenAll(true);
    try {
      const res = await fetch("/api/offer-briefs/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: form.id, braindump: dump, only }) });
      const data = await res.json();
      if (data.error) { setErr(data.error); return; }
      const merged: Partial<OfferBrief> = {};
      for (const p of PS) if (typeof data[p.key] === "string") merged[p.key] = data[p.key];
      setForm((f) => ({ ...f, ...merged }));
      savedRef.current = JSON.stringify({ ...form, ...merged });
      onPatchLocal(form.id, merged);
    } catch { setErr("Something went wrong. Try again."); }
    finally { setGenAll(false); setGenOne(null); }
  }

  async function makeOneSheeter() {
    setSheetBusy(true); setErr(null);
    try {
      const r = await fetch("/api/offer-briefs/one-sheeter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: form.id }) });
      const d = await r.json();
      if (d.error) setErr(d.error);
      else { set({ one_sheeter: d.one_sheeter }); savedRef.current = JSON.stringify({ ...form, one_sheeter: d.one_sheeter }); onPatchLocal(form.id, { one_sheeter: d.one_sheeter }); }
    } finally { setSheetBusy(false); }
  }
  async function makeGraphic() {
    setGraphicBusy(true); setErr(null);
    try {
      const r = await fetch("/api/offer-briefs/graphic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: form.id, want: graphicWant }) });
      const d = await r.json();
      if (d.error) setErr(d.error);
      else { set({ graphic_url: d.graphic_url }); savedRef.current = JSON.stringify({ ...form, graphic_url: d.graphic_url }); onPatchLocal(form.id, { graphic_url: d.graphic_url }); }
    } finally { setGraphicBusy(false); }
  }

  const filled = PS.filter((p) => (form[p.key] ?? "").trim()).length;
  const si = seatInfo(form);
  const money = (l: StripeLink) => l.amount != null ? ` — $${l.amount.toLocaleString()}` : "";
  const setNum = (k: "seats_total" | "seats_taken", v: string) => set({ [k]: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) } as Partial<OfferBrief>);

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:max-w-lg bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-2">
          <input value={form.emoji ?? ""} onChange={(e) => set({ emoji: e.target.value.slice(0, 2) })} className="w-10 text-center text-xl bg-zinc-900 border border-zinc-800 rounded-lg py-1.5 focus:outline-none" />
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Offer name" className="flex-1 bg-transparent text-white font-semibold text-lg focus:outline-none" />
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none px-1">✕</button>
        </div>

        <div className="p-4 space-y-5">
          {/* Seats & deadline — track capacity + days to sell */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <p className="text-white font-semibold flex items-center gap-2">🎟️ Seats & deadline</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-500 text-[11px] block mb-1">Seats taken</label>
                <input type="number" min={0} inputMode="numeric" value={form.seats_taken ?? ""} onChange={(e) => setNum("seats_taken", e.target.value)}
                  placeholder="0" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-zinc-500 text-[11px] block mb-1">Total seats</label>
                <input type="number" min={0} inputMode="numeric" value={form.seats_total ?? ""} onChange={(e) => setNum("seats_total", e.target.value)}
                  placeholder="e.g. 60" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">Event / close date</label>
              <input type="date" value={form.event_date ?? ""} onChange={(e) => set({ event_date: e.target.value || null })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500" />
            </div>
            {si.has ? (
              <div className="pt-1">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-white font-semibold">{si.taken}/{si.total} signed up <span className="text-zinc-500 font-normal">· {si.pct}%</span></span>
                  <span className="text-zinc-400">{si.remaining} seats left{si.daysLeft != null ? ` · ${daysLabel(si.daysLeft)}` : ""}</span>
                </div>
                <SeatBar pct={si.pct} className="h-2.5" />
              </div>
            ) : (
              <p className="text-zinc-600 text-xs">Set total seats to show a progress bar on the offer.</p>
            )}
          </div>

          {/* Braindump */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-white font-semibold flex items-center gap-2">🧠 Braindump</p>
              <span className="text-xs text-zinc-600">{filled}/7 Ps</span>
            </div>
            <textarea value={form.braindump ?? ""} onChange={(e) => set({ braindump: e.target.value })} rows={5}
              placeholder="Dump everything: who it's for, their problems, your promise, how it works, proof, pricing…"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
            <div className="flex items-center gap-3 mt-3">
              <button onClick={() => generate()} disabled={genAll || !!genOne} className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-all flex items-center gap-2">
                {genAll ? <><span className="animate-spin">⏳</span> Generating…</> : filled > 0 ? "♻️ Regenerate 7 Ps" : "✨ Generate the 7 Ps"}
              </button>
              {err && <span className="text-xs text-red-400">{err}</span>}
            </div>
          </div>

          {/* The 7 Ps */}
          {PS.map((p) => (
            <div key={p.key} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-white font-semibold flex items-center gap-2">{p.emoji} {p.label}</p>
                  <p className="text-zinc-500 text-xs mt-0.5 italic">{p.q}</p>
                </div>
                <button onClick={() => generate(p.key)} disabled={genAll || !!genOne} className="text-xs text-zinc-500 hover:text-blue-300 disabled:opacity-40 whitespace-nowrap">{genOne === p.key ? "⏳…" : "♻️ Redo"}</button>
              </div>
              <textarea value={form[p.key] ?? ""} onChange={(e) => set({ [p.key]: e.target.value } as Partial<OfferBrief>)}
                rows={(form[p.key] ?? "").length > 160 ? 6 : 3} placeholder={`Generate from your braindump, or write ${p.label.toLowerCase()} here…`}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
            </div>
          ))}

          {/* Price */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <p className="text-white font-semibold flex items-center gap-2">💵 Price</p>
            <input value={form.price ?? ""} onChange={(e) => set({ price: e.target.value || null })} placeholder="e.g. $6,000 / 6 mo, or 3x $2,200"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-emerald-300 font-medium placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
            <p className="text-zinc-600 text-[11px]">A short, at-a-glance price. The full pitch lives in the 💰 Price Point above.</p>
          </div>

          {/* Sales page */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <p className="text-white font-semibold flex items-center gap-2">🔗 Sales page</p>
            <input value={form.sales_page ?? ""} onChange={(e) => set({ sales_page: e.target.value || null })} placeholder="https://…your sales page URL"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
            {form.sales_page && <a href={form.sales_page} target="_blank" rel="noreferrer" className="inline-block text-xs text-blue-400 hover:text-blue-300">Open sales page ↗</a>}
          </div>

          {/* Payment link */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <p className="text-white font-semibold flex items-center gap-2">💳 Payment link</p>
            <select value={form.payment_link ?? ""} onChange={(e) => set({ payment_link: e.target.value || null })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
              <option value="">{links === null ? "Loading your Stripe links…" : "Pick a Stripe payment link…"}</option>
              {(links ?? []).map((l) => <option key={l.id} value={l.url}>{l.label}{money(l)}</option>)}
              {form.payment_link && !(links ?? []).some((l) => l.url === form.payment_link) && <option value={form.payment_link}>Current: {form.payment_link}</option>}
            </select>
            <input value={form.payment_link ?? ""} onChange={(e) => set({ payment_link: e.target.value || null })} placeholder="…or paste a link URL"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
            {form.payment_link && <a href={form.payment_link} target="_blank" rel="noreferrer" className="inline-block text-xs text-emerald-400 hover:text-emerald-300">Open link ↗</a>}
          </div>

          {/* One-sheeter */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-white font-semibold flex items-center gap-2">📄 One-sheeter</p>
              <div className="flex items-center gap-2">
                {form.one_sheeter && (
                  <button onClick={() => { void navigator.clipboard.writeText(form.one_sheeter ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200">{copied ? "✓ Copied" : "📋 Copy"}</button>
                )}
                <button onClick={makeOneSheeter} disabled={sheetBusy} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold">{sheetBusy ? "Writing…" : form.one_sheeter ? "♻️ Regenerate" : "✨ Generate"}</button>
              </div>
            </div>
            {form.one_sheeter ? (
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-200 leading-relaxed">{form.one_sheeter}</div>
            ) : <p className="text-zinc-600 text-xs">Generate a clean, share-ready one-sheeter from your 7 Ps.</p>}
          </div>

          {/* Graphics */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <p className="text-white font-semibold flex items-center gap-2">🖼️ Offer graphic</p>
            {form.graphic_url && (
              <div className="space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.graphic_url} alt="Offer graphic" className="w-full rounded-xl border border-zinc-800" />
                <a href={form.graphic_url} download target="_blank" rel="noreferrer" className="inline-block text-xs text-violet-400 hover:text-violet-300">⬇ Download</a>
              </div>
            )}
            <input value={graphicWant} onChange={(e) => setGraphicWant(e.target.value)} placeholder="What graphic? e.g. 'ascension ladder of my offers' (optional)"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
            <button onClick={makeGraphic} disabled={graphicBusy} className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 disabled:opacity-50 text-white text-sm font-semibold transition-all">
              {graphicBusy ? "🎨 Designing + rendering…" : form.graphic_url ? "♻️ New graphic" : "🎨 Generate graphic"}
            </button>
          </div>

          {/* Delete */}
          <button onClick={() => { if (confirm(`Delete "${form.name}"?`)) onRemove(form.id); }} className="text-sm text-zinc-500 hover:text-red-400 transition-colors">🗑️ Delete offer</button>
        </div>
      </div>
    </div>
  );
}
