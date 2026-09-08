"use client";

import { useState } from "react";

// The posted-content table. Lives here rather than inside the Content page so
// the YouTube page can show the same table for its own platform.

export interface Posted {
  id: string; platform: string; profile_name: string | null; profile_url: string | null;
  post_url: string | null; text: string | null; posted_at: string | null;
  likes: number | null; comments: number | null; shares: number | null; reactions: number | null; views: number | null; media_type: string | null;
}

export function PostedTab({ posted, onChanged, lockPlatform }: { posted: Posted[]; onChanged: () => void; lockPlatform?: "youtube" | "instagram" | "facebook" }) {
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null); // which platform is syncing
  const [msg, setMsg] = useState<string | null>(null);

  // Async sync — start the Apify run(s), then poll until done. Each request is
  // short, so even the slow YouTube pull never hits a function timeout.
  async function sync(platform: "instagram" | "facebook" | "youtube", label: string) {
    if (syncing) return;
    setSyncing(platform); setMsg(`Pulling ${label}… this can take a couple minutes.`);
    try {
      let started: { started?: boolean; pendingStart?: boolean; runs?: Array<{ runId: string; datasetId: string }>; error?: string } | null = null;
      while (!started?.started && !started?.runs) {
        const response = await fetch("/api/content/posted/sync-start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform }) });
        started = await response.json();
        if (!response.ok && !started?.pendingStart) { setMsg(started?.error || "Could not start sync."); return; }
        if (!started?.started && !started?.runs) await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      while (true) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollBody = platform === "facebook" ? { platform, runs: started.runs } : { platform };
        const poll = await (await fetch("/api/content/posted/sync-poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pollBody) })).json();
        if (poll.error) { setMsg(poll.error); return; }
        if (poll.done) { setMsg(`${label}: pulled ${poll.synced} posts ✓`); onChanged(); return; }
      }
    } catch { setMsg("Sync failed. Try again."); } finally { setSyncing(null); }
  }
  const SYNCS: { k: "instagram" | "facebook" | "youtube"; label: string }[] = [
    { k: "instagram", label: "Instagram" }, { k: "facebook", label: "Facebook" }, { k: "youtube", label: "YouTube" },
  ];

  type SortKey = "posted_at" | "likes" | "comments" | "shares" | "reactions" | "views";
  const [sortKey, setSortKey] = useState<SortKey>("posted_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [plat, setPlat] = useState<"all" | "facebook" | "instagram" | "youtube">(lockPlatform ?? "all");
  // When this tab IS a platform (YouTube / Instagram), the switcher is redundant.
  const locked = !!lockPlatform;
  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc")); else { setSortKey(k); setSortDir("desc"); } };

  const fbCount = posted.filter((p) => p.platform === "facebook").length;
  const igCount = posted.filter((p) => p.platform === "instagram").length;
  const ytCount = posted.filter((p) => p.platform === "youtube").length;
  const PLATS: { k: typeof plat; label: string; n: number }[] = [
    { k: "all", label: "All", n: posted.length },
    { k: "instagram", label: "📸 Instagram", n: igCount },
    { k: "facebook", label: "👍 Facebook", n: fbCount },
    { k: "youtube", label: "▶️ YouTube", n: ytCount },
  ];

  const q = query.trim().toLowerCase();
  const rows = posted
    .filter((p) => plat === "all" || p.platform === plat)
    .filter((p) => !q || (p.text ?? "").toLowerCase().includes(q))
    .sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "posted_at") { av = a.posted_at ? Date.parse(a.posted_at) : 0; bv = b.posted_at ? Date.parse(b.posted_at) : 0; }
      else { av = a[sortKey] ?? -1; bv = b[sortKey] ?? -1; }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  const scope = locked ? posted.filter((p) => p.platform === lockPlatform) : posted;
  const totals = scope.reduce((a, p) => ({ likes: a.likes + (p.likes ?? 0), comments: a.comments + (p.comments ?? 0), shares: a.shares + (p.shares ?? 0), views: a.views + (p.views ?? 0) }), { likes: 0, comments: 0, shares: 0, views: 0 });
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : "");

  const Th = ({ k, label, className = "" }: { k: SortKey; label: string; className?: string }) => (
    <th className={`px-3 py-2 font-semibold text-zinc-400 cursor-pointer select-none hover:text-white whitespace-nowrap ${className}`} onClick={() => toggleSort(k)}>
      {label}<span className="text-blue-400">{arrow(k)}</span>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-white font-semibold text-sm">
            {locked ? `${lockPlatform === "youtube" ? "▶️ YouTube" : lockPlatform === "instagram" ? "📸 Instagram" : "👍 Facebook"}` : "📣 Posted"}
            <span className="text-zinc-600 font-normal"> ({scope.length} posts)</span>
          </p>
          <p className="text-zinc-500 text-xs mt-0.5">
            {locked
              ? `${totals.views.toLocaleString()} views · ${totals.likes.toLocaleString()} likes · ${totals.comments.toLocaleString()} comments`
              : `Everything that actually went out — Instagram + Facebook (90d) & YouTube (365d) — ${totals.likes} likes · ${totals.comments} comments · ${totals.views.toLocaleString()} views.`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-zinc-600 text-[11px]">🔄 Sync:</span>
          {SYNCS.map((s) => (
            <button key={s.k} onClick={() => void sync(s.k, s.label)} disabled={!!syncing}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 ${syncing === s.k ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200"}`}>
              {syncing === s.k ? "Pulling…" : s.label}
            </button>
          ))}
        </div>
      </div>
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}

      {posted.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {!locked && (
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {PLATS.map((o) => (
                <button key={o.k} onClick={() => setPlat(o.k)} className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${plat === o.k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {o.label} <span className={plat === o.k ? "text-blue-200" : "text-zinc-600"}>{o.n}</span>
                </button>
              ))}
            </div>
          )}
          <div className="relative flex-1 min-w-[180px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your posts…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
            {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs">✕</button>}
          </div>
        </div>
      )}

      {posted.length === 0 ? (
        <p className="text-zinc-600 text-sm text-center py-10">No posts pulled yet. Hit <span className="text-zinc-400">🔄 Sync from Facebook</span> to pull the last 30 days.</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-600 text-sm text-center py-10">No posts match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-zinc-900/80 border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide">
                  <Th k="posted_at" label="Date" />
                  <th className="px-3 py-2 font-semibold text-zinc-400 whitespace-nowrap">Profile</th>
                  <th className="px-3 py-2 font-semibold text-zinc-400 whitespace-nowrap">Platform</th>
                  <th className="px-3 py-2 font-semibold text-zinc-400">Post</th>
                  <Th k="views" label="Views" className="text-right" />
                  <Th k="likes" label="Likes" className="text-right" />
                  <Th k="comments" label="Comments" className="text-right" />
                  <Th k="shares" label="Shares" className="text-right" />
                  <th className="px-3 py-2 font-semibold text-zinc-400 whitespace-nowrap">Link</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const d = p.posted_at ? new Date(p.posted_at) : null;
                  return (
                    <tr key={p.id} className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors ${i % 2 ? "bg-zinc-900/30" : ""}`}>
                      <td className="px-3 py-2.5 whitespace-nowrap text-zinc-300 align-top">
                        <div className="font-medium">{d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                        <div className="text-[10px] text-zinc-600">{d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap align-top">
                        <a href={p.profile_url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-white">
                          <span className="text-xs">{p.profile_name || "Andrew Kroeze"}</span>
                          {p.media_type === "video" && <span className="text-[9px] text-zinc-500">🎬</span>}
                        </a>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap align-top">
                        {p.platform === "instagram" ? (
                          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded-md bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] flex items-center justify-center text-white text-[9px] flex-shrink-0">📷</span><span className="text-xs text-zinc-400">Instagram</span></span>
                        ) : p.platform === "youtube" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-md bg-[#FF0000] flex items-center justify-center text-white text-[8px] flex-shrink-0">▶</span>
                            <span className="text-xs text-zinc-400">YouTube</span>
                            {p.media_type === "short" ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">⚡ SHORT</span>
                            ) : (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">▶ LONG</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-[#1877F2] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">f</span><span className="text-xs text-zinc-400">Facebook</span></span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300 align-top max-w-[360px]">
                        <span className="line-clamp-2 leading-snug">{p.text || <span className="text-zinc-600 italic">No caption</span>}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-top">{p.views !== null && p.views > 0 ? <span className="text-zinc-200">{p.views.toLocaleString()}</span> : <span className="text-zinc-600">—</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300 align-top">{p.likes ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300 align-top">{p.comments ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300 align-top">{p.shares ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap align-top">
                        {p.post_url ? <a href={p.post_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-medium text-xs">Open →</a> : <span className="text-zinc-600 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
