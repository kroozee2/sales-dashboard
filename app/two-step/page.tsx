"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { SubTabs } from "@/components/sub-tabs";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ValueScript { title: string; body: string }
interface Resource { id: string; title: string; type: string; url: string | null; about?: string | null; value_scripts: ValueScript[] | null }
interface Post {
  id: string;
  platform: string;
  post_url: string;
  post_title: string | null;
  commenter_count: number;
  created_at: string;
  posted_at: string | null;
  status: string;
  resource_id: string | null;
  resources: Resource | null;
}
interface Commenter {
  id: string;
  name: string;
  profile_url: string | null;
  comment_text: string | null;
  lead_id: string | null;
  matched: boolean;
  status: string;
  lead: { phone: string | null; ghl_contact_id: string | null; prospect_stage: string | null } | null;
}

const STATUS_OPTIONS = [
  { key: "todo", label: "To-Do", emoji: "📋", pill: "bg-zinc-800 border-zinc-700 text-zinc-300", dot: "bg-zinc-500" },
  { key: "in_progress", label: "In Progress", emoji: "⏳", pill: "bg-amber-500/20 border-amber-500/30 text-amber-300", dot: "bg-amber-400" },
  { key: "done", label: "Done", emoji: "✅", pill: "bg-emerald-500/20 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-400" },
] as const;
const statusMeta = (k: string) => STATUS_OPTIONS.find((s) => s.key === k) ?? STATUS_OPTIONS[0];

const PLATFORMS = [
  { key: "facebook", label: "Facebook", emoji: "👥" },
  { key: "instagram", label: "Instagram", emoji: "📸" },
  { key: "skool", label: "Skool", emoji: "🎓" },
] as const;
const platformEmoji = (p: string) => PLATFORMS.find((x) => x.key === p)?.emoji ?? "🔗";

// ─── Commenter row (the send-a-message working unit) ──────────────────────────
function CommenterRow({ c, post }: { c: Commenter; post: Post }) {
  const [crafted, setCrafted] = useState<{ message: string; why: string } | null>(null);
  const [crafting, setCrafting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(c.status === "sent");
  const [sending, setSending] = useState(false);
  const first = c.name.split(" ")[0];

  async function craft() {
    setCrafting(true);
    try {
      const res = await fetch("/api/two-step/craft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: c.name, comment_text: c.comment_text, resource: post.resources, post_title: post.post_title }),
      });
      const json = await res.json() as { message?: string; why?: string };
      if (json.message) setCrafted({ message: json.message, why: json.why ?? "" });
    } finally { setCrafting(false); }
  }
  function quickScript(s: ValueScript) {
    setCrafted({ message: s.body.replaceAll("{name}", first).replaceAll("{url}", post.resources?.url ?? ""), why: s.title });
  }
  async function markSent() {
    setSent(true);
    await fetch(`/api/two-step/${post.id}/commenters`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, status: "sent" }),
    });
  }
  async function sendGhl(message: string) {
    if (!c.lead?.ghl_contact_id || !c.lead_id) return;
    setSending(true);
    try {
      await fetch(`/api/leads/${c.lead_id}/message`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "sms", message, contactId: c.lead.ghl_contact_id }),
      });
      await markSent();
    } finally { setSending(false); }
  }

  return (
    <div className={`px-4 py-3 ${sent ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white text-sm font-semibold">{c.name}</p>
          {c.matched ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">✓ IN LEADS{c.lead?.prospect_stage ? ` · ${c.lead.prospect_stage}` : ""}</span>
            : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">➕ NEW LEAD</span>}
          {sent && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">SENT</span>}
        </div>
        {c.comment_text && <p className="text-zinc-500 text-xs mt-1 italic">&ldquo;{c.comment_text}&rdquo;</p>}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        {c.profile_url && <a href={c.profile_url} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-medium transition-colors">{post.platform === "instagram" ? "📸 Profile" : "👥 Profile"}</a>}
        <button onClick={() => void craft()} disabled={crafting} className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors disabled:opacity-40">
          {crafting ? "Writing…" : "✨ Craft"}
        </button>
        {post.resources?.value_scripts?.slice(0, 1).map((s, i) => (
          <button key={i} onClick={() => quickScript(s)} className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-medium transition-colors">📋 Quick</button>
        ))}
        {!sent && <button onClick={() => void markSent()} className="ml-auto px-2 py-1 rounded-lg text-zinc-500 hover:text-emerald-400 text-xs transition-colors">✓ mark sent</button>}
      </div>

      {crafted && (
        <div className="mt-2 bg-gradient-to-br from-violet-950/40 to-zinc-900 border border-violet-700/40 rounded-xl p-3">
          <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{crafted.message}</p>
          {crafted.why && <p className="text-zinc-500 text-[11px] mt-1.5 italic">💡 {crafted.why}</p>}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {c.lead?.ghl_contact_id && (
              <button onClick={() => void sendGhl(crafted.message)} disabled={sending || sent}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${sent ? "bg-emerald-600/30 text-emerald-300 border border-emerald-600/40" : "bg-violet-600 hover:bg-violet-500 text-white"}`}>
                {sent ? "✓ Sent" : sending ? "Sending…" : "⚡ Send via GHL"}
              </button>
            )}
            <button onClick={() => { void navigator.clipboard.writeText(crafted.message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold transition-colors">
              {copied ? "✓ Copied" : "📋 Copy"}
            </button>
            {c.profile_url && <a href={c.profile_url} target="_blank" rel="noreferrer" onClick={() => { void navigator.clipboard.writeText(crafted.message); }}
              className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-semibold transition-colors">Copy + open DM →</a>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Post tile (grid card) ────────────────────────────────────────────────────
function PostTile({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const st = statusMeta(post.status);
  const isSkool = post.platform === "skool";
  const postedLabel = post.posted_at
    ? new Date(post.posted_at + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  return (
    <button onClick={onOpen} className="group text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 flex flex-col gap-2.5 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">{platformEmoji(post.platform)}</span>
          <p className="text-white text-sm font-semibold line-clamp-2 leading-snug">{post.post_title ?? post.post_url}</p>
        </div>
        <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${st.dot}`} title={st.label} />
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-500">
        {postedLabel && <span>📅 {postedLabel}</span>}
        {!isSkool && <span>· 💬 {post.commenter_count}</span>}
        {isSkool && <span>· manual</span>}
      </div>

      {post.resources && (
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 w-fit truncate max-w-full">🎁 {post.resources.title}</span>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        <a href={post.post_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-semibold transition-colors">
          Open post ↗
        </a>
        <span className="ml-auto text-zinc-600 group-hover:text-zinc-300 text-xs font-medium transition-colors">
          {isSkool ? "Work it →" : `${post.commenter_count} to DM →`}
        </span>
      </div>
    </button>
  );
}

// ─── Edit sidebar ─────────────────────────────────────────────────────────────
function PostSidebar({ post, resources, onClose, onPatch, onDelete }: {
  post: Post;
  resources: Resource[];
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Post>) => Promise<Post | null>;
  onDelete: (id: string) => void;
}) {
  const [local, setLocal] = useState<Post>(post);
  const [commenters, setCommenters] = useState<Commenter[] | null>(null);
  const [filter, setFilter] = useState<"all" | "matched" | "new">("all");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const isSkool = local.platform === "skool";

  useEffect(() => { setLocal(post); }, [post]);
  useEffect(() => {
    if (isSkool) { setCommenters(null); return; }
    let done = false;
    fetch(`/api/two-step/${post.id}/commenters`).then((r) => r.json()).then((j: { commenters?: Commenter[] }) => { if (!done) setCommenters(j.commenters ?? []); });
    return () => { done = true; };
  }, [post.id, isSkool]);

  async function patch(patchBody: Partial<Post> & { resource_id?: string | null }) {
    setLocal((p) => ({ ...p, ...patchBody }));
    const updated = await onPatch(post.id, patchBody);
    if (updated) setLocal(updated);
  }

  const shown = (commenters ?? []).filter((c) => filter === "all" ? true : filter === "matched" ? c.matched : !c.matched);

  return (
    <div className="fixed inset-0 z-[60] flex" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />
      <div className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 border-b border-zinc-800 px-5 pt-5 pb-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl">{platformEmoji(local.platform)}</span>
              <h2 className="text-white font-bold text-base leading-tight line-clamp-2">{local.post_title ?? local.post_url}</h2>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href={local.post_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-semibold transition-colors">Open post ↗</a>
            {local.resources?.url && <a href={local.resources.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 text-xs font-semibold transition-colors">🎁 Resource ↗</a>}
          </div>
        </div>

        {/* Edit fields */}
        <div className="px-5 py-4 space-y-3 border-b border-zinc-800">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Edit post</p>
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1">Title</label>
            <input value={local.post_title ?? ""} onChange={(e) => setLocal((p) => ({ ...p, post_title: e.target.value }))} onBlur={() => void patch({ post_title: local.post_title })}
              placeholder="Label this post…" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1">Post link</label>
            <input value={local.post_url} onChange={(e) => setLocal((p) => ({ ...p, post_url: e.target.value }))} onBlur={() => void patch({ post_url: local.post_url })}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">Platform</label>
              <select value={local.platform} onChange={(e) => void patch({ platform: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
                {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">Posted</label>
              <input type="date" value={local.posted_at ?? ""} onChange={(e) => { setLocal((p) => ({ ...p, posted_at: e.target.value })); void patch({ posted_at: e.target.value }); }}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1">🎁 Deliver resource</label>
            <select value={local.resource_id ?? ""} onChange={(e) => void patch({ resource_id: e.target.value || null })}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
              <option value="">— No resource —</option>
              {resources.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1.5">Progress</label>
            <div className="flex gap-1.5">
              {STATUS_OPTIONS.map((s) => (
                <button key={s.key} onClick={() => void patch({ status: s.key })}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${local.status === s.key ? s.pill : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"}`}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Working area */}
        <div className="flex-1">
          {isSkool ? (
            <div className="px-5 py-4 space-y-2">
              <p className="text-zinc-400 text-xs font-semibold">💬 Value scripts to send in the DMs</p>
              {local.resources?.value_scripts && local.resources.value_scripts.length > 0 ? (
                local.resources.value_scripts.map((s, i) => {
                  const filled = s.body.replaceAll("{name}", "there").replaceAll("{url}", local.resources?.url ?? "");
                  return (
                    <button key={i} onClick={() => { void navigator.clipboard.writeText(filled); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1500); }}
                      className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl px-3 py-2.5 transition-colors">
                      <p className="text-zinc-600 text-[10px] mb-0.5">{s.title} — tap to copy</p>
                      <p className="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap">{copiedIdx === i ? "✓ Copied!" : filled}</p>
                    </button>
                  );
                })
              ) : (
                <p className="text-zinc-600 text-xs">No value scripts on this resource. Add some on the <a href="/resources" className="underline">Resources</a> page.</p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-zinc-800/60 sticky top-0 bg-zinc-950 z-10">
                {(["all", "matched", "new"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-white"}`}>
                    {f === "all" ? `All ${commenters?.length ?? ""}` : f === "matched" ? "✓ In Leads" : "➕ New"}
                  </button>
                ))}
              </div>
              {!commenters ? <p className="text-zinc-600 text-sm text-center py-10 animate-pulse">Loading commenters…</p>
                : shown.length === 0 ? <p className="text-zinc-600 text-sm text-center py-10">No commenters here yet.</p>
                : <div className="divide-y divide-zinc-800/50">{shown.map((c) => <CommenterRow key={c.id} c={c} post={local} />)}</div>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-zinc-800 px-5 py-3">
          <button onClick={() => onDelete(post.id)} className="text-zinc-600 hover:text-rose-400 text-xs transition-colors">🗑 Delete post</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add post modal (the scraper) ─────────────────────────────────────────────
function AddPostModal({ resources, onClose, onDone }: { resources: Resource[]; onClose: () => void; onDone: () => void }) {
  const [platform, setPlatform] = useState<"facebook" | "instagram" | "skool">("facebook");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function scrape() {
    if (!url.trim()) return;
    setScraping(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/two-step", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_url: url.trim(), platform, resource_id: resourceId || null, post_title: title.trim() || null }),
      });
      const json = await res.json() as { commenters?: number; matched?: number; created?: number; saved?: boolean; error?: string };
      if (json.error) throw new Error(json.error);
      setResult(json.saved ? "Saved." : `Pulled ${json.commenters} commenters · ${json.matched} already leads · ${json.created} new`);
      setUrl(""); setTitle("");
      onDone();
      setTimeout(onClose, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setScraping(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-base">🔗 Add two-step post</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        <div className="flex gap-1 bg-zinc-800 rounded-xl p-1">
          {PLATFORMS.map((p) => (
            <button key={p.key} onClick={() => setPlatform(p.key)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${platform === p.key ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-white"}`}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
        {platform === "skool" && (
          <p className="text-[11px] text-zinc-500 bg-zinc-800/60 border border-zinc-800 rounded-lg px-3 py-2">
            Skool comments can&apos;t be auto-pulled. Save the link + resource, then work the comments manually with the value scripts.
          </p>
        )}
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={platform === "skool" ? "Paste Skool post link…" : `Paste ${platform === "facebook" ? "Facebook" : "Instagram"} post or reel link…`}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Label this post (optional)"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
        <div className="flex items-center gap-2">
          <label className="text-zinc-500 text-xs flex-shrink-0">🎁 Deliver:</label>
          <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
            <option value="">— No resource —</option>
            {resources.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>
        <button onClick={() => void scrape()} disabled={scraping || !url.trim()}
          className="w-full py-3 bg-white text-zinc-900 font-bold rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-40 text-sm">
          {scraping
            ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />{platform === "skool" ? "Saving…" : "Pulling commenters…"}</span>
            : platform === "skool" ? "💾 Save post" : "🔍 Pull commenters"}
        </button>
        {result && <p className="text-emerald-400 text-xs text-center">{result}</p>}
        {error && <p className="text-rose-400 text-xs text-center">{error}</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TwoStepPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([fetch("/api/two-step"), fetch("/api/resources")]);
    const pj = await p.json() as { posts?: Post[] };
    const rj = await r.json() as { resources?: Resource[] };
    setPosts(pj.posts ?? []);
    setResources(rj.resources ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patchPost = useCallback(async (id: string, patch: Partial<Post> & { resource_id?: string | null }) => {
    const res = await fetch("/api/two-step", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const j = await res.json() as { post?: Post };
    if (j.post) { setPosts((prev) => prev.map((p) => (p.id === id ? j.post! : p))); return j.post; }
    return null;
  }, []);

  async function del(id: string) {
    setPosts((p) => p.filter((x) => x.id !== id));
    setOpenId(null);
    await fetch("/api/two-step", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  const platformCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of posts) c[p.platform] = (c[p.platform] ?? 0) + 1;
    return c;
  }, [posts]);

  const filtered = useMemo(
    () => (platform === "all" ? posts : posts.filter((p) => p.platform === platform)),
    [posts, platform]
  );
  const openPost = posts.find((p) => p.id === openId) ?? null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <SubTabs group="resources" />
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">🔗 Two-Step Posts</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Work every post by progress. Open one to DM the people who engaged, with the script ready to send.</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0">
          <span className="text-base leading-none">+</span> Add post
        </button>
      </div>

      {/* Platform selector */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <button onClick={() => setPlatform("all")}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${platform === "all" ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
          All <span className="text-zinc-600">{posts.length}</span>
        </button>
        {PLATFORMS.map((p) => (
          <button key={p.key} onClick={() => setPlatform(p.key)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${platform === p.key ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
            {p.emoji} {p.label} <span className="text-zinc-600">{platformCounts[p.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-600 text-sm text-center py-16 animate-pulse">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-3xl py-16 text-center">
          <p className="text-4xl mb-3">🔗</p>
          <p className="text-zinc-300 font-medium">No posts yet</p>
          <p className="text-zinc-600 text-sm mt-1">Add a post link and we&apos;ll pull everyone who engaged.</p>
          <button onClick={() => setAdding(true)} className="mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors">+ Add your first post</button>
        </div>
      ) : (
        <div className="space-y-7">
          {STATUS_OPTIONS.map((s) => {
            const group = filtered.filter((p) => (p.status || "todo") === s.key);
            if (group.length === 0) return null;
            return (
              <div key={s.key}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                  <h2 className="text-white font-semibold text-sm">{s.emoji} {s.label}</h2>
                  <span className="text-zinc-600 text-xs font-medium">{group.length}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 items-stretch">
                  {group.map((p) => <PostTile key={p.id} post={p} onOpen={() => setOpenId(p.id)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openPost && (
        <PostSidebar post={openPost} resources={resources} onClose={() => setOpenId(null)} onPatch={patchPost} onDelete={del} />
      )}
      {adding && <AddPostModal resources={resources} onClose={() => setAdding(false)} onDone={load} />}
    </div>
  );
}
