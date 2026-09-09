"use client";

import { useCallback, useEffect, useState } from "react";

export interface Funnel {
  id: string;
  name: string;
  emoji: string;
  url: string | null;
  type: string;
  purpose: string | null;
  status: string;
  thumbnail_url: string | null;
  notes: string | null;
  sort_order: number;
  cta: string | null;
  followup_text: boolean;
  followup_email: boolean;
  optin_count: number | null;
  optin_source: string | null;
  optin_counted_at: string | null;
}

/** How long ago the opt-in number was taken, so it never looks fresher than it is. */
function countedAgo(at: string | null): string {
  if (!at) return "";
  const days = Math.round((Date.now() - Date.parse(at)) / 86_400_000);
  if (!Number.isFinite(days)) return "";
  if (days <= 0) return "counted today";
  if (days === 1) return "counted yesterday";
  return `counted ${days} days ago`;
}

// What a funnel is FOR — drives the colour language across all three views.
const TYPES: { key: string; label: string; emoji: string; chip: string; grad: string }[] = [
  { key: "sales_page", label: "Sales page", emoji: "💰", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", grad: "from-emerald-600/30 to-teal-700/20" },
  { key: "lead_magnet", label: "Lead magnet", emoji: "🧲", chip: "bg-violet-500/15 text-violet-300 border-violet-500/30", grad: "from-violet-600/30 to-fuchsia-700/20" },
  { key: "proof", label: "Proof", emoji: "🏆", chip: "bg-amber-500/15 text-amber-300 border-amber-500/30", grad: "from-amber-600/30 to-orange-700/20" },
  { key: "webinar", label: "Webinar", emoji: "🎥", chip: "bg-sky-500/15 text-sky-300 border-sky-500/30", grad: "from-sky-600/30 to-blue-700/20" },
  { key: "event", label: "Event", emoji: "🎟️", chip: "bg-pink-500/15 text-pink-300 border-pink-500/30", grad: "from-pink-600/30 to-rose-700/20" },
  { key: "application", label: "Application", emoji: "📝", chip: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40", grad: "from-zinc-600/30 to-zinc-700/20" },
];
const typeOf = (k: string) => TYPES.find((t) => t.key === k) ?? TYPES[0];

const STATUSES: { key: string; label: string; chip: string; dot: string }[] = [
  { key: "live", label: "Live", chip: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
  { key: "draft", label: "Draft", chip: "bg-zinc-600/30 text-zinc-300", dot: "bg-zinc-500" },
  { key: "paused", label: "Paused", chip: "bg-amber-500/15 text-amber-300", dot: "bg-amber-400" },
];
const statusOf = (k: string) => STATUSES.find((s) => s.key === k) ?? STATUSES[1];

/** "7fc-case-studies.vercel.app" — the bit worth reading at a glance. */
function host(url: string | null): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function FunnelsBoard() {
  const [funnels, setFunnels] = useState<Funnel[] | null>(null);
  const [view, setView] = useState<"grid" | "sheet" | "gallery">("sheet");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/funnels", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => { if (!controller.signal.aborted) setFunnels(Array.isArray(data) ? data : []); })
      .catch(() => { if (!controller.signal.aborted) setFunnels([]); });
    return () => controller.abort();
  }, []);

  const patch = useCallback(async (id: string, updates: Partial<Funnel>) => {
    setFunnels((prev) => prev?.map((f) => (f.id === id ? { ...f, ...updates } : f)) ?? prev);
    await fetch("/api/funnels", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
  }, []);
  const add = useCallback(async () => {
    const created = await (await fetch("/api/funnels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) })).json();
    if (created?.id) setFunnels((prev) => [...(prev ?? []), created]);
  }, []);
  const remove = useCallback(async (f: Funnel) => {
    if (!confirm(`Remove "${f.name}" from the board?`)) return;
    setFunnels((prev) => prev?.filter((x) => x.id !== f.id) ?? prev);
    await fetch("/api/funnels", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: f.id }) });
  }, []);

  function copy(f: Funnel) {
    if (!f.url) return;
    void navigator.clipboard?.writeText(f.url);
    setCopied(f.id);
    setTimeout(() => setCopied((c) => (c === f.id ? null : c)), 1600);
  }

  const VIEWS = [["grid", "▦ Grid"], ["sheet", "☰ Spreadsheet"], ["gallery", "🖼️ Gallery"]] as const;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <p className="text-zinc-500 text-sm">
          Every funnel and page you send people to: what it is for, what it asks, how many have opted in, and what happens next. Grab a link in one tap.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {VIEWS.map(([k, l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${view === k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => void add()} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold whitespace-nowrap transition-colors">＋ New funnel</button>
        </div>
      </div>

      {!funnels ? (
        <p className="text-zinc-600 text-center py-16 animate-pulse">Loading…</p>
      ) : funnels.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl">
          <p className="text-zinc-500">No funnels yet.</p>
          <button onClick={() => void add()} className="mt-3 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">＋ Add your first funnel</button>
        </div>
      ) : view === "sheet" ? (
        <FunnelSheet funnels={funnels} onPatch={patch} onRemove={remove} onCopy={copy} copied={copied} />
      ) : view === "gallery" ? (
        <FunnelGallery funnels={funnels} onCopy={copy} copied={copied} />
      ) : (
        <FunnelGrid funnels={funnels} onPatch={patch} onRemove={remove} onCopy={copy} copied={copied} />
      )}
    </div>
  );
}

// ─── Grid: compact cards, the everyday view ──────────────────────────────────
function FunnelGrid({ funnels, onPatch, onRemove, onCopy, copied }: {
  funnels: Funnel[]; onPatch: (id: string, u: Partial<Funnel>) => void;
  onRemove: (f: Funnel) => void; onCopy: (f: Funnel) => void; copied: string | null;
}) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {funnels.map((f) => {
        const t = typeOf(f.type);
        const s = statusOf(f.status);
        return (
          <div key={f.id} className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-4 transition-colors flex flex-col">
            <div className="flex items-start gap-2.5">
              <span className="text-2xl leading-none flex-shrink-0">{f.emoji}</span>
              <div className="min-w-0 flex-1">
                <input value={f.name} onChange={(e) => onPatch(f.id, { name: e.target.value })}
                  className="w-full bg-transparent text-white font-semibold text-[15px] focus:outline-none focus:bg-zinc-950 rounded px-1 -mx-1" />
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${t.chip}`}>{t.emoji} {t.label}</span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.chip}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
                  </span>
                </div>
              </div>
              <button onClick={() => onRemove(f)} title="Remove"
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 text-xs transition-opacity flex-shrink-0">✕</button>
            </div>

            {f.purpose && <p className="text-zinc-500 text-xs mt-2.5 leading-relaxed line-clamp-2">{f.purpose}</p>}

            <div className="mt-auto pt-3">
              <p className="text-[11px] text-zinc-600 truncate mb-2">{host(f.url)}</p>
              <div className="flex gap-1.5">
                <button onClick={() => onCopy(f)} disabled={!f.url}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold disabled:opacity-40 transition-colors">
                  {copied === f.id ? "✓ Copied" : "🔗 Copy link"}
                </button>
                <a href={f.url ?? "#"} target="_blank" rel="noreferrer"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${f.url ? "bg-blue-600/20 border border-blue-500/40 text-blue-200 hover:bg-blue-600/30" : "bg-zinc-800/50 text-zinc-600 pointer-events-none"}`}>
                  Open ↗
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Spreadsheet: everything editable in one dense table ─────────────────────
function FunnelSheet({ funnels, onPatch, onRemove, onCopy, copied }: {
  funnels: Funnel[]; onPatch: (id: string, u: Partial<Funnel>) => void;
  onRemove: (f: Funnel) => void; onCopy: (f: Funnel) => void; copied: string | null;
}) {
  const cell = "bg-transparent focus:bg-zinc-950 border border-transparent focus:border-blue-500/50 rounded-md px-2 py-1 text-sm focus:outline-none w-full transition-colors";
  return (
    <div className="border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[1250px]">
          <thead>
            <tr className="bg-zinc-900/80 border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-2 py-2 font-semibold w-10"></th>
              <th className="px-3 py-2 font-semibold">Funnel</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Type</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Status</th>
              <th className="px-3 py-2 font-semibold">Link</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">Opt-ins</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap text-center" title="A text message goes out after they opt in">Text</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap text-center" title="An email goes out after they opt in">Email</th>
              <th className="px-3 py-2 font-semibold">What it&apos;s for</th>
              <th className="px-3 py-2 font-semibold">The ask</th>
              <th className="px-3 py-2 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody>
            {funnels.map((f, i) => {
              const t = typeOf(f.type);
              const s = statusOf(f.status);
              return (
                <tr key={f.id} className={`group border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors ${i % 2 ? "bg-zinc-900/30" : ""}`}>
                  <td className="px-2 py-1.5 align-middle">
                    <input defaultValue={f.emoji} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== f.emoji) onPatch(f.id, { emoji: v }); }}
                      className={`${cell} text-center text-base w-10`} />
                  </td>
                  <td className="px-1 py-1.5 align-middle min-w-[190px]">
                    <input defaultValue={f.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== f.name) onPatch(f.id, { name: v }); }}
                      className={`${cell} font-semibold text-white`} />
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <select value={f.type} onChange={(e) => onPatch(f.id, { type: e.target.value })}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${t.chip}`}>
                      {TYPES.map((x) => <option key={x.key} value={x.key} className="bg-zinc-900 text-zinc-200">{x.emoji} {x.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                    <select value={f.status} onChange={(e) => onPatch(f.id, { status: e.target.value })}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${s.chip}`}>
                      {STATUSES.map((x) => <option key={x.key} value={x.key} className="bg-zinc-900 text-zinc-200">{x.label}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1.5 align-middle min-w-[230px]">
                    <div className="flex items-center gap-1">
                      <input defaultValue={f.url ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== f.url) onPatch(f.id, { url: v }); }}
                        placeholder="https://…" className={`${cell} text-zinc-300`} />
                      {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-blue-400 flex-shrink-0 px-1" title="Open">↗</a>}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap text-right tabular-nums">
                    {f.optin_count === null ? (
                      <span className="text-zinc-600 text-xs" title={f.optin_source ?? "No source connected"}>—</span>
                    ) : (
                      <span className="text-zinc-200 font-semibold" title={[f.optin_source, countedAgo(f.optin_counted_at)].filter(Boolean).join(" · ")}>
                        {f.optin_count.toLocaleString()}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 align-middle text-center">
                    <input type="checkbox" checked={f.followup_text} onChange={(e) => onPatch(f.id, { followup_text: e.target.checked })}
                      aria-label={`Text follow-up after opting in to ${f.name}`}
                      className="h-4 w-4 cursor-pointer accent-blue-500" />
                  </td>
                  <td className="px-3 py-1.5 align-middle text-center">
                    <input type="checkbox" checked={f.followup_email} onChange={(e) => onPatch(f.id, { followup_email: e.target.checked })}
                      aria-label={`Email follow-up after opting in to ${f.name}`}
                      className="h-4 w-4 cursor-pointer accent-blue-500" />
                  </td>
                  <td className="px-1 py-1.5 align-middle min-w-[220px]">
                    <input defaultValue={f.purpose ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== f.purpose) onPatch(f.id, { purpose: v }); }}
                      placeholder="What this page does…" className={`${cell} text-zinc-400`} />
                  </td>
                  <td className="px-1 py-1.5 align-middle min-w-[170px]">
                    <input defaultValue={f.cta ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== f.cta) onPatch(f.id, { cta: v }); }}
                      placeholder="What it asks them to do…" className={`${cell} text-zinc-400`} />
                  </td>
                  <td className="px-3 py-1.5 align-middle whitespace-nowrap text-right">
                    <button onClick={() => onCopy(f)} disabled={!f.url}
                      className="text-blue-400 hover:text-blue-300 text-xs font-medium disabled:opacity-30">{copied === f.id ? "✓" : "🔗"}</button>
                    <button onClick={() => onRemove(f)} title="Remove"
                      className="ml-2 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 text-xs transition-opacity">✕</button>
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

// ─── Gallery: big visual tiles for picking a link fast ───────────────────────
function FunnelGallery({ funnels, onCopy, copied }: {
  funnels: Funnel[]; onCopy: (f: Funnel) => void; copied: string | null;
}) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {funnels.map((f) => {
        const t = typeOf(f.type);
        const s = statusOf(f.status);
        return (
          <div key={f.id} className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl overflow-hidden transition-colors flex flex-col">
            {/* the visual — a real screenshot when we have one, a branded tile when we don't */}
            <a href={f.url ?? "#"} target="_blank" rel="noreferrer"
              className={`relative block h-36 bg-gradient-to-br ${t.grad} ${f.url ? "" : "pointer-events-none"}`}>
              {f.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
              ) : (
                <span className="absolute inset-0 grid place-items-center text-5xl opacity-80">{f.emoji}</span>
              )}
              <span className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur bg-zinc-950/70 ${s.chip.split(" ")[1]}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
              </span>
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            </a>

            <div className="p-4 flex flex-col flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-bold text-[15px] leading-tight">{f.emoji} {f.name}</p>
              </div>
              <span className={`inline-flex w-fit mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${t.chip}`}>{t.emoji} {t.label}</span>
              {f.purpose && <p className="text-zinc-500 text-xs mt-2 leading-relaxed">{f.purpose}</p>}
              <p className="text-[11px] text-zinc-600 truncate mt-2">{host(f.url)}</p>
              <div className="flex gap-1.5 mt-3">
                <button onClick={() => onCopy(f)} disabled={!f.url}
                  className="flex-1 px-2.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold disabled:opacity-40 transition-colors">
                  {copied === f.id ? "✓ Copied" : "🔗 Copy link"}
                </button>
                <a href={f.url ?? "#"} target="_blank" rel="noreferrer"
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${f.url ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:brightness-110" : "bg-zinc-800/50 text-zinc-600 pointer-events-none"}`}>
                  Open ↗
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
