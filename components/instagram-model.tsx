"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// Instagram → Model. Who we model, which posts, which hooks, which angles.
// Everything here is scraped live and stamped with when it was read.

type Account = {
  id: string; handle: string; name: string | null; why: string | null;
  followers: number | null; follows: number | null; posts_count: number | null;
  avg_views: number | null; synced_at: string | null;
};
type Post = {
  id: string; handle: string; post_url: string | null; post_type: string | null;
  caption: string | null; hook: string | null; theme: string; hashtags: string[] | null;
  views: number | null; likes: number | null; comments: number | null;
  posted_at: string | null; in_my_voice: string | null;
};

export type ModelView = "model" | "content" | "hooks" | "themes";

const n = (v: number | null | undefined) => (v == null ? "—" : new Intl.NumberFormat("en-US").format(v));
const compact = (v: number | null | undefined) =>
  v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v);
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
};
// Engagement rate says more than raw likes when accounts differ in size.
const engRate = (p: Post, followers: number | null) =>
  followers && followers > 0 ? ((p.likes ?? 0) + (p.comments ?? 0)) / followers * 100 : null;

export function InstagramModel({ view = "model" }: { view?: ModelView }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newHandle, setNewHandle] = useState("");
  const [who, setWho] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/instagram/model", { cache: "no-store" });
      const j = (await res.json()) as { accounts?: Account[]; posts?: Post[]; error?: string };
      if (j.error) throw new Error(j.error);
      setAccounts(j.accounts ?? []); setPosts(j.posts ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    const handle = newHandle.trim();
    if (!handle) return;
    setBusy("add"); setNote(null);
    try {
      const res = await fetch("/api/instagram/model", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const j = (await res.json()) as { error?: string; warning?: string; posts?: number };
      if (j.error) throw new Error(j.error);
      setNote(j.warning ?? `Added @${handle.replace(/^@/, "")} · ${j.posts ?? 0} posts read`);
      setNewHandle(""); await load();
    } catch (e) { setNote(e instanceof Error ? e.message : "Could not add"); }
    finally { setBusy(null); }
  }

  async function sync(handle?: string) {
    setBusy(handle ?? "all"); setNote(null);
    try {
      const res = await fetch("/api/instagram/model", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(handle ? { handle } : {}),
      });
      const j = (await res.json()) as { synced?: number; of?: number; failures?: { handle: string }[] };
      const failed = (j.failures ?? []).map((f) => f.handle).join(", ");
      setNote(`Refreshed ${j.synced}/${j.of}${failed ? ` · failed: ${failed}` : ""}`);
      await load();
    } catch (e) { setNote(e instanceof Error ? e.message : "Sync failed"); }
    finally { setBusy(null); }
  }

  async function remove(handle: string) {
    setBusy(handle);
    try {
      await fetch("/api/instagram/model", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      await load();
    } finally { setBusy(null); }
  }

  const shown = useMemo(() => (who ? posts.filter((p) => p.handle === who) : posts), [posts, who]);
  const followersOf = (h: string) => accounts.find((a) => a.handle === h)?.followers ?? null;

  return (
    <div className="space-y-4">
      {/* These four views sit in the page's own tab row now, so all that is
          left here is the toolbar, which is useful on every one of them. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 1 && (
            <select value={who ?? ""} onChange={(e) => setWho(e.target.value || null)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-300">
              <option value="">Everyone</option>
              {accounts.map((a) => <option key={a.handle} value={a.handle}>@{a.handle}</option>)}
            </select>
          )}
          <button onClick={() => void sync()} disabled={!!busy}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:text-white disabled:opacity-50">
            {busy === "all" ? "Refreshing…" : "↻ Refresh all"}
          </button>
        </div>
      </div>

      {note && <p role="status" className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{note}</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">{error}</p>}

      {loading ? (
        <p className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60 py-16 text-center text-sm text-zinc-500">Reading the accounts you model…</p>
      ) : (
        <>
          {view === "model" && <ModelTab accounts={accounts} posts={posts} busy={busy} onSync={sync} onRemove={remove}
            newHandle={newHandle} setNewHandle={setNewHandle} onAdd={add} />}
          {view === "content" && <ContentTab posts={shown} followersOf={followersOf} />}
          {view === "hooks" && <HooksTab posts={shown} />}
          {view === "themes" && <ThemesTab posts={shown} />}
        </>
      )}
    </div>
  );
}

// ── Model: who we're modelling ──────────────────────────────────────────────
function ModelTab({ accounts, posts, busy, onSync, onRemove, newHandle, setNewHandle, onAdd }: {
  accounts: Account[]; posts: Post[]; busy: string | null;
  onSync: (h?: string) => void; onRemove: (h: string) => void;
  newHandle: string; setNewHandle: (v: string) => void; onAdd: () => void;
}) {
  const COLS = "md:grid md:grid-cols-[minmax(0,1.4fr)_110px_100px_110px_110px_92px] md:items-center md:gap-3";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
        <input value={newHandle} onChange={(e) => setNewHandle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
          placeholder="Add an account to model — @handle or profile URL"
          className="min-w-[220px] flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-pink-500 focus:outline-none" />
        <button onClick={onAdd} disabled={busy === "add" || !newHandle.trim()}
          className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white hover:bg-pink-500 disabled:opacity-40">
          {busy === "add" ? "Reading…" : "Add"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className={cn("hidden border-b border-zinc-800 bg-zinc-950/50 px-4 py-2", COLS)}>
          {["Account", "Followers", "Posts", "Avg views", "Eng / post", "Synced"].map((h) => (
            <span key={h} className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{h}</span>
          ))}
        </div>
        {accounts.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-zinc-500">No accounts yet. Add one above ↑</p>
        ) : (
          <div className="divide-y divide-zinc-800/70">
            {accounts.map((a) => {
              const mine = posts.filter((p) => p.handle === a.handle);
              const eng = mine.length
                ? Math.round(mine.reduce((s, p) => s + (p.likes ?? 0) + (p.comments ?? 0), 0) / mine.length) : null;
              return (
                <div key={a.handle} className={cn("px-4 py-3 transition-colors hover:bg-zinc-800/40", COLS)}>
                  <div className="min-w-0">
                    <a href={`https://www.instagram.com/${a.handle}/`} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-bold text-white hover:text-pink-300">@{a.handle} ↗</a>
                    {a.name && <p className="truncate text-[11px] text-zinc-500">{a.name}</p>}
                    {a.why && <p className="mt-0.5 text-[11px] text-zinc-400">{a.why}</p>}
                  </div>
                  <span className="mt-1 block text-sm font-bold tabular-nums text-pink-300 md:mt-0">{n(a.followers)}</span>
                  <span className="text-sm tabular-nums text-zinc-300">{n(a.posts_count)}</span>
                  <span className="text-sm tabular-nums text-zinc-300">{n(a.avg_views)}</span>
                  <span className="text-sm tabular-nums text-zinc-300">{n(eng)}</span>
                  <div className="mt-2 flex items-center gap-2 md:mt-0">
                    <button onClick={() => onSync(a.handle)} disabled={!!busy} title={`Synced ${ago(a.synced_at)}`}
                      className="text-[11px] font-bold text-zinc-500 hover:text-white disabled:opacity-50">
                      {busy === a.handle ? "…" : ago(a.synced_at)}
                    </button>
                    <button onClick={() => onRemove(a.handle)} disabled={!!busy} aria-label={`Remove @${a.handle}`}
                      className="text-zinc-700 hover:text-rose-400">×</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Content Model: the individual posts worth copying ───────────────────────
function ContentTab({ posts, followersOf }: { posts: Post[]; followersOf: (h: string) => number | null }) {
  const [sort, setSort] = useState<"views" | "engagement">("views");
  const rows = [...posts].sort((a, b) =>
    sort === "views" ? (b.views ?? 0) - (a.views ?? 0)
      : ((b.likes ?? 0) + (b.comments ?? 0)) - ((a.likes ?? 0) + (a.comments ?? 0)));
  const COLS = "md:grid md:grid-cols-[minmax(0,2fr)_130px_100px_92px_88px_86px] md:items-center md:gap-3";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 p-4">
        <div>
          <p className="text-sm font-black text-white">Posts worth modelling</p>
          <p className="text-[11px] text-zinc-500">Their best work, newest read. Open one to see the whole caption.</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-950 p-0.5">
          {(["views", "engagement"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)}
              className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold capitalize",
                sort === s ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white")}>{s}</button>
          ))}
        </div>
      </div>
      <div className={cn("hidden border-b border-zinc-800 bg-zinc-950/50 px-4 py-2", COLS)}>
        {["Hook", "Theme", "Account", "Views", "Likes", "Eng %"].map((h) => (
          <span key={h} className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{h}</span>
        ))}
      </div>
      {rows.length === 0 ? <p className="px-4 py-12 text-center text-sm text-zinc-500">No posts yet.</p> : (
        <div className="divide-y divide-zinc-800/70">
          {rows.slice(0, 60).map((p) => {
            const rate = engRate(p, followersOf(p.handle));
            return (
              <a key={p.id} href={p.post_url ?? undefined} target="_blank" rel="noopener noreferrer"
                className={cn("block px-4 py-3 transition-colors hover:bg-zinc-800/40", COLS)}>
                <p className="line-clamp-2 text-sm text-zinc-200">{p.hook ?? "(no caption)"}</p>
                <span className="mt-1 inline-block w-fit rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px] font-bold text-zinc-400 md:mt-0">{p.theme}</span>
                <span className="mt-1 block text-[11px] text-zinc-500 md:mt-0">@{p.handle}</span>
                <span className="text-sm font-bold tabular-nums text-pink-300">{compact(p.views)}</span>
                <span className="text-sm tabular-nums text-zinc-400">{compact(p.likes)}</span>
                <span className="text-sm tabular-nums text-zinc-400">{rate == null ? "—" : `${rate.toFixed(2)}%`}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Hooks: the opening lines, ranked ────────────────────────────────────────
function HooksTab({ posts }: { posts: Post[] }) {
  const rows = [...posts].filter((p) => p.hook).sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <div className="border-b border-zinc-800 p-4">
        <p className="text-sm font-black text-white">🪝 Hooks that worked</p>
        <p className="text-[11px] text-zinc-500">The opening line of each post, ranked by how far it travelled. Click to copy.</p>
      </div>
      {rows.length === 0 ? <p className="px-4 py-12 text-center text-sm text-zinc-500">No hooks yet.</p> : (
        <div className="divide-y divide-zinc-800/70">
          {rows.slice(0, 50).map((p) => (
            <div key={p.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-zinc-800/40">
              <span className="w-16 shrink-0 pt-0.5 text-sm font-black tabular-nums text-pink-300">{compact(p.views)}</span>
              <button onClick={() => { navigator.clipboard?.writeText(p.hook ?? ""); setCopied(p.id); setTimeout(() => setCopied(null), 1400); }}
                className="min-w-0 flex-1 text-left">
                <p className="text-sm text-zinc-100">{p.hook}</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {p.theme} · @{p.handle}
                  {copied === p.id && <span className="ml-2 font-bold text-emerald-400">copied</span>}
                </p>
              </button>
              {p.post_url && (
                <a href={p.post_url} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-[11px] font-bold text-zinc-600 hover:text-white">open ↗</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Themes: which angles are actually landing ───────────────────────────────
function ThemesTab({ posts }: { posts: Post[] }) {
  const grouped = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) m.set(p.theme, [...(m.get(p.theme) ?? []), p]);
    return [...m.entries()]
      .map(([theme, list]) => {
        const withViews = list.filter((p) => p.views != null);
        const avg = withViews.length ? Math.round(withViews.reduce((s, p) => s + (p.views ?? 0), 0) / withViews.length) : 0;
        return { theme, posts: list.length, avg, best: [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0] };
      })
      // Ranked by average reach, not count — ten weak posts on one angle is not a win.
      .sort((a, b) => b.avg - a.avg);
  }, [posts]);
  const peak = Math.max(1, ...grouped.map((g) => g.avg));

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-sm font-black text-white">🧭 Angles that travel</p>
        <p className="text-[11px] text-zinc-500">Ranked by average views per post, not how often it is used — ten weak posts on one angle is not a win.</p>
      </div>
      {grouped.length === 0 ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900/60 py-12 text-center text-sm text-zinc-500">No posts yet.</p>
      ) : grouped.map((g) => (
        <div key={g.theme} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-black text-white">{g.theme}</p>
            <p className="text-xs text-zinc-400">
              <span className="font-bold text-pink-300">{n(g.avg)}</span> avg views · {g.posts} post{g.posts === 1 ? "" : "s"}
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-pink-500" style={{ width: `${Math.max((g.avg / peak) * 100, 2)}%` }} />
          </div>
          {g.best?.hook && (
            <a href={g.best.post_url ?? undefined} target="_blank" rel="noopener noreferrer"
              className="mt-3 block rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 transition-colors hover:border-zinc-700">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Best of this angle · {compact(g.best.views)} views</p>
              <p className="mt-1 text-sm text-zinc-200">{g.best.hook}</p>
              <p className="mt-1 text-[11px] text-zinc-500">@{g.best.handle}</p>
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
