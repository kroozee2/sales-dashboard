"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { SubTabs } from "@/components/sub-tabs";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ValueScript { title: string; body: string }
interface Resource {
  id: string;
  title: string;
  type: string;
  category: string | null;
  subtitle: string | null;
  about: string | null;
  url: string | null;
  image_url: string | null;
  value_scripts: ValueScript[] | null;
  metadata: Record<string, unknown> | null;
  sort_order: number | null;
  is_favorite: boolean;
  active: boolean;
}

type CatKey = "social" | "inbox" | "tools" | "lead_magnet" | "funnel" | "testimonial" | "case_study";

const CATEGORIES: { key: CatKey; emoji: string; label: string; blurb: string }[] = [
  { key: "social", emoji: "📱", label: "Socials", blurb: "Andrew's profiles & communities" },
  { key: "inbox", emoji: "📥", label: "Inbox", blurb: "Everywhere to reply today" },
  { key: "tools", emoji: "🛠️", label: "Tools", blurb: "The apps you run the business in" },
  { key: "lead_magnet", emoji: "🧲", label: "Lead Magnets", blurb: "Free value assets to deliver" },
  { key: "funnel", emoji: "🌐", label: "Funnels", blurb: "Pages that move to a sale" },
  { key: "testimonial", emoji: "⭐", label: "Testimonials", blurb: "Client wins to drop in DMs" },
  { key: "case_study", emoji: "📈", label: "Case Studies", blurb: "Full result stories with proof" },
];
const catMeta = (k: string | null) => CATEGORIES.find((c) => c.key === k) ?? CATEGORIES[3];
// Categories that render as compact click-and-open tiles
const LINK_CATS: string[] = ["social", "inbox", "tools"];

const PLATFORM_EMOJI: Record<string, string> = {
  facebook: "📘", instagram: "📸", youtube: "▶️", tiktok: "🎵",
  linkedin: "💼", skool: "🎓", manychat: "💬", ghl: "⚡",
  gmail: "✉️", stripe: "💳", airtable: "📊", notion: "📝", fathom: "🎥",
};
const platformEmoji = (r: Resource) =>
  PLATFORM_EMOJI[String(r.metadata?.platform ?? "")] ?? "🔗";

function personalize(body: string, name: string, url: string | null) {
  return body.replaceAll("{name}", name.trim() || "there").replaceAll("{url}", url ?? "");
}

// Add https:// to bare domains; leave anything that isn't URL-shaped untouched.
function normalizeUrl(u: string): string {
  const t = u.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (!t.includes(" ") && /^[^\s]+\.[^\s]{2,}/.test(t)) return "https://" + t;
  return t;
}
function looksLikeUrl(u: string): boolean {
  return /^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(normalizeUrl(u));
}

// ─── Voice hook (Web Speech API) ──────────────────────────────────────────────
function useVoice(onText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const supported = typeof window !== "undefined" &&
    !!((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition ||
       (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition);

  function toggle() {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const w = window as unknown as { webkitSpeechRecognition?: new () => never; SpeechRecognition?: new () => never };
    const SR = (w.webkitSpeechRecognition ?? w.SpeechRecognition) as unknown as
      (new () => { continuous: boolean; interimResults: boolean; lang: string; onresult: (e: { resultIndex: number; results: { [i: number]: { isFinal: boolean; 0: { transcript: string } }; length: number } }) => void; onend: () => void; start: () => void; stop: () => void }) | undefined;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = false; rec.lang = "en-US";
    rec.onresult = (e) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) chunk += e.results[i][0].transcript + " ";
      }
      if (chunk) onText(chunk);
    };
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }
  return { listening, toggle, supported };
}

// ─── Copyable script block ────────────────────────────────────────────────────
function ScriptBlock({ s, url, name }: { s: ValueScript; url: string | null; name: string }) {
  const [copied, setCopied] = useState(false);
  const text = personalize(s.body, name, url);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="w-full text-left bg-zinc-950/60 border border-zinc-800 hover:border-blue-600/50 rounded-xl px-3 py-2.5 transition-colors group/script"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide">{s.title}</p>
        <span className={`text-[10px] font-semibold ${copied ? "text-emerald-400" : "text-zinc-600 group-hover/script:text-blue-400"}`}>
          {copied ? "✓ Copied" : "tap to copy"}
        </span>
      </div>
      <p className="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap">{text}</p>
    </button>
  );
}

function CopyBtn({ value, label = "Copy link", icon = "🔗" }: { value: string; label?: string; icon?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
    >
      {copied ? "✓ Copied" : <>{icon} {label}</>}
    </button>
  );
}

// ─── Prominent link bar — the setter's grab-and-send affordance ───────────────
function LinkBar({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const pretty = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const valid = looksLikeUrl(url);
  return (
    <div className={`flex items-center gap-2 rounded-xl pl-3 pr-1.5 py-1.5 border ${valid ? "bg-zinc-950/60 border-zinc-800" : "bg-amber-950/30 border-amber-800/50"}`}>
      <span className="text-xs flex-shrink-0">{valid ? "🔗" : "⚠️"}</span>
      <span className={`text-xs truncate flex-1 font-mono ${valid ? "text-zinc-400" : "text-amber-300"}`}>{valid ? pretty : `${pretty} — not a valid link, edit to fix`}</span>
      <button
        onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${copied ? "bg-emerald-600/30 text-emerald-300" : "bg-blue-600/20 hover:bg-blue-600/40 text-blue-200 border border-blue-600/30"}`}
      >
        {copied ? "✓ Copied" : "Copy link"}
      </button>
      {valid && <a href={url} target="_blank" rel="noreferrer" title="Open" className="flex-shrink-0 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors">↗</a>}
    </div>
  );
}

// ─── Favorite star ────────────────────────────────────────────────────────────
function FavStar({ on, onToggle, className = "" }: { on: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      title={on ? "Remove from favorites" : "Add to favorites"}
      className={`text-sm leading-none px-1 transition-all ${on ? "opacity-100" : "opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-amber-300"} ${className}`}
    >
      {on ? "⭐" : "☆"}
    </button>
  );
}

// ─── Social / inbox / tool card ───────────────────────────────────────────────
function SocialCard({ r, onEdit, onDelete, onFav }: { r: Resource; onEdit: () => void; onDelete: () => void; onFav: () => void }) {
  return (
    <div className={`group bg-zinc-900 border rounded-2xl p-4 flex flex-col gap-3 transition-colors ${r.is_favorite ? "border-amber-500/40" : "border-zinc-800 hover:border-zinc-700"}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-xl flex-shrink-0">{platformEmoji(r)}</div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{r.title}</p>
            {r.about && <p className="text-zinc-500 text-xs truncate">{r.about}</p>}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <FavStar on={r.is_favorite} onToggle={onFav} />
          <button onClick={onEdit} className="text-zinc-600 hover:text-white text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity">✏️</button>
          <button onClick={onDelete} className="text-zinc-600 hover:text-rose-400 text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity">🗑</button>
        </div>
      </div>
      {r.url && (
        <div className="flex gap-2">
          <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 text-center px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-semibold transition-colors">Open ↗</a>
          <CopyBtn value={r.url} label="Copy" />
        </div>
      )}
    </div>
  );
}

// Download an image (even cross-origin) by fetching it as a blob
function DownloadImg({ url, filename }: { url: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          a.click();
          URL.revokeObjectURL(a.href);
        } catch {
          window.open(url, "_blank");
        } finally {
          setBusy(false);
        }
      }}
      className="w-full mt-2 px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
    >
      {busy ? "Downloading…" : "⬇ Download image"}
    </button>
  );
}

// ─── Asset card (lead magnet / funnel) ────────────────────────────────────────
function AssetCard({ r, name, onEdit, onDelete, onFav }: { r: Resource; name: string; onEdit: () => void; onDelete: () => void; onFav: () => void }) {
  const imgFile = `${r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "resource"}.png`;
  return (
    <div className={`group bg-zinc-900 border rounded-2xl overflow-hidden ${r.is_favorite ? "border-amber-500/40" : "border-zinc-800"}`}>
      <div className="flex gap-3 p-4">
        {r.image_url && (
          <div className="flex-shrink-0 w-20">
            <a href={r.image_url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.image_url} alt={r.title} className="w-20 h-20 rounded-xl object-cover border border-zinc-800" />
            </a>
            <DownloadImg url={r.image_url} filename={imgFile} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm">{r.title}</p>
              {r.subtitle && <p className="text-blue-300/80 text-xs mt-0.5">{r.subtitle}</p>}
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <FavStar on={r.is_favorite} onToggle={onFav} />
              <button onClick={onEdit} className="text-zinc-600 hover:text-white text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity">✏️</button>
              <button onClick={onDelete} className="text-zinc-600 hover:text-rose-400 text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity">🗑</button>
            </div>
          </div>
          {r.about && <p className="text-zinc-500 text-xs mt-1.5 leading-relaxed">{r.about}</p>}
          {r.url && <div className="mt-2.5"><LinkBar url={r.url} /></div>}
        </div>
      </div>
      {r.value_scripts && r.value_scripts.length > 0 && (
        <div className="px-4 pb-4 space-y-1.5">
          {r.value_scripts.map((s, i) => <ScriptBlock key={i} s={s} url={r.url} name={name} />)}
        </div>
      )}
    </div>
  );
}

// ─── Proof card (testimonial / case study) ────────────────────────────────────
function ProofCard({ r, name, onEdit, onDelete, onFav }: { r: Resource; name: string; onEdit: () => void; onDelete: () => void; onFav: () => void }) {
  const isCase = r.category === "case_study";
  const story = typeof r.metadata?.story === "string" ? (r.metadata.story as string) : null;
  const [showStory, setShowStory] = useState(false);
  return (
    <div className={`group bg-zinc-900 border rounded-2xl overflow-hidden ${r.is_favorite ? "border-amber-500/40" : "border-zinc-800"}`}>
      <div className="flex gap-3 p-4">
        {r.image_url ? (
          <a href={r.image_url} target="_blank" rel="noreferrer" className="flex-shrink-0 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image_url} alt={r.title} className="w-20 h-20 rounded-xl object-cover border border-zinc-800" />
            <span className="absolute bottom-1 right-1 text-[9px] bg-black/70 text-white px-1 rounded">open ↗</span>
          </a>
        ) : (
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-emerald-600/20 to-blue-600/20 border border-zinc-800 flex items-center justify-center text-2xl flex-shrink-0">
            {isCase ? "📈" : "⭐"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm leading-snug">{r.title}</p>
              {r.subtitle && <p className="text-emerald-400 text-xs font-semibold mt-0.5">{r.subtitle}</p>}
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <FavStar on={r.is_favorite} onToggle={onFav} />
              <button onClick={onEdit} className="text-zinc-600 hover:text-white text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity">✏️</button>
              <button onClick={onDelete} className="text-zinc-600 hover:text-rose-400 text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity">🗑</button>
            </div>
          </div>
          {r.about && <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed">{r.about}</p>}
          <div className="flex gap-2 mt-2 flex-wrap">
            {r.url && <CopyBtn value={r.url} label="Copy media link" icon="🖼️" />}
            {story && (
              <button onClick={() => setShowStory((v) => !v)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-medium transition-colors">
                {showStory ? "Hide story" : "Full story"}
              </button>
            )}
          </div>
          {showStory && story && <p className="text-zinc-400 text-xs mt-2 leading-relaxed whitespace-pre-wrap bg-zinc-950/50 rounded-lg p-2.5 border border-zinc-800">{story}</p>}
        </div>
      </div>
      {r.value_scripts && r.value_scripts.length > 0 && (
        <div className="px-4 pb-4 space-y-1.5">
          {r.value_scripts.map((s, i) => <ScriptBlock key={i} s={s} url={r.url} name={name} />)}
        </div>
      )}
    </div>
  );
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────
function ResourceModal({ initial, onSave, onClose }: {
  initial?: Resource | null;
  onSave: (r: Partial<Resource>, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<string>(initial?.category ?? "lead_magnet");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [about, setAbout] = useState(initial?.about ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [scripts, setScripts] = useState<ValueScript[]>(initial?.value_scripts ?? []);
  const [transcript, setTranscript] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const voice = useVoice((t) => setTranscript((p) => (p + " " + t).trim()));

  async function autoFill() {
    if (!transcript.trim() && !url.trim() && !imageUrl.trim()) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/resources/classify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, url, imageUrl }),
      });
      const j = await res.json();
      if (j.category) setCategory(j.category);
      if (j.title) setTitle(j.title);
      if (j.subtitle !== undefined) setSubtitle(j.subtitle ?? "");
      if (j.about) setAbout(j.about);
      if (Array.isArray(j.value_scripts)) setScripts(j.value_scripts);
    } finally { setAiBusy(false); }
  }

  async function generateScripts() {
    if (!title.trim()) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/resources/value-scripts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type: category, about, url }),
      });
      const j = await res.json() as { value_scripts?: ValueScript[] };
      if (j.value_scripts) setScripts(j.value_scripts);
    } finally { setAiBusy(false); }
  }

  async function handleFile(f: File) {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await fetch("/api/resources/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (j.url) setImageUrl(j.url);
    } finally { setUploading(false); }
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      title: title.trim(), category, type: LINK_CATS.includes(category) ? "community" : category,
      subtitle: subtitle.trim() || null, about: about.trim() || null,
      url: normalizeUrl(url) || null, image_url: imageUrl.trim() || null, value_scripts: scripts,
    }, initial?.id);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 sticky top-0 bg-zinc-900 z-10">
          <h3 className="text-white font-bold text-base">{initial ? "Edit resource" : "🎁 Add resource"}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Category */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Category</label>
            <div className="grid grid-cols-5 gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={`py-2 rounded-xl text-[10px] font-medium border transition-colors ${category === c.key ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}>
                  <div className="text-base leading-none mb-0.5">{c.emoji}</div>{c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick-add: link + image + voice */}
          <div className="bg-zinc-950/50 border border-zinc-800 rounded-2xl p-3.5 space-y-3">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">⚡ Quick add — drop it in, speak what it is</p>
            <div>
              <label className="text-zinc-400 text-xs block mb-1.5">🔗 Link <span className="text-zinc-600">— this is what the setter copies &amp; sends</span></label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => setUrl((u) => normalizeUrl(u))} placeholder="https://buy.stripe.com/…  ·  skool.com/…  ·  youtube.com/…"
                className={`w-full bg-zinc-800 border rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none ${url && !looksLikeUrl(url) ? "border-amber-600/60 focus:border-amber-500" : "border-zinc-700 focus:border-blue-500"}`} />
              {url && !looksLikeUrl(url) && <p className="text-amber-400 text-[11px] mt-1">that doesn&apos;t look like a link yet — paste the full URL (starts with https://)</p>}
              {url && looksLikeUrl(url) && <p className="text-emerald-400/80 text-[11px] mt-1">✓ ready to copy &amp; send</p>}
            </div>

            <div className="flex gap-2 items-center">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold transition-colors disabled:opacity-50">
                {uploading ? "Uploading…" : "🖼️ Upload image"}
              </button>
              {imageUrl && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="preview" className="w-9 h-9 rounded-lg object-cover border border-zinc-700" />
                  <button onClick={() => setImageUrl("")} className="text-zinc-500 hover:text-rose-400 text-xs">remove</button>
                </div>
              )}
            </div>

            <div className="relative">
              <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={2}
                placeholder="Speak or type: what is this, who's it for, what does it do for them?"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 pr-11 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
              {voice.supported && (
                <button onClick={voice.toggle} title="Speak"
                  className={`absolute right-2 top-2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${voice.listening ? "bg-rose-600 text-white animate-pulse" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}>
                  🎤
                </button>
              )}
            </div>

            <button onClick={() => void autoFill()} disabled={aiBusy || (!transcript.trim() && !url.trim() && !imageUrl.trim())}
              className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40">
              {aiBusy ? "✨ Thinking…" : "✨ Auto-fill with AI"}
            </button>
          </div>

          {/* Structured fields */}
          <div className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle / headline result (optional)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
            <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} placeholder="What is it / what it does for the prospect"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
          </div>

          {/* Scripts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-zinc-400">💬 Send scripts ({scripts.length})</p>
              <button onClick={() => void generateScripts()} disabled={aiBusy || !title.trim()}
                className="px-3 py-1.5 text-xs bg-white text-zinc-900 font-bold rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-40">
                {aiBusy ? "Writing…" : scripts.length ? "♻️ Regenerate" : "✨ Generate"}
              </button>
            </div>
            <div className="space-y-2">
              {scripts.map((s, i) => (
                <div key={i} className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <input value={s.title} onChange={(e) => setScripts((p) => p.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                      className="flex-1 bg-transparent text-[11px] font-semibold text-zinc-300 focus:outline-none" />
                    <button onClick={() => setScripts((p) => p.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-rose-400 text-xs">✕</button>
                  </div>
                  <textarea value={s.body} onChange={(e) => setScripts((p) => p.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} rows={3}
                    className="w-full bg-transparent text-sm text-zinc-200 focus:outline-none resize-none" />
                </div>
              ))}
              <button onClick={() => setScripts((p) => [...p, { title: "New script", body: "" }])}
                className="w-full py-2 border border-dashed border-zinc-700 rounded-xl text-zinc-500 text-xs hover:text-white hover:border-zinc-600 transition-colors">+ Add script manually</button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-3 border border-zinc-700 rounded-xl text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-colors">Cancel</button>
          <button onClick={() => void handleSave()} disabled={saving || !title.trim()}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl text-white text-sm font-bold transition-colors">
            {saving ? "Saving…" : initial ? "Save" : "Add resource"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"new" | Resource | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/resources");
    const json = await res.json() as { resources?: Resource[] };
    setResources(json.resources ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(r: Partial<Resource>, id?: string) {
    if (id) await fetch("/api/resources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...r }) });
    else await fetch("/api/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    setModal(null);
    await load();
  }
  async function remove(id: string) {
    if (!confirm("Remove this resource?")) return;
    setResources((p) => p.filter((x) => x.id !== id));
    await fetch("/api/resources", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }
  async function toggleFav(r: Resource) {
    const next = !r.is_favorite;
    setResources((p) => p.map((x) => (x.id === r.id ? { ...x, is_favorite: next } : x)));
    await fetch("/api/resources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, is_favorite: next }) });
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of resources) c[r.category ?? "lead_magnet"] = (c[r.category ?? "lead_magnet"] ?? 0) + 1;
    return c;
  }, [resources]);
  const favCount = resources.filter((r) => r.is_favorite).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources
      .filter((r) => tab === "all" || (tab === "fav" ? r.is_favorite : (r.category ?? "lead_magnet") === tab))
      .filter((r) => !q || [r.title, r.subtitle, r.about].some((f) => f?.toLowerCase().includes(q)))
      // favorites float to the top of every group
      .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.title.localeCompare(b.title));
  }, [resources, tab, search]);

  // Socials / Inbox / Tools render as compact click-and-open tiles, each in its own section
  const linkGroups = LINK_CATS
    .map((key) => ({ key, meta: CATEGORIES.find((c) => c.key === key)!, items: visible.filter((r) => (r.category ?? "") === key) }))
    .filter((g) => g.items.length > 0);
  const cardItems = visible.filter((r) => !LINK_CATS.includes(r.category ?? ""));

  function renderCard(r: Resource) {
    const props = { r, name, onEdit: () => setModal(r), onDelete: () => void remove(r.id), onFav: () => void toggleFav(r) };
    if (r.category === "testimonial" || r.category === "case_study") return <ProofCard key={r.id} {...props} />;
    return <AssetCard key={r.id} {...props} />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <SubTabs group="resources" />
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">🎁 Resources</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Everything the setter needs to send. Grab a link, a proof, or a ready-to-send script in one tap.</p>
        </div>
        <button onClick={() => setModal("new")} className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0">
          <span className="text-base leading-none">+</span> Add
        </button>
      </div>

      {/* Search + personalize */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search resources…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">✍️</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Personalize for…"
            className="w-[180px] bg-zinc-900 border border-zinc-800 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" title="Auto-fills {name} in every script you copy" />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setTab("all")}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${tab === "all" ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
          All <span className="text-zinc-600">{resources.length}</span>
        </button>
        <button onClick={() => setTab("fav")}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${tab === "fav" ? "bg-amber-500/20 border-amber-500/40 text-amber-200" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
          ⭐ Favorites <span className="text-zinc-600">{favCount}</span>
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.key} onClick={() => setTab(c.key)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${tab === c.key ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
            {c.emoji} {c.label} <span className="text-zinc-600">{counts[c.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-600 text-sm text-center py-16 animate-pulse">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-3xl py-16 text-center">
          <p className="text-4xl mb-3">{tab === "all" ? "🎁" : catMeta(tab).emoji}</p>
          <p className="text-zinc-300 font-medium">Nothing here yet</p>
          <p className="text-zinc-600 text-sm mt-1">Add a link or image and speak what it is.</p>
          <button onClick={() => setModal("new")} className="mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors">+ Add resource</button>
        </div>
      ) : (
        <div className="space-y-7">
          {/* Socials → Inbox → Tools: compact tiles you click straight into */}
          {linkGroups.map((g) => (
            <div key={g.key}>
              {(tab === "all" || tab === "fav") && (
                <div className="flex items-baseline gap-2 mb-2.5">
                  <h2 className="text-white font-semibold text-sm">{g.meta.emoji} {g.meta.label}</h2>
                  <span className="text-zinc-600 text-xs">{g.meta.blurb}</span>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((r) => (
                  <SocialCard key={r.id} r={r} onEdit={() => setModal(r)} onDelete={() => void remove(r.id)} onFav={() => void toggleFav(r)} />
                ))}
              </div>
            </div>
          ))}
          {/* Everything else as a two-column card grid */}
          {cardItems.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2 items-start">
              {cardItems.map(renderCard)}
            </div>
          )}
        </div>
      )}

      {modal && (
        <ResourceModal
          initial={modal === "new" ? null : modal}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
