"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { SubTabs } from "@/components/sub-tabs";

// ─── Types ────────────────────────────────────────────────────────────────────

type Kind = "script" | "voice" | "gif" | "resource";

interface Item {
  id: string;
  category: string;
  title: string;
  body: string;
  kind: Kind;
  media_url: string | null;
  favorite: boolean;
  sort: number;
  active: boolean;
}

interface Category {
  key: string;
  label: string;
  emoji: string | null;
  sort: number;
}

interface Reopener {
  title: string;
  body: string;
  type: string;
  saved?: boolean;
}

const KINDS: { key: Kind; emoji: string; label: string }[] = [
  { key: "script", emoji: "💬", label: "Script" },
  { key: "voice", emoji: "🎙️", label: "Voice Note" },
  { key: "gif", emoji: "🎞️", label: "GIF" },
  { key: "resource", emoji: "🔗", label: "Resource" },
];

function kindMeta(k: string) {
  return KINDS.find((x) => x.key === k) ?? KINDS[0];
}

const TYPE_COLORS: Record<string, string> = {
  value: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  reframe: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  proof: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  interrupt: "bg-pink-500/20 text-pink-300 border-pink-500/30",
};

const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors";

// ─── Voice recorder ─────────────────────────────────────────────────────────
function VoiceRecorder({ onRecorded, existingUrl }: { onRecorded: (blob: Blob, ext: string) => void; existingUrl: string | null }) {
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(existingUrl);
  const [seconds, setSeconds] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function start() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        setUrl(URL.createObjectURL(blob));
        onRecorded(blob, ext);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setErr("Microphone access denied. Allow mic access and try again.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        {recording ? (
          <button onClick={stop} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors">
            <span className="w-2.5 h-2.5 rounded-sm bg-white animate-pulse" /> Stop
          </button>
        ) : (
          <button onClick={start} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
            <span className="w-2.5 h-2.5 rounded-full bg-white" /> {url ? "Re-record" : "Record"}
          </button>
        )}
        {recording && <span className="text-rose-300 text-sm font-mono">{mm}:{ss}</span>}
      </div>
      {err && <p className="text-rose-400 text-xs">{err}</p>}
      {url && !recording && (
        <div className="space-y-2">
          <audio src={url} controls className="w-full h-9" />
          <a href={url} download="voice-note.webm" className="inline-flex items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200">⬇ Download</a>
        </div>
      )}
    </div>
  );
}

// ─── Item sidebar (view / edit / create) ─────────────────────────────────────
function ItemSidebar({ initial, categories, onSave, onDelete, onClose, onCopy, copied }: {
  initial: Partial<Item> | null;
  categories: Category[];
  onSave: (payload: Partial<Item> & { id?: string; _blob?: Blob; _ext?: string }) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const isNew = !initial?.id;
  const [kind, setKind] = useState<Kind>((initial?.kind as Kind) ?? "script");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? categories[0]?.key ?? "custom");
  const [body, setBody] = useState(initial?.body ?? "");
  const [mediaUrl, setMediaUrl] = useState(initial?.media_url ?? "");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [ext, setExt] = useState("webm");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!title.trim()) { setErr("Title is required"); return; }
    if (kind === "script" && !body.trim()) { setErr("Add the message body"); return; }
    if ((kind === "gif" || kind === "resource") && !mediaUrl.trim()) { setErr("Add a URL"); return; }
    if (kind === "voice" && !blob && !mediaUrl) { setErr("Record a voice note first"); return; }
    setSaving(true);
    try {
      await onSave({ id: initial?.id, kind, title: title.trim(), category, body: body.trim(), media_url: mediaUrl.trim() || null, _blob: blob ?? undefined, _ext: ext });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-white font-bold">{isNew ? "New item" : "Edit item"}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Kind selector (new only) */}
          {isNew ? (
            <div className="grid grid-cols-4 gap-2">
              {KINDS.map((k) => (
                <button key={k.key} onClick={() => setKind(k.key)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[11px] font-medium transition-colors ${kind === k.key ? "bg-blue-600/20 border-blue-500 text-blue-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}>
                  <span className="text-lg">{k.emoji}</span>{k.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300">{kindMeta(kind).emoji} {kindMeta(kind).label}</div>
          )}

          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Name this item" autoFocus />
          </div>

          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
            </select>
          </div>

          {kind === "script" && (
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={`${inputCls} resize-none`} placeholder="The message… use {name} for their first name" />
              <p className="text-[10px] text-zinc-600 mt-1">Use {"{name}"} where their first name goes</p>
            </div>
          )}

          {kind === "voice" && (
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Voice note</label>
              <VoiceRecorder existingUrl={initial?.media_url ?? null} onRecorded={(b, e) => { setBlob(b); setExt(e); }} />
              <p className="text-[10px] text-zinc-600 mt-1">Record in your own voice, then save. You can download it to send to prospects.</p>
            </div>
          )}

          {(kind === "gif" || kind === "resource") && (
            <>
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">{kind === "gif" ? "GIF URL" : "Link (video, doc, anything)"}</label>
                <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} className={inputCls} placeholder={kind === "gif" ? "https://media.giphy.com/…" : "https://…"} />
              </div>
              {kind === "gif" && mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt={title} className="w-full rounded-xl border border-zinc-800" />
              )}
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Note (optional)</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="When to use this" />
              </div>
            </>
          )}

          {/* Existing media preview for saved items */}
          {!isNew && kind === "voice" && initial?.media_url && !blob && (
            <div className="space-y-2">
              <audio src={initial.media_url} controls className="w-full h-9" />
              <a href={initial.media_url} download className="inline-flex items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200">⬇ Download to send</a>
            </div>
          )}

          {kind === "script" && !isNew && (
            <button onClick={() => onCopy(body)} className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors">
              {copied ? "✓ Copied!" : "📋 Copy message"}
            </button>
          )}

          {err && <p className="text-rose-400 text-sm">{err}</p>}
        </div>

        <div className="flex gap-2 p-5 border-t border-zinc-800 flex-shrink-0">
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors">
            {saving ? "Saving…" : isNew ? "Add" : "Save"}
          </button>
          {!isNew && initial?.id && (
            <button onClick={() => onDelete(initial.id!)} className="px-4 py-2.5 rounded-xl bg-rose-600/10 hover:bg-rose-600/30 border border-rose-600/20 text-rose-400 text-sm transition-colors">🗑</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ScriptsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"library" | "studio">("library");

  // filters
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  // sidebar
  const [selected, setSelected] = useState<Partial<Item> | null>(null);
  const [copied, setCopied] = useState(false);

  // new category
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("");

  // studio
  const [generating, setGenerating] = useState(false);
  const [reopeners, setReopeners] = useState<Reopener[]>([]);
  const [studioSources, setStudioSources] = useState<{ videos: number; wins: number } | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [copiedRe, setCopiedRe] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      fetch("/api/scripts").then((r) => r.json()).catch(() => ({})),
      fetch("/api/scripts/categories").then((r) => r.json()).catch(() => ({})),
    ]);
    setItems((s.scripts ?? []) as Item[]);
    setCategories((c.categories ?? []) as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function copyText(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function toggleFav(item: Item) {
    setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, favorite: !s.favorite } : s)));
    await fetch("/api/scripts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, favorite: !item.favorite }) });
  }

  async function saveItem(payload: Partial<Item> & { id?: string; _blob?: Blob; _ext?: string }) {
    let media_url = payload.media_url ?? null;
    // Upload a freshly recorded voice note first
    if (payload._blob) {
      const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(payload._blob!); });
      const up = await fetch("/api/scripts/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioBase64: b64, ext: payload._ext }) }).then((r) => r.json());
      if (up.error) throw new Error(up.error);
      media_url = up.url;
    }
    const clean = { category: payload.category, title: payload.title, body: payload.body, kind: payload.kind, media_url };
    if (payload.id) {
      setItems((prev) => prev.map((s) => (s.id === payload.id ? { ...s, ...clean } as Item : s)));
      await fetch("/api/scripts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: payload.id, ...clean }) });
    } else {
      const sort = items.filter((s) => s.category === payload.category).length;
      const res = await fetch("/api/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...clean, sort }) }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      if (res.script) setItems((prev) => [res.script as Item, ...prev]);
    }
    setSelected(null);
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((s) => s.id !== id));
    setSelected(null);
    await fetch("/api/scripts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  async function addCategory() {
    if (!newCatLabel.trim()) return;
    const res = await fetch("/api/scripts/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: newCatLabel.trim(), emoji: newCatEmoji.trim() }) }).then((r) => r.json());
    if (res.category) setCategories((prev) => [...prev, res.category as Category]);
    setNewCatLabel(""); setNewCatEmoji(""); setNewCatOpen(false);
  }

  async function generateReopeners() {
    setGenerating(true); setStudioError(null);
    try {
      const res = await fetch("/api/scripts/reopeners", { method: "POST" });
      const json = await res.json() as { reopeners?: Reopener[]; sources?: { videos: number; wins: number }; error?: string };
      if (json.error) throw new Error(json.error);
      setReopeners(json.reopeners ?? []);
      setStudioSources(json.sources ?? null);
    } catch (e) {
      setStudioError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveReopener(idx: number) {
    const r = reopeners[idx];
    const sort = items.filter((s) => s.category === "reopener").length;
    const res = await fetch("/api/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "reopener", title: r.title, body: r.body, kind: "script", sort }) }).then((x) => x.json());
    if (res.script) setItems((prev) => [res.script as Item, ...prev]);
    setReopeners((prev) => prev.map((x, i) => (i === idx ? { ...x, saved: true } : x)));
  }

  // filtering
  const q = search.trim().toLowerCase();
  const filtered = items.filter((s) =>
    (!catFilter || s.category === catFilter) &&
    (!kindFilter || s.kind === kindFilter) &&
    (!favOnly || s.favorite) &&
    (!q || s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
  );
  const catLabel = (key: string) => categories.find((c) => c.key === key) ?? { key, label: key, emoji: "🏷️", sort: 99 };
  // group by category in category order
  const groups = categories
    .map((c) => ({ cat: c, rows: filtered.filter((s) => s.category === c.key) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="max-w-6xl mx-auto">
      <SubTabs group="leads" />
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">💬 Scripts</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Scripts, voice notes, GIFs & resources — favorite the best, send them fast.</p>
        </div>
        <button onClick={() => setSelected({})} className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors">+ Add</button>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1 mb-5">
        <button onClick={() => setTab("library")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === "library" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-zinc-400 hover:text-white"}`}>📚 Library</button>
        <button onClick={() => setTab("studio")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === "studio" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-zinc-400 hover:text-white"}`}>✨ Re-Opener Studio</button>
      </div>

      {tab === "library" && (
        <>
          {/* Filter toolbar */}
          <div className="flex flex-wrap gap-2 items-center mb-4">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search scripts…" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500" />
            </div>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none cursor-pointer">
              <option value="">All Categories ({items.length})</option>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label} ({items.filter((s) => s.category === c.key).length})</option>)}
            </select>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none cursor-pointer">
              <option value="">All Types</option>
              {KINDS.map((k) => <option key={k.key} value={k.key}>{k.emoji} {k.label}</option>)}
            </select>
            <button onClick={() => setFavOnly((v) => !v)} className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${favOnly ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white"}`}>⭐ Favorites</button>
            <button onClick={() => setNewCatOpen(true)} className="px-3 py-2 rounded-lg text-sm font-medium bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white transition-colors">+ Category</button>
          </div>

          {loading ? (
            <p className="text-zinc-600 text-sm text-center py-10 animate-pulse">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center text-zinc-600 py-14">
              <p className="text-3xl mb-2">📭</p>
              <p>Nothing here yet. Hit <span className="text-blue-400">+ Add</span> to create your first one.</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Column header (desktop) */}
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 border-b border-zinc-800">
                <span className="w-6 flex-shrink-0" />
                <span className="w-8 flex-shrink-0" />
                <span style={{ flex: "2 1 0%" }}>Title</span>
                <span className="hidden md:block" style={{ flex: "2 1 0%" }}>Preview</span>
                <span className="w-[130px] flex-shrink-0">Category</span>
                <span className="w-[70px] flex-shrink-0 text-right">Actions</span>
              </div>
              {groups.map((g) => (
                <div key={g.cat.key}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950/40 border-b border-zinc-800/60">
                    <span className="text-sm">{g.cat.emoji}</span>
                    <span className="text-zinc-300 text-xs font-semibold">{g.cat.label}</span>
                    <span className="text-zinc-600 text-xs">{g.rows.length}</span>
                  </div>
                  <div className="divide-y divide-zinc-800/50">
                    {g.rows.map((s) => {
                      const km = kindMeta(s.kind);
                      return (
                        <div key={s.id} onClick={() => setSelected(s)} className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800/50 cursor-pointer transition-colors group">
                          <button onClick={(e) => { e.stopPropagation(); void toggleFav(s); }} className={`w-6 flex-shrink-0 text-center text-sm ${s.favorite ? "text-amber-400" : "text-zinc-700 hover:text-zinc-400"}`}>{s.favorite ? "★" : "☆"}</button>
                          <span className="w-8 flex-shrink-0 text-center text-lg" title={km.label}>{km.emoji}</span>
                          <span className="font-medium text-white text-sm truncate" style={{ flex: "2 1 0%" }}>{s.title}</span>
                          <span className="hidden md:block text-zinc-500 text-xs truncate" style={{ flex: "2 1 0%" }}>
                            {s.kind === "script" ? s.body : s.kind === "voice" ? "🎧 Voice note" : s.media_url}
                          </span>
                          <span className="w-[130px] flex-shrink-0"><span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">{catLabel(s.category).emoji} {catLabel(s.category).label}</span></span>
                          <span className="w-[70px] flex-shrink-0 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {s.kind === "script" && <button onClick={() => copyText(s.body)} title="Copy" className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs transition-colors">📋</button>}
                            {s.kind === "voice" && s.media_url && <a href={s.media_url} download title="Download" className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs transition-colors">⬇</a>}
                            {(s.kind === "gif" || s.kind === "resource") && s.media_url && <a href={s.media_url} target="_blank" rel="noreferrer" title="Open" className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs transition-colors">↗</a>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "studio" && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-white font-bold text-sm mb-1">✨ Generate fresh re-openers</p>
            <p className="text-zinc-500 text-xs leading-relaxed mb-4">Pulls your latest YouTube videos and most recent client wins, then writes re-openers in your voice. Save the keepers to your library.</p>
            <button onClick={generateReopeners} disabled={generating} className="w-full py-3 bg-white text-zinc-900 font-bold rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-40 text-sm">
              {generating ? (<span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />Pulling videos + wins…</span>) : "✨ Generate Re-Openers"}
            </button>
            {studioSources && <p className="text-zinc-600 text-xs mt-2 text-center">Fueled by {studioSources.videos} recent videos · {studioSources.wins} recent client wins</p>}
            {studioError && <p className="text-rose-400 text-xs mt-2 text-center">{studioError}</p>}
          </div>
          {reopeners.map((r, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-zinc-300 text-xs font-semibold">{r.title}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TYPE_COLORS[r.type] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>{r.type.toUpperCase()}</span>
              </div>
              <button onClick={() => { void navigator.clipboard.writeText(r.body); setCopiedRe(`re_${i}`); setTimeout(() => setCopiedRe(null), 1500); }} className="w-full text-left mb-3">
                <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{copiedRe === `re_${i}` ? "✓ Copied!" : r.body}</p>
              </button>
              <button onClick={() => void saveReopener(i)} disabled={r.saved} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${r.saved ? "bg-emerald-600/20 border-emerald-600/30 text-emerald-300" : "bg-blue-600 hover:bg-blue-500 border-blue-500 text-white"}`}>
                {r.saved ? "✓ Saved to Library" : "💾 Save to Library"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Sidebar */}
      {selected && (
        <ItemSidebar initial={selected} categories={categories} onSave={saveItem} onDelete={deleteItem} onClose={() => setSelected(null)} onCopy={copyText} copied={copied} />
      )}

      {/* New category modal */}
      {newCatOpen && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setNewCatOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h3 className="text-white font-bold">New category</h3>
            <div className="flex gap-2">
              <input value={newCatEmoji} onChange={(e) => setNewCatEmoji(e.target.value)} placeholder="🏷️" className={`${inputCls} w-16 text-center`} />
              <input value={newCatLabel} onChange={(e) => setNewCatLabel(e.target.value)} placeholder="Category name" className={inputCls} autoFocus onKeyDown={(e) => { if (e.key === "Enter") void addCategory(); }} />
            </div>
            <div className="flex gap-2">
              <button onClick={addCategory} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors">Add category</button>
              <button onClick={() => setNewCatOpen(false)} className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
