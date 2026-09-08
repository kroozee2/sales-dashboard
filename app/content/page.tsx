"use client";

import { PostedTab } from "@/components/posted-table";
import { MarketingDashboard } from "@/components/marketing-dashboard";

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PLATFORMS, CATEGORIES, REEL_PILLARS, EVENT_TYPES, CONTENT_STATUSES,
  platformLabel, platformEmoji, platformChip, platformDot, categoryMeta, statusMeta,
  type Platform, type Category,
} from "@/lib/content-constants";
import GraphicsStudio from "@/components/graphics-studio";
import CompetitorResearch from "@/components/competitor-research";
import ContentSpreadsheet from "@/components/content-spreadsheet";
import { publishedSourcesOf } from "@/lib/content-published-sources";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContentItem {
  id: string; title: string; category: string; status: string;
  scheduled_date: string | null; platforms: string[]; drafts: Record<string, string>;
  posted_platforms: string[]; notes: string | null; meta: Record<string, unknown>;
  media_urls: string[]; creative_type: string | null; video_script: string | null;
  event_id: string | null; created_at: string; updated_at: string;
}
interface Idea {
  id: string; text: string | null; image_url: string | null; title: string | null;
  angle: string | null; category: string | null; platforms: string[]; take: string | null;
  screenshot_summary: string | null; created_at: string;
}
interface CEvent {
  id: string; title: string; event_type: string; start_date: string | null; end_date: string | null;
  price: number | null; spots_goal: number | null; signups: number; page_url: string | null;
  location: string | null; notes: string | null;
}

// Every view here is reached from the sidebar now, so this list only says which
// ?tab= values are real. Research, Graphics, Create, Stories and Remix were
// dropped at Andrew's request.
const TABS = [
  { key: "dashboard", label: "Dashboard", emoji: "📊" },
  { key: "calendar", label: "Calendar", emoji: "🗓️" },
  { key: "events", label: "Events", emoji: "🎟️" },
  { key: "posted", label: "Posted", emoji: "☑️" },
  { key: "ideas", label: "Ideas", emoji: "💡" },
  { key: "proof", label: "Proof", emoji: "🏆" },
] as const;
interface Posted {
  id: string; platform: string; profile_name: string | null; profile_url: string | null;
  post_url: string | null; text: string | null; posted_at: string | null;
  likes: number | null; comments: number | null; shares: number | null; reactions: number | null; views: number | null; media_type: string | null;
}
interface Proof {
  id: string; headline: string | null; proof_point: string | null; one_liner: string | null;
  story: string | null; image_url: string | null; source_url: string | null; video_url: string | null;
  person_name: string | null; proof_kind: string | null; created_at: string | null;
  generated_assets: { ring_the_bell?: { headline: string; body: string }; client_celebrations?: { label: string; body: string }[]; client_story?: { subject_line: string; body: string } } | null;
}
interface Story {
  id: string; image_url: string; platforms: string[]; posted_date: string; note: string | null; created_at: string;
}

// ─── Voice hook ───────────────────────────────────────────────────────────────
function useVoice(onText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  // Resolved after mount: checking `window` during render makes the server and
  // client disagree, and the resulting hydration mismatch throws away the whole
  // tree (which was silently resetting the open tab).
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(!!((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition));
  }, []);
  function toggle() {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => { continuous: boolean; interimResults: boolean; lang: string; onresult: (e: { resultIndex: number; results: { [i: number]: { isFinal: boolean; 0: { transcript: string } }; length: number } }) => void; onend: () => void; start: () => void; stop: () => void } }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = false; rec.lang = "en-US";
    rec.onresult = (e) => { let c = ""; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) c += e.results[i][0].transcript + " "; if (c) onText(c); };
    rec.onend = () => setListening(false);
    rec.start(); recRef.current = rec; setListening(true);
  }
  return { listening, toggle, supported };
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────
function Copyable({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [c, setC] = useState(false);
  return (
    <button onClick={() => { void navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1500); }}
      className={`px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold transition-colors ${className}`}>
      {c ? "✓ Copied" : `📋 ${label}`}
    </button>
  );
}
function PlatformPicker({ value, onChange }: { value: Platform[]; onChange: (v: Platform[]) => void }) {
  const toggle = (p: Platform) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {PLATFORMS.map((p) => (
        <button key={p.key} onClick={() => toggle(p.key)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${value.includes(p.key) ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}>
          {p.emoji} {p.label}
        </button>
      ))}
    </div>
  );
}
function CategoryPicker({ value, onChange }: { value: Category; onChange: (v: Category) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((c) => (
        <button key={c.key} onClick={() => onChange(c.key)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${value === c.key ? "bg-violet-600/20 border-violet-500/40 text-violet-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}>
          {c.emoji} {c.label}
        </button>
      ))}
    </div>
  );
}
function DraftCard({ platform, text, onChange }: { platform: string; text: string; onChange?: (t: string) => void }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/70">
        <span className="text-xs font-semibold text-zinc-300">{platformEmoji(platform)} {platformLabel(platform)}</span>
        <Copyable text={text} />
      </div>
      {onChange
        ? <textarea value={text} onChange={(e) => onChange(e.target.value)} rows={Math.min(16, Math.max(4, text.split("\n").length + 1))}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-200 leading-relaxed focus:outline-none resize-y" />
        : <p className="px-3 py-2.5 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{text}</p>}
    </div>
  );
}

// ─── CREATE tab ───────────────────────────────────────────────────────────────
function CreateTab({ events, onSaved }: { events: CEvent[]; onSaved: () => void }) {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<Category>("value");
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram"]);
  const [reelFormat, setReelFormat] = useState("auto");
  const [eventId, setEventId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const voice = useVoice((t) => setTopic((p) => (p + " " + t).trim()));

  async function clean() {
    if (!topic.trim()) return;
    setCleaning(true);
    try { const r = await (await fetch("/api/content/clean", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw: topic }) })).json(); if (r.cleaned) setTopic(r.cleaned); } finally { setCleaning(false); }
  }
  async function generate() {
    if (!topic.trim() || !platforms.length) return;
    setBusy(true); setDrafts(null); setSavedMsg(null);
    try {
      const r = await (await fetch("/api/content/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, category, platforms, reelFormat: platforms.includes("instagram") ? reelFormat : undefined, eventId: eventId || undefined }) })).json();
      if (r.drafts) setDrafts(r.drafts);
    } finally { setBusy(false); }
  }
  async function save(date: string | null) {
    if (!drafts) return;
    await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: topic.slice(0, 120), category, status: date ? "scheduled" : "drafted", platforms, drafts,
      scheduled_date: date, event_id: eventId || null, meta: { topic, reel_format: platforms.includes("instagram") ? reelFormat : undefined },
    }) });
    setSavedMsg(date ? "Saved to calendar 🗓️" : "Saved as draft ✍️");
    onSaved();
  }

  return (
    <div className="grid lg:grid-cols-2 gap-5 items-start">
      {/* Input */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">💭 Topic / brain-dump</label>
          <div className="relative">
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={4}
              placeholder="What's the idea? Speak it or type it. e.g. 'how i use claude to plan a whole month of content in 20 minutes'"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 pr-11 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
            {voice.supported && (
              <button onClick={voice.toggle} title="Speak"
                className={`absolute right-2 top-2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${voice.listening ? "bg-rose-600 text-white animate-pulse" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}>🎤</button>
            )}
          </div>
          {topic.trim() && <button onClick={() => void clean()} disabled={cleaning} className="mt-1.5 text-xs text-zinc-500 hover:text-white transition-colors">{cleaning ? "Cleaning…" : "✨ Clean up my dictation"}</button>}
        </div>
        <div>
          <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Angle</label>
          <CategoryPicker value={category} onChange={setCategory} />
        </div>
        <div>
          <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Make it for</label>
          <PlatformPicker value={platforms} onChange={setPlatforms} />
        </div>
        {platforms.includes("instagram") && (
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">🎬 Reel format</label>
            <select value={reelFormat} onChange={(e) => setReelFormat(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
              {REEL_PILLARS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
        )}
        {events.length > 0 && (
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Promoting an event? <span className="text-zinc-600 normal-case">(optional)</span></label>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
              <option value="">— None —</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
          </div>
        )}
        <button onClick={() => void generate()} disabled={busy || !topic.trim() || !platforms.length}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40">
          {busy ? "✨ Writing in your voice…" : `✨ Generate ${platforms.length} draft${platforms.length > 1 ? "s" : ""}`}
        </button>
      </div>

      {/* Output */}
      <div className="space-y-3">
        {busy && <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500 text-sm animate-pulse">Drafting {platforms.map(platformLabel).join(", ")}…</div>}
        {drafts && (
          <>
            {Object.entries(drafts).map(([p, t]) => (
              <DraftCard key={p} platform={p} text={t} onChange={(nt) => setDrafts((d) => ({ ...(d || {}), [p]: nt }))} />
            ))}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => void save(new Date().toISOString().split("T")[0])} className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors">🗓️ Save to calendar (today)</button>
              <button onClick={() => void save(null)} className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold transition-colors">✍️ Save as draft</button>
              {savedMsg && <span className="text-emerald-400 text-xs font-medium">{savedMsg}</span>}
            </div>
          </>
        )}
        {!busy && !drafts && (
          <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-2xl p-8 text-center text-zinc-600 text-sm">
            Your drafts show up here, one per platform, ready to copy and post.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Item drawer (calendar edit) ──────────────────────────────────────────────
function ItemDrawer({ item, events, proof, onClose, onPatch, onDelete }: {
  item: ContentItem; events: CEvent[]; proof: Proof[]; onClose: () => void;
  onPatch: (id: string, patch: Partial<ContentItem>) => Promise<ContentItem | null>; onDelete: (id: string) => void;
}) {
  const [local, setLocal] = useState<ContentItem>(item);
  const publishedSources = publishedSourcesOf(local.meta);
  const [busy, setBusy] = useState(false);
  const [showDrafts, setShowDrafts] = useState(() => Object.keys(item.drafts || {}).length > 0);
  const m0 = (item.meta || {}) as Record<string, string>;
  const [fields, setFields] = useState({ headline: m0.headline ?? "", hook: m0.hook ?? "", details: m0.details ?? "", cta: m0.cta ?? "", subject: m0.subject ?? "", campaign: m0.campaign ?? "" });
  const [ghl, setGhl] = useState<{ pushing: boolean; error?: string; urls?: { template: string; campaigns: string; templates: string } }>({ pushing: false });
  useEffect(() => {
    setLocal(item);
    const m = (item.meta || {}) as Record<string, string>;
    setFields({ headline: m.headline ?? "", hook: m.hook ?? "", details: m.details ?? "", cta: m.cta ?? "", subject: m.subject ?? "", campaign: m.campaign ?? "" });
    setShowDrafts(Object.keys(item.drafts || {}).length > 0);
    setGhl({ pushing: false });
  }, [item]);

  async function patch(p: Partial<ContentItem>) { setLocal((x) => ({ ...x, ...p })); const u = await onPatch(item.id, p); if (u) setLocal(u); }
  // Save the simple write-it fields into meta (merged, all at once so one blur persists everything)
  const setField = (k: "headline" | "hook" | "details" | "cta" | "subject" | "campaign", v: string) => setFields((f) => ({ ...f, [k]: v }));
  function saveFields() { void patch({ meta: { ...(local.meta || {}), ...fields } }); }
  async function genDrafts() {
    setBusy(true);
    try { const r = await (await fetch("/api/content/draft-item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) })).json(); if (r.item) setLocal(r.item); } finally { setBusy(false); }
  }
  // Push this email straight into GoHighLevel as a ready-to-send template, then open GHL to schedule/send.
  async function pushToGhl() {
    // make sure the latest subject/body is saved before we push
    await patch({ meta: { ...(local.meta || {}), ...fields } });
    setGhl({ pushing: true });
    try {
      const r = await (await fetch("/api/content/ghl-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) })).json();
      if (r.error) { setGhl({ pushing: false, error: r.error }); return; }
      setGhl({ pushing: false, urls: r.urls });
      if (r.urls?.campaigns) window.open(r.urls.campaigns, "_blank", "noopener");
    } catch (e) {
      setGhl({ pushing: false, error: e instanceof Error ? e.message : "push failed" });
    }
  }
  const togglePlatform = (p: string) => {
    const next = local.platforms.includes(p) ? local.platforms.filter((x) => x !== p) : [...local.platforms, p];
    void patch({ platforms: next });
  };
  // Photos — upload from phone/laptop, attach to this content so you can post it elsewhere.
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaMsg, setMediaMsg] = useState<string | null>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  async function addMedia(files: FileList) {
    setUploadingMedia(true); setMediaMsg(null);
    const urls: string[] = [];
    let failed = false;
    for (const f of Array.from(files)) {
      try {
        const fd = new FormData(); fd.append("file", f);
        const r = await (await fetch("/api/content/upload", { method: "POST", body: fd })).json();
        if (r.url) urls.push(r.url); else failed = true;
      } catch { failed = true; }
    }
    if (urls.length) { await patch({ media_urls: [...(local.media_urls ?? []), ...urls] }); setMediaMsg(`Saved ${urls.length} ✓`); setTimeout(() => setMediaMsg(null), 2500); }
    else if (failed) setMediaMsg("Upload failed. Try again.");
    setUploadingMedia(false);
  }
  const removeMedia = (url: string) => void patch({ media_urls: (local.media_urls ?? []).filter((u) => u !== url) });

  // Pull a piece of proof from the bank straight into this content.
  const [proofOpen, setProofOpen] = useState(false);
  const [proofQuery, setProofQuery] = useState("");
  const pq = proofQuery.trim().toLowerCase();
  const proofMatches = proof.filter((p) => !pq || [p.headline, p.proof_point, p.one_liner, p.story].some((f) => (f ?? "").toLowerCase().includes(pq)));
  async function useProof(p: Proof) {
    const patchObj: Partial<ContentItem> = {};
    if (p.image_url && !(local.media_urls ?? []).includes(p.image_url)) patchObj.media_urls = [...(local.media_urls ?? []), p.image_url];
    // Seed the copy from the proof if the copy box is still empty.
    const curCopy = (local.meta as Record<string, string> | undefined)?.details ?? "";
    const seed = p.one_liner || p.story || p.proof_point || "";
    if (!curCopy.trim() && seed) { setFields((f) => ({ ...f, details: seed })); patchObj.meta = { ...(local.meta || {}), details: seed }; }
    if (Object.keys(patchObj).length) await patch(patchObj);
    setProofOpen(false); setProofQuery("");
  }

  return (
    <div className="fixed inset-0 z-[60] flex" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />
      <div className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-zinc-800">
          <div className="flex-1">
            <label className="text-zinc-500 text-[11px] block mb-1">✏️ Name</label>
            <input value={local.title} onChange={(e) => setLocal({ ...local, title: e.target.value })} onBlur={() => void patch({ title: local.title })}
              placeholder="Name this content…"
              className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 focus:border-blue-500 rounded-lg px-3 py-2 text-white font-bold text-base placeholder-zinc-600 focus:outline-none transition-colors" />
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white flex-shrink-0"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        {/* Creative type — video / picture / gif — and the video script when it's a video */}
        <div className="px-5 py-4 space-y-3 border-b border-zinc-800">
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1.5">🎨 Creative type</label>
            <div className="flex gap-2">
              {[{ k: "video", label: "🎬 Video" }, { k: "picture", label: "🖼️ Picture" }, { k: "gif", label: "🎞️ GIF" }].map((o) => (
                <button key={o.k} onClick={() => void patch({ creative_type: local.creative_type === o.k ? null : o.k })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${local.creative_type === o.k ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {local.creative_type === "video" && (
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">🎥 Video script</label>
              <textarea
                value={local.video_script ?? ""}
                onChange={(e) => setLocal({ ...local, video_script: e.target.value })}
                onBlur={() => void patch({ video_script: local.video_script })}
                rows={6}
                placeholder="Hook on camera, then the script beats… (Say / Show)"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y"
              />
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-3 border-b border-zinc-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">Angle</label>
              <select value={local.category} onChange={(e) => void patch({ category: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">Status</label>
              <select value={local.status} onChange={(e) => void patch({ status: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
                {CONTENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1">Scheduled date</label>
            <input type="date" value={local.scheduled_date ?? ""} onChange={(e) => void patch({ scheduled_date: e.target.value || null })} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1.5">Platforms</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button key={p.key} onClick={() => togglePlatform(p.key)} className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${local.platforms.includes(p.key) ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-white"}`}>{p.emoji} {p.label}</button>
              ))}
            </div>
          </div>
          {events.length > 0 && (
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">Event</label>
              <select value={local.event_id ?? ""} onChange={(e) => void patch({ event_id: e.target.value || null })} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
                <option value="">— None —</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            </div>
          )}
        </div>

        {publishedSources.length > 0 && (
          <div className="px-5 py-4 space-y-2 border-b border-zinc-800">
            <p className="text-zinc-400 text-xs uppercase tracking-wide">🔗 Published links</p>
            {publishedSources.map((source) => (
              <a
                key={`${source.platform}:${source.external_id}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-700"
              >
                <span className="text-zinc-200">{platformEmoji(source.platform)} {platformLabel(source.platform)}</span>
                <span className="text-blue-400">Open →</span>
              </a>
            ))}
          </div>
        )}

        {/* Write it — the simple manual fields (headline, hook, details, CTA) */}
        <div className="px-5 py-4 space-y-3 flex-1">
          <p className="text-zinc-400 text-xs uppercase tracking-wide">✍️ Write it</p>
          {local.platforms.includes("email") && (
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">✉️ Subject line</label>
              <input value={fields.subject} onChange={(e) => setField("subject", e.target.value)} onBlur={saveFields}
                placeholder="the subject that gets it opened" className="w-full bg-zinc-900 border border-sky-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500" />
            </div>
          )}
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1">{local.platforms.includes("email") ? "✉️ Email body" : "Copy"}</label>
            <textarea value={fields.details} onChange={(e) => setField("details", e.target.value)} onBlur={saveFields} rows={local.platforms.includes("email") ? 12 : 10}
              placeholder={local.platforms.includes("email") ? "Write the email. Line breaks become paragraphs in GoHighLevel." : "Write the post copy here…"} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
          </div>

          {/* ── Email → GoHighLevel ── one-click push to a ready-to-send GHL email ── */}
          {local.platforms.includes("email") && (
            <div className="rounded-xl border border-sky-600/40 bg-sky-500/[0.05] p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-sky-200">✉️ Send with GoHighLevel</span>
                {(local.meta as Record<string, string>)?.ghl_template_id && <span className="text-[10px] text-emerald-400 font-medium">● linked</span>}
              </div>
              <div>
                <label className="text-zinc-500 text-[11px] block mb-1">Campaign (optional)</label>
                <input value={fields.campaign} onChange={(e) => setField("campaign", e.target.value)} onBlur={saveFields}
                  placeholder="e.g. Miami Event Promo" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => void pushToGhl()} disabled={ghl.pushing}
                  className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors disabled:opacity-40 flex items-center gap-1.5">
                  {ghl.pushing ? "Pushing…" : (local.meta as Record<string, string>)?.ghl_template_id ? "♻️ Re-push to GoHighLevel" : "⚡ Push to GoHighLevel"}
                </button>
                <button onClick={() => { void navigator.clipboard?.writeText(fields.subject); }}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors">📋 Copy subject</button>
              </div>
              {ghl.error && <p className="text-rose-400 text-[11px]">{ghl.error}</p>}
              {ghl.urls && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
                  <span className="text-emerald-400 text-[11px] font-medium">✓ Pushed. Opened Campaigns →</span>
                  <a href={ghl.urls.campaigns} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200 text-[11px] underline">New campaign</a>
                  <a href={ghl.urls.templates} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200 text-[11px] underline">See template</a>
                </div>
              )}
              <p className="text-zinc-500 text-[10px] leading-relaxed">Creates a ready-to-send email template in GoHighLevel (subject as the title, the body above as the content), then opens Campaigns so you pick it and schedule/send.</p>
            </div>
          )}

          {/* AI drafts — optional, tucked below */}
          <div className="pt-2 border-t border-zinc-800/70">
            {!showDrafts && Object.keys(local.drafts || {}).length === 0 ? (
              <button onClick={() => setShowDrafts(true)} className="text-xs text-zinc-500 hover:text-white transition-colors">✨ Want AI to draft this for each platform? →</button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-500 text-[11px] uppercase tracking-wide">AI drafts (optional)</p>
                  <button onClick={() => void genDrafts()} disabled={busy || !local.platforms.length}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors disabled:opacity-40">
                    {busy ? "Writing…" : Object.keys(local.drafts || {}).length ? "♻️ Regenerate" : "✨ Generate drafts"}
                  </button>
                </div>
                {!local.platforms.length && <p className="text-zinc-600 text-[11px]">Pick a platform above first.</p>}
                {Object.entries(local.drafts || {}).map(([p, t]) => <DraftCard key={p} platform={p} text={t as string} />)}
              </div>
            )}
          </div>
        </div>

        {/* Pull from proof bank — find a piece of proof and drop it into this content. */}
        <div className="px-5 py-4 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <label className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">🏆 Proof</label>
            <button onClick={() => setProofOpen((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold">{proofOpen ? "Close" : "＋ Add from proof bank"}</button>
          </div>
          {proofOpen && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
                <input value={proofQuery} onChange={(e) => setProofQuery(e.target.value)} autoFocus placeholder="Search your proof…"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {proofMatches.length === 0 ? <p className="text-zinc-600 text-xs py-3 text-center">No proof matches.</p> : proofMatches.slice(0, 30).map((p) => (
                  <button key={p.id} onClick={() => void useProof(p)} className="w-full flex items-center gap-2.5 text-left bg-zinc-950/60 hover:bg-zinc-800 border border-zinc-800 rounded-lg p-2 transition-colors">
                    <ProofThumb p={p} className="w-10 h-10" />
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-xs font-semibold truncate">{proofName(p)}</p>
                      {p.proof_point && <p className="text-emerald-400 text-[11px] truncate">{p.proof_point}</p>}
                    </div>
                    <span className="text-blue-400 text-[11px] flex-shrink-0">Use →</span>
                  </button>
                ))}
              </div>
              <p className="text-zinc-600 text-[10px]">Adds the proof&apos;s photo/video to this post{!((local.meta as Record<string, string> | undefined)?.details ?? "").trim() && " and seeds the copy"}.</p>
            </div>
          )}
        </div>

        {/* Photos — at the bottom. Add from phone or laptop, then download to post anywhere. */}
        <div className="px-5 py-4 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <label className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">📎 Photos</label>
            <div className="flex items-center gap-2">
              {mediaMsg && <span className="text-[11px] text-emerald-400">{mediaMsg}</span>}
              <input ref={mediaRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = e.target.files; e.target.value = ""; if (fs && fs.length) void addMedia(fs); }} />
              <button onClick={() => mediaRef.current?.click()} disabled={uploadingMedia} className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold disabled:opacity-50">{uploadingMedia ? "Uploading…" : "＋ Add photo"}</button>
            </div>
          </div>
          {(local.media_urls ?? []).length === 0 ? (
            <p className="text-zinc-600 text-xs">Add a testimonial screenshot or any photo from your phone or laptop, then download it to post on another platform.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {(local.media_urls ?? []).map((url, i) => (
                <div key={i} className="group relative rounded-xl overflow-hidden border border-zinc-800 bg-black">
                  <a href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-24 object-cover" />
                  </a>
                  <div className="absolute top-1 right-1 flex gap-1">
                    <a href={url} download target="_blank" rel="noreferrer" className="bg-black/70 hover:bg-black rounded-md w-6 h-6 flex items-center justify-center text-white text-xs" title="Download / open to save">⬇</a>
                    <button onClick={() => removeMedia(url)} className="bg-black/70 hover:bg-black rounded-md w-6 h-6 flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800">
          <button onClick={() => onDelete(item.id)} className="text-zinc-600 hover:text-rose-400 text-xs transition-colors">🗑 Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Quick add — the simplest way to drop in a new piece ──────────────────────
function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  const voice = useVoice((t) => setTitle((p) => (p + " " + t).trim()));
  function submit() { if (title.trim()) { onAdd(title.trim()); setTitle(""); } }
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">✍️</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="What do you want to make? Type or speak it, hit enter…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-11 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
        {voice.supported && <button onClick={voice.toggle} className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center ${voice.listening ? "bg-rose-600 text-white animate-pulse" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>🎤</button>}
      </div>
      <button onClick={submit} disabled={!title.trim()} className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors disabled:opacity-40 flex-shrink-0">+ Add</button>
    </div>
  );
}

// ─── CALENDAR tab ─────────────────────────────────────────────────────────────
function CalendarTab({ items, events, onOpen, onQuickAdd, onCreateOn, onReschedule }: { items: ContentItem[]; events: CEvent[]; onOpen: (i: ContentItem) => void; onQuickAdd: (title: string) => void; onCreateOn: (dateStr: string) => void; onReschedule: (id: string, dateStr: string) => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [platFilter, setPlatFilter] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const year = month.getFullYear(), mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  // Filter by the selected platform (if any).
  const shown = platFilter ? items.filter((i) => i.platforms.includes(platFilter)) : items;
  const byDay: Record<number, ContentItem[]> = {};
  for (const it of shown) { if (!it.scheduled_date) continue; const d = new Date(it.scheduled_date + "T12:00"); if (d.getFullYear() === year && d.getMonth() === mon) (byDay[d.getDate()] ??= []).push(it); }
  const unscheduled = shown.filter((i) => !i.scheduled_date);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const today = new Date();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-4">
      <QuickAdd onAdd={onQuickAdd} />

      {/* Platform filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button onClick={() => setPlatFilter(null)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${platFilter === null ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>All</button>
        {PLATFORMS.map((p) => {
          const count = items.filter((i) => i.platforms.includes(p.key)).length;
          return (
            <button key={p.key} onClick={() => setPlatFilter(platFilter === p.key ? null : p.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap ${platFilter === p.key ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
              {p.emoji} {p.label}{count > 0 && <span className={`ml-1 ${platFilter === p.key ? "text-blue-100" : "text-zinc-600"}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setMonth(new Date(year, mon - 1, 1))} className="w-8 h-8 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center">‹</button>
            <span className="text-base font-bold text-white min-w-[150px] text-center">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
            <button onClick={() => setMonth(new Date(year, mon + 1, 1))} className="w-8 h-8 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center">›</button>
            <button onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))} className="ml-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Today</button>
          </div>
          <span className="text-xs text-zinc-500">{items.filter((i) => i.scheduled_date && new Date(i.scheduled_date + "T12:00").getMonth() === mon).length} scheduled</span>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">{weekdays.map((d) => <div key={d} className="text-center text-[11px] text-zinc-600 font-semibold uppercase py-1">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} className="min-h-[92px] rounded-xl bg-zinc-950/40" />;
            const dayItems = byDay[day] ?? [];
            const isToday = today.getFullYear() === year && today.getMonth() === mon && today.getDate() === day;
            const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isDropTarget = dragOverDay === dateStr;
            return (
              <div key={day} onClick={() => onCreateOn(dateStr)} title="Click to add content, or drop a post here to reschedule"
                onDragOver={(e) => { if (dragId) { e.preventDefault(); if (dragOverDay !== dateStr) setDragOverDay(dateStr); } }}
                onDragLeave={() => { if (dragOverDay === dateStr) setDragOverDay(null); }}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragId; if (id) onReschedule(id, dateStr); setDragId(null); setDragOverDay(null); }}
                className={`group/day relative min-h-[92px] rounded-xl p-1.5 border transition-colors ${isDropTarget ? "border-blue-500 bg-blue-600/20 ring-1 ring-blue-500" : isToday ? "border-violet-500/40 bg-violet-600/[0.07] cursor-pointer" : "border-transparent hover:bg-zinc-800/40 hover:border-zinc-700 cursor-pointer"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-zinc-500">{isToday ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-600 text-white">{day}</span> : day}</span>
                  <span className="text-zinc-600 text-sm leading-none opacity-0 group-hover/day:opacity-100 transition-opacity">＋</span>
                </div>
                <div className="space-y-1">
                  {dayItems.slice(0, 3).map((it) => {
                    const st = statusMeta(it.status);
                    const meta = (it.meta || {}) as Record<string, string>;
                    const isEmail = it.platforms.includes("email");
                    const ghlLinked = isEmail && !!meta.ghl_template_id;
                    const tip = `${it.platforms.map(platformLabel).join(", ") || "No platform"} · ${it.title}${isEmail && meta.subject ? `\nSubject: ${meta.subject}` : ""}${ghlLinked ? "\n✓ In GoHighLevel" : ""}`;
                    return (
                      <button key={it.id} onClick={(e) => { e.stopPropagation(); onOpen(it); }} title={tip}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("text/plain", it.id); e.dataTransfer.effectAllowed = "move"; setDragId(it.id); }}
                        onDragEnd={() => { setDragId(null); setDragOverDay(null); }}
                        className={`w-full flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] text-left transition-all hover:brightness-125 cursor-grab active:cursor-grabbing ${dragId === it.id ? "opacity-40" : ""} ${platformChip(it.platforms[0] ?? "")}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                        <span className="flex-shrink-0">{platformEmoji(it.platforms[0] ?? "")}</span>
                        <span className="truncate">{isEmail && meta.subject ? meta.subject : it.title}</span>
                        {ghlLinked && <span className="flex-shrink-0 text-emerald-400 text-[9px]" title="In GoHighLevel">⚡</span>}
                      </button>
                    );
                  })}
                  {dayItems.length > 3 && <p className="text-[10px] text-zinc-600 pl-1">+{dayItems.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wide font-semibold mr-0.5">Platform</span>
            {PLATFORMS.map((p) => <span key={p.key} className="flex items-center gap-1.5 text-[11px] text-zinc-500"><span className={`w-2 h-2 rounded-full ${platformDot(p.key)}`} />{p.emoji} {p.label}</span>)}
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wide font-semibold mr-0.5">Status</span>
            {CONTENT_STATUSES.map((s) => <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-zinc-500"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}</span>)}
          </div>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-white font-semibold text-sm mb-2.5">📥 Unscheduled ({unscheduled.length})</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {unscheduled.map((it) => {
              const st = statusMeta(it.status);
              return (
                <button key={it.id} onClick={() => onOpen(it)} className="flex items-center gap-2 bg-zinc-950/50 border border-zinc-800 hover:border-zinc-700 rounded-xl px-3 py-2 text-left transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                  <span className="text-sm">{it.platforms.map(platformEmoji).join("")}</span>
                  <span className="text-sm text-zinc-200 truncate flex-1">{it.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IDEAS tab ────────────────────────────────────────────────────────────────
function IdeasTab({ ideas, onChanged }: { ideas: Idea[]; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const voice = useVoice((t) => setText((p) => (p + " " + t).trim()));

  async function capture() {
    if (!text.trim() && !imageUrl) return;
    setBusy(true);
    try { await fetch("/api/content/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, image_url: imageUrl || undefined }) }); setText(""); setImageUrl(""); onChanged(); } finally { setBusy(false); }
  }
  async function upload(f: File) { setUploading(true); try { const fd = new FormData(); fd.append("file", f); const r = await (await fetch("/api/content/upload", { method: "POST", body: fd })).json(); if (r.url) setImageUrl(r.url); } finally { setUploading(false); } }
  async function convert(id: string) { setConverting(id); try { await fetch("/api/content/ideas/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); onChanged(); } finally { setConverting(null); } }
  async function del(id: string) { await fetch("/api/content/ideas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); onChanged(); }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <p className="text-white font-semibold text-sm">💡 Capture an idea</p>
        <div className="relative">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="A thought, a hook, a post you saw... dump it here. AI files it so you can turn it into content later."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 pr-11 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
          {voice.supported && <button onClick={voice.toggle} className={`absolute right-2 top-2 w-8 h-8 rounded-lg flex items-center justify-center ${voice.listening ? "bg-rose-600 text-white animate-pulse" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}>🎤</button>}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold disabled:opacity-50">{uploading ? "Uploading…" : "🖼️ Screenshot"}</button>
          {imageUrl && <><span className="text-emerald-400 text-xs">✓ attached</span><button onClick={() => setImageUrl("")} className="text-zinc-500 hover:text-rose-400 text-xs">remove</button></>}
          <button onClick={() => void capture()} disabled={busy || (!text.trim() && !imageUrl)} className="ml-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-40">{busy ? "Filing…" : "💡 Capture"}</button>
        </div>
      </div>

      {ideas.length === 0 ? <p className="text-zinc-600 text-sm text-center py-8">No ideas banked yet.</p> : (
        <div className="grid sm:grid-cols-2 gap-3">
          {ideas.map((idea) => {
            const cm = categoryMeta(idea.category ?? "value");
            return (
              <div key={idea.id} className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">{cm.emoji} {cm.label}</span>
                    <p className="text-white font-semibold text-sm truncate">{idea.title ?? "Idea"}</p>
                  </div>
                  <button onClick={() => void del(idea.id)} className="text-zinc-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">🗑</button>
                </div>
                {idea.take && <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed line-clamp-3">{idea.take}</p>}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {idea.platforms.map((p) => <span key={p} className="text-xs">{platformEmoji(p)}</span>)}
                  <button onClick={() => void convert(idea.id)} disabled={converting === idea.id} className="ml-auto px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold disabled:opacity-40 transition-colors">
                    {converting === idea.id ? "Drafting…" : "→ Make it"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── REMIX tab ────────────────────────────────────────────────────────────────
function RemixTab({ onSaved }: { onSaved: () => void }) {
  const [source, setSource] = useState("");
  const [guidance, setGuidance] = useState("");
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const voice = useVoice((t) => setGuidance((g) => (g ? g.trimEnd() + " " : "") + t.trim()));

  async function remix() {
    if (!source.trim()) return;
    setBusy(true); setOut(""); setSaved(false);
    try { const r = await (await fetch("/api/content/remix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, platform, angle: guidance || undefined }) })).json(); if (r.text) setOut(r.text); } finally { setBusy(false); }
  }
  async function save() {
    await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: (out.split("\n").find((l) => l.trim()) || "Remix").slice(0, 100), category: "value", status: "drafted", platforms: [platform], drafts: { [platform]: out }, meta: { remixed: true, details: out } }) });
    setSaved(true); onSaved();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-white font-bold text-lg">🔁 Content Remix</h2>
        <p className="text-zinc-500 text-sm mt-0.5 leading-relaxed">Paste any post that works — one of yours, one of Andrew&apos;s, or anything that stopped your scroll. Tell it how to make it yours. Get it rebuilt in your voice, matching the original&apos;s structure and rhythm.</p>
      </div>

      {/* 1 — paste the original */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
        <p className="text-white font-semibold text-sm">1. Paste the post to model</p>
        <textarea value={source} onChange={(e) => setSource(e.target.value)} rows={7} placeholder="Paste the post copy you want to model here…" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
      </div>

      {/* 2 — make it your own (guidance + voice) */}
      <div className="bg-zinc-900 border border-blue-500/30 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-white font-semibold text-sm">2. Make it your own</p>
          {voice.supported && (
            <button onClick={voice.toggle} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${voice.listening ? "bg-rose-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}>
              {voice.listening ? <><span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Listening…</> : "🎙️ Speak"}
            </button>
          )}
        </div>
        <p className="text-zinc-500 text-xs">How do you want to make it yours? Your angle, the result to feature, the CTA. Talk it through or type it.</p>
        <textarea value={guidance} onChange={(e) => setGuidance(e.target.value)} rows={4} placeholder="e.g. Make it about my $47 paid trial, use Kalah's win, end with 'comment TRIAL'…" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
        <div className="flex items-center gap-2">
          <label className="text-zinc-500 text-xs">Platform</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
            {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
          </select>
        </div>
        <button onClick={() => void remix()} disabled={busy || !source.trim()} className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-sm font-bold rounded-xl disabled:opacity-40">{busy ? "Remixing in your voice…" : out ? "↻ Remix again" : "✨ Remix it"}</button>
      </div>

      {/* 3 — your remix */}
      {out && (
        <div className="bg-zinc-900 border border-blue-500/30 rounded-2xl p-4 space-y-2">
          <p className="text-white font-semibold text-sm">3. Your remix <span className="text-zinc-500 font-normal">— edit anything, then save</span></p>
          <textarea value={out} onChange={(e) => setOut(e.target.value)} rows={12} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-y whitespace-pre-wrap" />
          <div className="flex items-center gap-2">
            <button onClick={() => { void navigator.clipboard?.writeText(out); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold">{copied ? "✓ Copied" : "📋 Copy"}</button>
            <button onClick={() => void save()} className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">✍️ Save as draft</button>
            {saved && <span className="text-emerald-400 text-xs">Saved ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROOF tab (proof bank + generator) ───────────────────────────────────────
const isVideoUrl = (url?: string | null) => !!url && /\.(mp4|mov|m4v|webm|quicktime|avi|mkv)(\?|#|$)/i.test(url);
// A proof is a video (has a posted video/reel link or a video file), a picture, or "spoken".
function proofKind(p: Proof): "video" | "picture" | "spoken" {
  if (p.video_url || isVideoUrl(p.image_url)) return "video";
  if (p.image_url) return "picture";
  return "spoken";
}
// Where a video was posted — labels the link (YouTube / Instagram / Loom / Video).
function videoHost(url?: string | null): string {
  if (!url) return "Video";
  if (/youtu\.?be|youtube\.com/i.test(url)) return "YouTube";
  if (/instagram\.com/i.test(url)) return "Instagram";
  if (/loom\.com/i.test(url)) return "Loom";
  if (/tiktok\.com/i.test(url)) return "TikTok";
  if (/vimeo\.com/i.test(url)) return "Vimeo";
  return "Video";
}
const proofName = (p: Proof) => (p.headline || p.proof_point || "Proof").replace(/^🔔\s*Ring the Bell\s*-\s*/i, "");
function proofPosts(p: Proof): { label: string; body: string }[] {
  const a = p.generated_assets; const posts: { label: string; body: string }[] = [];
  if (a?.ring_the_bell) posts.push({ label: "🔔 " + (a.ring_the_bell.headline || "Ring the Bell"), body: a.ring_the_bell.body });
  (a?.client_celebrations ?? []).forEach((c) => posts.push({ label: c.label, body: c.body }));
  if (a?.client_story) posts.push({ label: "✉️ " + a.client_story.subject_line, body: a.client_story.body });
  return posts;
}
// Small square thumbnail used in the card + drawer + calendar picker.
function ProofThumb({ p, className = "w-16 h-16" }: { p: Proof; className?: string }) {
  const isVideo = proofKind(p) === "video";
  const play = <span className="absolute inset-0 flex items-center justify-center text-white text-lg pointer-events-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">▶️</span>;
  if (isVideoUrl(p.image_url)) return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <video src={p.image_url!} muted playsInline preload="metadata" className={`${className} rounded-xl object-cover border border-zinc-800 bg-black`} />
      {play}
    </div>
  );
  if (p.image_url) return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.image_url} alt="" className={`${className} rounded-xl object-cover border border-zinc-800`} />
      {isVideo && play}
    </div>
  );
  if (isVideo) return <div className={`${className} rounded-xl bg-black border border-zinc-800 flex items-center justify-center text-xl flex-shrink-0`}>🎬</div>;
  return <div className={`${className} rounded-xl bg-gradient-to-br from-emerald-600/20 to-blue-600/20 border border-zinc-800 flex items-center justify-center text-2xl flex-shrink-0`}>🏆</div>;
}

function ProofDrawer({ p, onClose, onChanged, onDelete }: { p: Proof; onClose: () => void; onChanged: () => void; onDelete: () => void }) {
  const [local, setLocal] = useState<Proof>(p);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setLocal(p); }, [p]);

  async function patch(fields: Partial<Proof>) {
    setLocal((x) => ({ ...x, ...fields }));
    const r = await (await fetch("/api/content/proof", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, ...fields }) })).json();
    if (r.item) setLocal(r.item);
    onChanged();
  }
  async function replaceMedia(f: File) {
    setUploading(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await (await fetch("/api/content/upload", { method: "POST", body: fd })).json();
      if (r.url) { await patch({ image_url: r.url }); setMsg("Media updated ✓"); } else setMsg(r.error || "Upload failed");
    } finally { setUploading(false); }
  }
  async function regenerate() {
    setBusy(true); setMsg(null);
    try {
      const r = await (await fetch("/api/content/proof", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, regenerate: true }) })).json();
      if (r.item) { setLocal(r.item); setMsg("Rewrote the posts ✓"); onChanged(); } else setMsg(r.error || "Could not regenerate");
    } finally { setBusy(false); }
  }
  const posts = proofPosts(local);

  return (
    <div className="fixed inset-0 z-[60] flex" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />
      <div className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-zinc-800">
          <div className="flex-1">
            <label className="text-zinc-500 text-[11px] block mb-1">🏆 Name</label>
            <input value={local.headline ?? ""} onChange={(e) => setLocal({ ...local, headline: e.target.value })} onBlur={() => void patch({ headline: local.headline })}
              placeholder="Name this proof…" className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 focus:border-blue-500 rounded-lg px-3 py-2 text-white font-bold text-base placeholder-zinc-600 focus:outline-none transition-colors" />
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white flex-shrink-0"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        {/* Media — the picture or the video */}
        <div className="px-5 py-4 border-b border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">🎬 Media</label>
            <div className="flex items-center gap-2">
              {msg && <span className="text-[11px] text-emerald-400">{msg}</span>}
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void replaceMedia(f); }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold disabled:opacity-50">{uploading ? "Uploading…" : local.image_url ? "Replace" : "＋ Add photo / video"}</button>
              {local.image_url && <button onClick={() => void patch({ image_url: null })} className="text-xs text-zinc-500 hover:text-rose-400">remove</button>}
            </div>
          </div>
          <div className="flex justify-center">
            {local.image_url ? (
              isVideoUrl(local.image_url)
                ? <video src={local.image_url} controls playsInline preload="metadata" className="max-h-56 rounded-xl border border-zinc-800 bg-black" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={local.image_url} alt="" className="max-h-56 rounded-xl border border-zinc-800 object-contain" />
            ) : <div className="w-full h-24 rounded-xl border border-dashed border-zinc-800 flex items-center justify-center text-zinc-600 text-xs">🎙️ Spoken proof — no media attached</div>}
          </div>
        </div>

        {/* Posted at — the YouTube / Instagram reel / Loom link where this proof lives */}
        <div className="px-5 py-4 border-b border-zinc-800 space-y-1.5">
          <label className="text-zinc-500 text-[11px] block">🔗 Posted at (video / reel link)</label>
          <input value={local.video_url ?? ""} onChange={(e) => setLocal({ ...local, video_url: e.target.value })} onBlur={() => void patch({ video_url: local.video_url })}
            placeholder="YouTube, Instagram reel, or Loom URL" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
          {local.video_url && <a href={local.video_url} target="_blank" rel="noreferrer" className="inline-block text-[11px] text-blue-400 hover:text-blue-300">▶️ Watch on {videoHost(local.video_url)} ↗</a>}
        </div>

        {/* The words */}
        <div className="px-5 py-4 space-y-3 flex-1 border-b border-zinc-800">
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1">✅ Proof point</label>
            <input value={local.proof_point ?? ""} onChange={(e) => setLocal({ ...local, proof_point: e.target.value })} onBlur={() => void patch({ proof_point: local.proof_point })}
              placeholder="e.g. $20K → $155K in 4 months" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-emerald-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1">💬 One-liner</label>
            <textarea value={local.one_liner ?? ""} onChange={(e) => setLocal({ ...local, one_liner: e.target.value })} onBlur={() => void patch({ one_liner: local.one_liner })} rows={2}
              placeholder="The win in one sentence…" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
          </div>
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1">📖 Story</label>
            <textarea value={local.story ?? ""} onChange={(e) => setLocal({ ...local, story: e.target.value })} onBlur={() => void patch({ story: local.story })} rows={4}
              placeholder="The fuller story behind the win…" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
          </div>
          <div>
            <label className="text-zinc-500 text-[11px] block mb-1">🔗 Source URL (video / post link)</label>
            <input value={local.source_url ?? ""} onChange={(e) => setLocal({ ...local, source_url: e.target.value })} onBlur={() => void patch({ source_url: local.source_url })}
              placeholder="https://…" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        {/* Ready-to-post content made from this proof */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">✨ Content from this proof</p>
            <button onClick={() => void regenerate()} disabled={busy} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors disabled:opacity-40">{busy ? "Writing…" : posts.length ? "♻️ Rewrite posts" : "✨ Generate posts"}</button>
          </div>
          {posts.length === 0 ? <p className="text-zinc-600 text-xs">No posts yet. Hit generate to turn this into a Ring-the-Bell post, celebrations, and a story email.</p> : (
            <div className="space-y-2">
              {posts.map((post, i) => (
                <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1 gap-2"><span className="text-[11px] font-semibold text-zinc-400 truncate">{post.label}</span><Copyable text={post.body} /></div>
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{post.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800">
          <button onClick={onDelete} className="text-zinc-600 hover:text-rose-400 text-xs transition-colors">🗑 Delete proof</button>
        </div>
      </div>
    </div>
  );
}

// Spreadsheet view — date added, name, thumbnail, type, proof point, posted-at link.
// Who the proof is about — a client win, or one of Andrew's own.
const isClientProof = (p: Proof) => (p.proof_kind ?? "client") !== "personal";
const KIND_CHIP = {
  client: { label: "Client", emoji: "🤝", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  personal: { label: "Personal", emoji: "🧔", chip: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
} as const;
const kindMeta = (p: Proof) => isClientProof(p) ? KIND_CHIP.client : KIND_CHIP.personal;

function ProofTable({ proof, onOpen, onPatch }: { proof: Proof[]; onOpen: (id: string) => void; onPatch: (id: string, u: Partial<Proof>) => void }) {
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const TYPE = { video: { e: "🎬", label: "Video" }, picture: { e: "🖼️", label: "Picture" }, spoken: { e: "🎙️", label: "Spoken" } } as const;
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800">
      <table className="w-full text-sm min-w-[860px] border-collapse">
        <thead>
          <tr className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 text-[11px] uppercase tracking-wide">
            <th className="text-left font-semibold px-3 py-2.5 w-14">Media</th>
            <th className="text-left font-semibold px-3 py-2.5">Who</th>
            <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Source</th>
            <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Format</th>
            <th className="text-left font-semibold px-3 py-2.5">The win</th>
            <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Added</th>
            <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Link</th>
          </tr>
        </thead>
        <tbody>
          {proof.map((p, i) => {
            const t = TYPE[proofKind(p)];
            const km = kindMeta(p);
            return (
              <tr key={p.id} className={`border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors ${i % 2 ? "bg-zinc-900/30" : ""}`}>
                <td className="px-3 py-2 align-middle cursor-pointer" onClick={() => onOpen(p.id)}><ProofThumb p={p} className="w-11 h-11" /></td>
                {/* the person it's about — editable right here */}
                <td className="px-2 py-2 align-middle min-w-[150px]">
                  <input defaultValue={p.person_name ?? ""} placeholder="Add a name…"
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== p.person_name) onPatch(p.id, { person_name: v }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="w-full bg-transparent focus:bg-zinc-950 border border-transparent focus:border-blue-500/50 rounded-md px-2 py-1 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors" />
                </td>
                {/* client vs personal */}
                <td className="px-3 py-2 align-middle whitespace-nowrap">
                  <select value={isClientProof(p) ? "client" : "personal"} onChange={(e) => onPatch(p.id, { proof_kind: e.target.value })}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${km.chip}`}>
                    <option value="client" className="bg-zinc-900 text-zinc-200">🤝 Client</option>
                    <option value="personal" className="bg-zinc-900 text-zinc-200">🧔 Personal</option>
                  </select>
                </td>
                <td className="px-3 py-2 whitespace-nowrap align-middle cursor-pointer" onClick={() => onOpen(p.id)}>
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-300 bg-zinc-800/70 rounded-full px-2 py-0.5">{t.e} {t.label}</span>
                </td>
                <td className="px-3 py-2 align-middle max-w-[300px] cursor-pointer" onClick={() => onOpen(p.id)}>
                  <span className="block text-white text-[13px] font-medium line-clamp-1">{proofName(p)}</span>
                  {p.proof_point && <span className="block text-emerald-400 text-[11px] line-clamp-1 mt-0.5">{p.proof_point}</span>}
                </td>
                <td className="px-3 py-2 text-zinc-500 whitespace-nowrap text-xs align-middle">{fmt(p.created_at)}</td>
                <td className="px-3 py-2 whitespace-nowrap align-middle">
                  {p.video_url
                    ? <a href={p.video_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-400 hover:text-blue-300 text-xs underline">{videoHost(p.video_url)} ↗</a>
                    : <span className="text-zinc-600 text-xs">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Proof dashboard — how much proof we've actually gathered ────────────────
function ProofDashboard({ proof }: { proof: Proof[] }) {
  const [range, setRange] = useState<"week" | "month" | "quarter" | "year" | "all">("month");

  // Buckets sized to the range, so the shape of the chart always reads well:
  // daily for a week, weekly for a month/quarter, monthly for a year and all-time.
  const RANGES = [
    { k: "week", label: "Week", days: 7 }, { k: "month", label: "Month", days: 30 },
    { k: "quarter", label: "Quarter", days: 90 }, { k: "year", label: "Year", days: 365 },
    { k: "all", label: "All time", days: null },
  ] as const;
  const days = RANGES.find((r) => r.k === range)!.days;

  const dated = proof.filter((p) => p.created_at);
  const earliest = dated.length ? Math.min(...dated.map((p) => Date.parse(p.created_at!))) : Date.now();
  const cutoff = days ? Date.now() - days * 86400000 : earliest;
  const inRange = dated.filter((p) => Date.parse(p.created_at!) >= cutoff);

  const isVideoProof = (p: Proof) => proofKind(p) === "video";
  const count = (arr: Proof[], f: (p: Proof) => boolean) => arr.filter(f).length;

  const videos = count(inRange, isVideoProof);
  const shots = count(inRange, (p) => proofKind(p) === "picture");
  const clients = count(inRange, isClientProof);
  const personal = inRange.length - clients;
  const namedClients = new Set(inRange.filter((p) => isClientProof(p) && p.person_name).map((p) => p.person_name)).size;

  // Chart buckets
  type B = { label: string; start: number; end: number; video: number; picture: number; other: number };
  const buckets: B[] = [];
  const mk = (label: string, start: number, end: number): B => ({ label, start, end, video: 0, picture: 0, other: 0 });
  const now = new Date();
  if (range === "week") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const e = new Date(d); e.setHours(23, 59, 59, 999);
      buckets.push(mk(["S", "M", "T", "W", "T", "F", "S"][d.getDay()], d.getTime(), e.getTime()));
    }
  } else if (range === "month" || range === "quarter") {
    const weeks = range === "month" ? 5 : 13;
    for (let i = weeks - 1; i >= 0; i--) {
      const e = new Date(now); e.setDate(e.getDate() - i * 7); e.setHours(23, 59, 59, 999);
      const st = new Date(e); st.setDate(e.getDate() - 6); st.setHours(0, 0, 0, 0);
      buckets.push(mk(`${st.getMonth() + 1}/${st.getDate()}`, st.getTime(), e.getTime()));
    }
  } else {
    const months = range === "year" ? 12 : Math.min(24, Math.max(1, Math.round((Date.now() - earliest) / (30.4 * 86400000)) + 1));
    for (let i = months - 1; i >= 0; i--) {
      const st = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      buckets.push(mk(st.toLocaleDateString("en-US", { month: "short" }), st.getTime(), e.getTime()));
    }
  }
  for (const p of dated) {
    const t = Date.parse(p.created_at!);
    const b = buckets.find((x) => t >= x.start && t <= x.end);
    if (!b) continue;
    const k = proofKind(p);
    if (k === "video") b.video++; else if (k === "picture") b.picture++; else b.other++;
  }
  const maxB = Math.max(1, ...buckets.map((b) => b.video + b.picture + b.other));

  // Who has given us the most proof
  const byPerson = Object.entries(
    inRange.filter((p) => p.person_name).reduce<Record<string, number>>((a, p) => { a[p.person_name!] = (a[p.person_name!] ?? 0) + 1; return a; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxPerson = Math.max(1, ...byPerson.map(([, n]) => n));

  const KPIS = [
    { label: "Total proof", value: inRange.length, tone: "text-white", sub: range === "all" ? "all time" : `this ${range}` },
    { label: "🎬 Video", value: videos, tone: "text-rose-300", sub: "testimonials" },
    { label: "🖼️ Screenshots", value: shots, tone: "text-sky-300", sub: "receipts" },
    { label: "🤝 Client", value: clients, tone: "text-emerald-300", sub: `${namedClients} named` },
    { label: "🧔 Personal", value: personal, tone: "text-blue-300", sub: "own wins" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-white font-semibold text-sm">📊 Proof gathered</p>
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto no-scrollbar">
          {RANGES.map((r) => (
            <button key={r.k} onClick={() => setRange(r.k)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${range === r.k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {KPIS.map((k) => (
          <div key={k.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5">
            <p className={`text-2xl font-extrabold tabular-nums leading-none ${k.tone}`}>{k.value}</p>
            <p className="text-[11px] text-zinc-400 mt-1.5 font-medium">{k.label}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-semibold text-sm">Proof collected over time</p>
          <div className="flex items-center gap-2.5 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500" />Video</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-500" />Screenshot</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-zinc-600" />Written</span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1 h-40">
          {buckets.map((b, i) => {
            const total = b.video + b.picture + b.other;
            const h = (v: number) => `${(v / maxB) * 100}%`;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0 group">
                <div className="w-full flex flex-col justify-end h-32 relative">
                  <span className="absolute -top-4 left-0 right-0 text-center text-[9px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">{total || ""}</span>
                  {b.other > 0 && <div className="w-full bg-zinc-600 rounded-t-sm" style={{ height: h(b.other) }} />}
                  {b.picture > 0 && <div className="w-full bg-sky-500" style={{ height: h(b.picture) }} />}
                  {b.video > 0 && <div className="w-full bg-rose-500 rounded-b-sm" style={{ height: h(b.video) }} />}
                  {total === 0 && <div className="w-full h-0.5 bg-zinc-800 rounded-full" />}
                </div>
                <span className="text-[9px] text-zinc-600 truncate w-full text-center">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {byPerson.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-white font-semibold text-sm mb-3">Most proof by person</p>
          <div className="space-y-2.5">
            {byPerson.map(([name, n]) => (
              <div key={name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-200 font-medium truncate">{name}</span>
                  <span className="text-zinc-500 tabular-nums flex-shrink-0 ml-2">{n}</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${(n / maxPerson) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProofTab({ proof, onChanged }: { proof: Proof[]; onChanged: () => void }) {
  const [win, setWin] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);   // attach inside the typed-win box
  const quickRef = useRef<HTMLInputElement>(null);  // one-tap upload+save

  async function uploadFile(f: File): Promise<string | null> {
    const fd = new FormData(); fd.append("file", f);
    const r = await (await fetch("/api/content/upload", { method: "POST", body: fd })).json();
    if (r.error) setMsg(r.error);
    return r.url ?? null;
  }
  // One-tap: pick a screenshot/video → uploaded and saved straight to the bank.
  async function quickAdd(f: File) {
    setUploading(true); setMsg(null);
    try {
      const url = await uploadFile(f);
      if (!url) return;
      const r = await (await fetch("/api/content/proof", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_url: url }) })).json();
      if (r.item) { setMsg(r.enriched ? "Saved, and I wrote the posts ✓" : "Saved to your proof bank ✓"); onChanged(); }
      else setMsg(r.error || "Could not save. Try again.");
    } finally { setUploading(false); }
  }
  async function attach(f: File) { setUploading(true); setMsg(null); try { const url = await uploadFile(f); if (url) setImageUrl(url); } finally { setUploading(false); } }
  async function gen() {
    if (!win.trim() && !imageUrl) return;
    setBusy(true); setMsg(null);
    try {
      const r = await (await fetch("/api/content/proof", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ win, image_url: imageUrl || undefined }) })).json();
      if (r.item) { setWin(""); setImageUrl(""); setAdding(false); onChanged(); }
      else setMsg(r.error || "Could not save. Try again.");
    } finally { setBusy(false); }
  }
  async function del(id: string) { await fetch("/api/content/proof", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); setOpenId(null); onChanged(); }
  // Inline edits from the spreadsheet (who it's about, client vs personal).
  async function patch(id: string, updates: Partial<Proof>) {
    await fetch("/api/content/proof", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
    onChanged();
  }

  // Search + media-type filter + view mode + open drawer
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "video" | "picture" | "spoken">("all");
  const [view, setView] = useState<"table" | "gallery" | "dashboard">("table");
  const [who, setWho] = useState<"all" | "client" | "personal">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const filtered = proof.filter((p) => {
    if (who !== "all" && (who === "client") !== isClientProof(p)) return false;
    if (kind !== "all" && proofKind(p) !== kind) return false;
    if (!q) return true;
    return [p.headline, p.proof_point, p.one_liner, p.story, p.person_name].some((f) => (f ?? "").toLowerCase().includes(q));
  });
  const openProof = proof.find((p) => p.id === openId) ?? null;
  const KINDS: { k: typeof kind; label: string }[] = [
    { k: "all", label: "All" }, { k: "video", label: "🎬 Videos" }, { k: "picture", label: "🖼️ Pictures" }, { k: "spoken", label: "🎙️ Spoken" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-white font-semibold text-sm">🏆 Proof bank <span className="text-zinc-600 font-normal">({proof.length})</span></p>
        <div className="flex items-center gap-2">
          <input ref={quickRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void quickAdd(f); }} />
          <button onClick={() => quickRef.current?.click()} disabled={uploading} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-bold disabled:opacity-50">{uploading ? "Saving…" : "📎 Add screenshot / video"}</button>
          <button onClick={() => setAdding((v) => !v)} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold">{adding ? "Cancel" : "+ Type a win"}</button>
        </div>
      </div>
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}
      {adding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="text-zinc-500 text-xs">Type a client win (and optionally attach a screenshot). Get a Ring-the-Bell post, 3 celebration variations, and a story email.</p>
          <textarea value={win} onChange={(e) => setWin(e.target.value)} rows={3} placeholder="e.g. 'Kavetha just hit $155K cash collected in a month, up from $20K 4 months ago'" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void attach(f); }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold disabled:opacity-50">{uploading ? "Uploading…" : "🖼️ Attach"}</button>
            {imageUrl && <><span className="text-emerald-400 text-xs">✓ attached</span><button onClick={() => setImageUrl("")} className="text-zinc-500 hover:text-rose-400 text-xs">remove</button></>}
            <button onClick={() => void gen()} disabled={busy || (!win.trim() && !imageUrl)} className="ml-auto px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-bold disabled:opacity-40">{busy ? "Writing…" : "🏆 Generate proof"}</button>
          </div>
        </div>
      )}
      {/* Search + media-type filter */}
      {proof.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search proof — name, win, story…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
            {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs">✕</button>}
          </div>
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto no-scrollbar">
            {KINDS.map((o) => (
              <button key={o.k} onClick={() => setKind(o.k)} className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${kind === o.k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{o.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {([["all", "All"], ["client", "🤝 Client"], ["personal", "🧔 Personal"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setWho(k)} className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${who === k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{l}</button>
            ))}
          </div>
          {/* View switcher — spreadsheet / grid / gallery */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {([{ v: "table", icon: "📋", label: "Spreadsheet" }, { v: "gallery", icon: "🖼️", label: "Gallery" }, { v: "dashboard", icon: "📊", label: "Dashboard" }] as const).map((o) => (
              <button key={o.v} onClick={() => setView(o.v)} title={o.label} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${view === o.v ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{o.icon}</button>
            ))}
          </div>
        </div>
      )}
      {proof.length === 0 ? <p className="text-zinc-600 text-sm text-center py-8">No proof yet. Add a client win above.</p> : (view !== "dashboard" && filtered.length === 0) ? (
        <p className="text-zinc-600 text-sm text-center py-8">No proof matches. Try a different search or filter.</p>
      ) : view === "table" ? (
        <ProofTable proof={filtered} onOpen={setOpenId} onPatch={patch} />
      ) : view === "gallery" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => setOpenId(p.id)} className="group relative aspect-square rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors">
              <ProofThumb p={p} className="w-full h-full !rounded-2xl" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 pt-6 text-left">
                <p className="text-white text-[11px] font-semibold leading-snug line-clamp-2">{proofName(p)}</p>
                {p.proof_point && <p className="text-emerald-300 text-[10px] truncate mt-0.5">{p.proof_point}</p>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <ProofDashboard proof={proof} />
      )}
      {openProof && <ProofDrawer p={openProof} onClose={() => setOpenId(null)} onChanged={onChanged} onDelete={() => void del(openProof.id)} />}
    </div>
  );
}

// ─── POSTED tab (what actually went out — pulled from the platforms) ──────────

// ─── EVENTS tab ───────────────────────────────────────────────────────────────
function EventsTab({ events, onChanged, onEditEvent, onBumpEvent }: { events: CEvent[]; onChanged: () => void; onEditEvent: (id: string) => void; onBumpEvent: (id: string, next: number) => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(""); const [type, setType] = useState("free_webinar"); const [date, setDate] = useState(""); const [url, setUrl] = useState("");
  const [promo, setPromo] = useState<{ eventId: string; items: { title: string; category: string; days_before: number; platforms: string[] }[]; picked: Set<number> } | null>(null);
  const [busy, setBusy] = useState(false);

  async function addEvent() {
    if (!title.trim()) return;
    await fetch("/api/content/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, event_type: type, start_date: date || null, page_url: url || null }) });
    setTitle(""); setDate(""); setUrl(""); setAdding(false); onChanged();
  }
  async function genPromo(eventId: string) {
    setBusy(true); setPromo(null);
    try { const r = await (await fetch("/api/content/events/promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, runwayDays: 14 }) })).json(); if (r.items) setPromo({ eventId, items: r.items, picked: new Set(r.items.map((_: unknown, i: number) => i)) }); } finally { setBusy(false); }
  }
  async function addPicked() {
    if (!promo) return;
    const add = promo.items.filter((_, i) => promo.picked.has(i));
    await fetch("/api/content/events/promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: promo.eventId, add }) });
    setPromo(null); onChanged();
  }
  async function delEvent(id: string) { if (!confirm("Delete event?")) return; await fetch("/api/content/events", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); onChanged(); }

  return (
    <div className="space-y-4">
      {/* Seat progress + one-tap signups — lives here now, not on the calendar */}
      <UpcomingEventsTracker events={events} onEdit={onEditEvent} onBump={onBumpEvent} />

      <div className="flex items-center justify-between">
        <p className="text-white font-semibold text-sm">🎟️ Events & launch runways</p>
        <button onClick={() => setAdding((v) => !v)} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">{adding ? "Cancel" : "+ Add event"}</button>
      </div>
      {adding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
          <div className="grid grid-cols-2 gap-3">
            <select value={type} onChange={(e) => setType(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">{EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500" />
          </div>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Signup link (optional)" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
          <button onClick={() => void addEvent()} disabled={!title.trim()} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-40">Save event</button>
        </div>
      )}
      {events.length === 0 ? <p className="text-zinc-600 text-sm text-center py-8">No events yet.</p> : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => onEditEvent(ev.id)} className="text-left min-w-0 flex-1 group">
                  <p className="text-white font-semibold text-sm group-hover:text-blue-300 transition-colors">{ev.title} <span className="text-zinc-600 font-normal">✏️</span></p>
                  <p className="text-zinc-500 text-xs mt-0.5">{EVENT_TYPES.find((t) => t.key === ev.event_type)?.label}{ev.start_date ? ` · ${new Date(ev.start_date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}{isUpcomingEvent(ev) ? ` · ${eventDayLabel(ev)}` : ""}</p>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => void genPromo(ev.id)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold disabled:opacity-40">{busy ? "Planning…" : "📣 Promo runway"}</button>
                  <button onClick={() => void delEvent(ev.id)} className="text-zinc-600 hover:text-rose-400 text-xs">🗑</button>
                </div>
              </div>
              {(() => { const sp = eventSpots(ev); return sp.has ? (
                <button onClick={() => onEditEvent(ev.id)} className="w-full text-left mt-3">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-zinc-200 font-semibold">{sp.filled}/{sp.goal} spots <span className="text-zinc-500 font-normal">· {sp.pct}%</span></span>
                    <span className="text-zinc-500">{sp.remaining} to fill</span>
                  </div>
                  <SpotsBar pct={sp.pct} />
                </button>
              ) : (
                <button onClick={() => onEditEvent(ev.id)} className="mt-2 text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors">＋ Set a seat goal</button>
              ); })()}
              {promo?.eventId === ev.id && (
                <div className="mt-3 border-t border-zinc-800 pt-3 space-y-1.5">
                  <p className="text-zinc-400 text-xs mb-1">Tick what to schedule, then add to calendar:</p>
                  {promo.items.map((it, i) => (
                    <label key={i} className="flex items-center gap-2 bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 cursor-pointer">
                      <input type="checkbox" checked={promo.picked.has(i)} onChange={() => setPromo((p) => { if (!p) return p; const s = new Set(p.picked); if (s.has(i)) s.delete(i); else s.add(i); return { ...p, picked: s }; })} className="accent-blue-500" />
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 flex-shrink-0">{it.days_before}d before</span>
                      <span className="text-sm text-zinc-200 truncate flex-1">{it.title}</span>
                      <span className="text-xs flex-shrink-0">{it.platforms.map(platformEmoji).join("")}</span>
                    </label>
                  ))}
                  <button onClick={() => void addPicked()} className="mt-1 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">🗓️ Add {promo.picked.size} to calendar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Date helpers (local) ─────────────────────────────────────────────────────
function isoLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function todayLocal() { return isoLocal(new Date()); }
function weekBounds() {
  const d = new Date(); const day = (d.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(d); start.setDate(d.getDate() - day);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start: isoLocal(start), end: isoLocal(end) };
}
function fmtStoryDate(s: string) {
  const [y, m, dd] = s.split("-").map(Number); const dt = new Date(y, m - 1, dd);
  if (s === todayLocal()) return "Today";
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (s === isoLocal(yest)) return "Yesterday";
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
const STORY_PLATFORMS = [
  { key: "instagram", label: "Instagram", emoji: "📸", badge: "bg-gradient-to-br from-pink-500/30 to-purple-500/30 text-pink-200" },
  { key: "facebook", label: "Facebook", emoji: "📘", badge: "bg-blue-500/25 text-blue-200" },
];

// ─── Stories tab — log what you posted to your IG / FB story ───────────────────
function StoriesTab({ stories, onChanged }: { stories: Story[]; onChanged: () => void }) {
  const [platforms, setPlatforms] = useState<string[]>(["instagram", "facebook"]);
  const [date, setDate] = useState<string>(todayLocal());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const togglePlatform = (p: string) => setPlatforms((v) => v.includes(p) ? v.filter((x) => x !== p) : [...v, p]);

  async function addPhotos(files: FileList) {
    setBusy(true); setMsg(null);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        const fd = new FormData(); fd.append("file", f);
        const up = await (await fetch("/api/content/upload", { method: "POST", body: fd })).json();
        if (!up.url) { setMsg(up.error || "Upload failed."); continue; }
        const r = await (await fetch("/api/content/stories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_url: up.url, platforms, posted_date: date, note: note || undefined }) })).json();
        if (r.story) ok++;
      } catch { /* keep going */ }
    }
    if (ok) { setMsg(`Logged ${ok} ${ok === 1 ? "story" : "stories"} ✓`); setNote(""); onChanged(); }
    setBusy(false);
  }
  async function del(id: string) { await fetch("/api/content/stories", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); onChanged(); }

  // Group by posted_date
  const groups = useMemo(() => {
    const m = new Map<string, Story[]>();
    for (const s of stories) { const arr = m.get(s.posted_date) ?? []; arr.push(s); m.set(s.posted_date, arr); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [stories]);

  return (
    <div className="space-y-5">
      {/* Add bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <p className="text-white font-semibold text-sm">📸 Log a story post</p>
        <p className="text-zinc-500 text-xs">Set where it went and the date once, then add your photo(s). Everything you add uses these settings.</p>
        <div className="flex flex-wrap items-center gap-2">
          {STORY_PLATFORMS.map((p) => (
            <button key={p.key} onClick={() => togglePlatform(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${platforms.includes(p.key) ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}>
              {p.emoji} {p.label}
            </button>
          ))}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="flex-1 min-w-[120px] bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = e.target.files; e.target.value = ""; if (fs && fs.length) void addPhotos(fs); }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy || platforms.length === 0}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-bold disabled:opacity-40">
            {busy ? "Saving…" : "📸 Add story photo"}
          </button>
          {platforms.length === 0 && <span className="text-amber-400 text-xs">Pick at least one platform</span>}
          {msg && <span className="text-emerald-400 text-xs">{msg}</span>}
        </div>
      </div>

      {/* Log */}
      {stories.length === 0 ? (
        <p className="text-zinc-600 text-sm text-center py-8">No stories logged yet. Add your first above.</p>
      ) : (
        groups.map(([d, list]) => (
          <div key={d}>
            <p className="text-zinc-400 text-xs font-semibold mb-2">{fmtStoryDate(d)} <span className="text-zinc-600">· {list.length}</span></p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {list.map((s) => (
                <div key={s.id} className="group relative aspect-[9/16] rounded-xl overflow-hidden border border-zinc-800 bg-black">
                  <a href={s.image_url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.image_url} alt="" className="w-full h-full object-cover" />
                  </a>
                  <div className="absolute top-1 left-1 flex gap-0.5">
                    {s.platforms.map((p) => { const meta = STORY_PLATFORMS.find((x) => x.key === p); return meta ? <span key={p} className="text-xs" title={meta.label}>{meta.emoji}</span> : null; })}
                  </div>
                  <button onClick={() => void del(s.id)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-black/60 rounded-md w-5 h-5 flex items-center justify-center text-white text-xs transition-opacity">✕</button>
                  {s.note && <div className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-1 text-[10px] text-zinc-200 truncate">{s.note}</div>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Dashboard tab — the content command center (first view) ──────────────────
// ─── POSTING ANALYTICS (real data from the Posted bank) ───────────────────────
const PLAT_META: Record<string, { label: string; icon: string; bar: string; text: string; ring: string }> = {
  instagram: { label: "Instagram", icon: "📸", bar: "bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF]", text: "text-pink-400", ring: "ring-pink-500/30" },
  facebook: { label: "Facebook", icon: "👍", bar: "bg-[#1877F2]", text: "text-blue-400", ring: "ring-blue-500/30" },
  youtube: { label: "YouTube", icon: "▶️", bar: "bg-[#FF0000]", text: "text-red-400", ring: "ring-red-500/30" },
};
const fmtN = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(n));

function PostingAnalytics({ posted }: { posted: Posted[] }) {
  type Range = "all" | "year" | "quarter" | "month" | "week";
  const [range, setRange] = useState<Range>("all");
  const [plat, setPlat] = useState<"all" | "instagram" | "facebook" | "youtube">("all");

  const now = Date.now();
  const RANGES: { k: Range; label: string; days: number | null }[] = [
    { k: "all", label: "All time", days: null }, { k: "year", label: "Year", days: 365 },
    { k: "quarter", label: "Quarter", days: 90 }, { k: "month", label: "Month", days: 30 }, { k: "week", label: "Week", days: 7 },
  ];
  const days = RANGES.find((r) => r.k === range)!.days;
  const cutoff = days ? now - days * 86400000 : 0;

  const inRange = posted.filter((p) => {
    if (plat !== "all" && p.platform !== plat) return false;
    if (!p.posted_at) return range === "all";
    return Date.parse(p.posted_at) >= cutoff;
  });

  const sum = (arr: Posted[], k: "views" | "likes" | "comments" | "shares") => arr.reduce((a, p) => a + (p[k] || 0), 0);
  const totals = { posts: inRange.length, views: sum(inRange, "views"), likes: sum(inRange, "likes"), comments: sum(inRange, "comments") };
  const engagement = totals.likes + totals.comments + sum(inRange, "shares");
  const avgViews = totals.posts ? Math.round(totals.views / totals.posts) : 0;

  // Per-platform rollup (always across all 3, respecting only the date range)
  const dateFiltered = posted.filter((p) => !cutoff || (p.posted_at && Date.parse(p.posted_at) >= cutoff) || (range === "all" && !p.posted_at));
  const platforms = ["instagram", "facebook", "youtube"].map((k) => {
    const rows = dateFiltered.filter((p) => p.platform === k);
    return { k, posts: rows.length, views: sum(rows, "views"), likes: sum(rows, "likes"), comments: sum(rows, "comments") };
  }).filter((p) => p.posts > 0);
  const maxPosts = Math.max(1, ...platforms.map((p) => p.posts));

  // Cadence — stacked bars by period bucket, colored per platform
  const buckets = useMemo(() => {
    type B = { label: string; start: number; end: number; instagram: number; facebook: number; youtube: number };
    const out: B[] = [];
    const mk = (label: string, start: number, end: number): B => ({ label, start, end, instagram: 0, facebook: 0, youtube: 0 });
    if (range === "week" || range === "month") {
      const n = range === "week" ? 7 : 30, step = range === "week" ? 1 : 5; // daily or 5-day
      for (let i = Math.floor(n / step) - 1; i >= 0; i--) {
        const e = new Date(now - i * step * 86400000); e.setHours(23, 59, 59, 999);
        const s = new Date(e.getTime() - (step - 1) * 86400000); s.setHours(0, 0, 0, 0);
        out.push(mk(step === 1 ? s.toLocaleDateString("en-US", { weekday: "narrow" }) : `${s.getMonth() + 1}/${s.getDate()}`, s.getTime(), e.getTime()));
      }
    } else if (range === "quarter") {
      for (let w = 12; w >= 0; w--) { // weekly
        const e = new Date(now - w * 7 * 86400000); e.setHours(23, 59, 59, 999);
        const s = new Date(e.getTime() - 6 * 86400000); s.setHours(0, 0, 0, 0);
        out.push(mk(`${s.getMonth() + 1}/${s.getDate()}`, s.getTime(), e.getTime()));
      }
    } else { // year or all — monthly
      const dates = posted.map((p) => (p.posted_at ? Date.parse(p.posted_at) : 0)).filter(Boolean);
      const earliest = dates.length ? Math.min(...dates) : now;
      const startMonths = range === "year" ? 11 : Math.min(17, Math.max(0, Math.round((now - earliest) / (30.4 * 86400000))));
      const base = new Date(); base.setDate(1); base.setHours(0, 0, 0, 0);
      for (let m = startMonths; m >= 0; m--) {
        const s = new Date(base.getFullYear(), base.getMonth() - m, 1);
        const e = new Date(base.getFullYear(), base.getMonth() - m + 1, 0, 23, 59, 59, 999);
        out.push(mk(s.toLocaleDateString("en-US", { month: "short" }), s.getTime(), e.getTime()));
      }
    }
    for (const p of posted) {
      if (!p.posted_at) continue;
      const t = Date.parse(p.posted_at);
      const b = out.find((x) => t >= x.start && t <= x.end);
      if (b && (p.platform === "instagram" || p.platform === "facebook" || p.platform === "youtube")) b[p.platform]++;
    }
    return out;
  }, [posted, range, now]);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.instagram + b.facebook + b.youtube));

  const topPosts = [...inRange].sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || ((b.likes ?? 0) + (b.comments ?? 0)) - ((a.likes ?? 0) + (a.comments ?? 0))).slice(0, 6);

  const KPIS = [
    { label: "Posts", value: fmtN(totals.posts), sub: platforms.length ? `${platforms.length} platforms` : "" },
    { label: "Views", value: fmtN(totals.views), sub: `${fmtN(avgViews)}/post avg` },
    { label: "Likes", value: fmtN(totals.likes), sub: "" },
    { label: "Comments", value: fmtN(totals.comments), sub: "" },
    { label: "Engagement", value: fmtN(engagement), sub: "likes + comments + shares" },
  ];

  return (
    <div className="order-first flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-white font-bold text-base">📊 Posting analytics</p>
        <button onClick={() => document.getElementById("posted-content")?.scrollIntoView({ behavior: "smooth" })} className="text-zinc-500 hover:text-white text-xs">See all posts →</button>
      </div>

      {/* Range + platform filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto no-scrollbar">
          {RANGES.map((r) => (
            <button key={r.k} onClick={() => setRange(r.k)} className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${range === r.k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{r.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {([["all", "All"], ["instagram", "📸"], ["facebook", "👍"], ["youtube", "▶️"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPlat(k)} title={k} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${plat === k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {KPIS.map((k) => (
          <div key={k.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5">
            <p className="text-2xl font-extrabold text-white tabular-nums leading-none">{k.value}</p>
            <p className="text-[11px] text-zinc-400 mt-1.5 font-medium">{k.label}</p>
            {k.sub && <p className="text-[10px] text-zinc-600 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Cadence chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold text-sm">Posting cadence</p>
            <div className="flex items-center gap-2.5 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gradient-to-r from-[#F58529] to-[#8134AF]" />IG</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#1877F2]" />FB</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#FF0000]" />YT</span>
            </div>
          </div>
          <div className="flex items-end justify-between gap-1 h-36">
            {buckets.map((b, i) => {
              const total = b.instagram + b.facebook + b.youtube;
              const h = (v: number) => `${(v / maxBucket) * 100}%`;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0 group">
                  <div className="w-full flex flex-col justify-end h-28 relative" title={`${total} posts`}>
                    <span className="absolute -top-4 left-0 right-0 text-center text-[9px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">{total || ""}</span>
                    {b.youtube > 0 && <div className="w-full bg-[#FF0000] rounded-t-sm" style={{ height: h(b.youtube) }} />}
                    {b.facebook > 0 && <div className="w-full bg-[#1877F2]" style={{ height: h(b.facebook) }} />}
                    {b.instagram > 0 && <div className="w-full bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] rounded-b-sm" style={{ height: h(b.instagram) }} />}
                    {total === 0 && <div className="w-full h-0.5 bg-zinc-800 rounded-full" />}
                  </div>
                  <span className="text-[9px] text-zinc-600 truncate w-full text-center">{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Platform breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-white font-semibold text-sm mb-3">By platform</p>
          {platforms.length === 0 ? <p className="text-zinc-600 text-sm py-6 text-center">No posts in this range.</p> : (
            <div className="space-y-3">
              {platforms.map((p) => {
                const m = PLAT_META[p.k];
                return (
                  <div key={p.k}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-zinc-200 font-medium">{m.icon} {m.label}</span>
                      <span className="text-zinc-500 tabular-nums">{p.posts} posts · {fmtN(p.views)} views · {fmtN(p.likes)} likes · {fmtN(p.comments)} comments</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full ${m.bar} rounded-full`} style={{ width: `${(p.posts / maxPosts) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top posts in range */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-white font-semibold text-sm mb-3">🔥 Top posts {range !== "all" && <span className="text-zinc-600 font-normal">this {range}</span>}</p>
        {topPosts.length === 0 ? <p className="text-zinc-600 text-sm py-6 text-center">No posts in this range.</p> : (
          <div className="space-y-1.5">
            {topPosts.map((p) => {
              const m = PLAT_META[p.platform];
              return (
                <a key={p.id} href={p.post_url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg hover:bg-zinc-800/50 transition-colors">
                  <span className="text-sm flex-shrink-0" title={m?.label}>{m?.icon ?? "•"}</span>
                  {p.platform === "youtube" && <span className={`text-[8px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${p.media_type === "short" ? "bg-amber-500/15 text-amber-400" : "bg-sky-500/15 text-sky-400"}`}>{p.media_type === "short" ? "SHORT" : "LONG"}</span>}
                  <span className="text-zinc-200 text-sm truncate flex-1">{p.text || "—"}</span>
                  <span className="text-zinc-400 text-xs tabular-nums flex-shrink-0">👁 {p.views === null ? "—" : fmtN(p.views)}</span>
                  <span className="text-zinc-500 text-xs tabular-nums flex-shrink-0 hidden sm:inline">❤️ {p.likes === null ? "—" : fmtN(p.likes)}</span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardTab({ items, ideas, proof, stories, events, posted, onGo }: {
  items: ContentItem[]; ideas: Idea[]; proof: Proof[]; stories: Story[]; events: CEvent[]; posted: Posted[]; onGo: (tab: string) => void;
}) {
  const { start, end } = weekBounds();
  const today = todayLocal();

  const postsThisWeek = items.filter((i) => i.scheduled_date && i.scheduled_date >= start && i.scheduled_date <= end);
  const storiesThisWeek = stories.filter((s) => s.posted_date >= start && s.posted_date <= end);

  // Posting streak — consecutive days (ending today or yesterday) with a story or a dated post.
  const streak = useMemo(() => {
    const days = new Set<string>();
    stories.forEach((s) => days.add(s.posted_date));
    items.forEach((i) => { if (i.scheduled_date && i.scheduled_date <= today) days.add(i.scheduled_date); });
    let count = 0; const d = new Date();
    // allow the streak to count from today or from yesterday (if nothing today yet)
    if (!days.has(isoLocal(d))) d.setDate(d.getDate() - 1);
    while (days.has(isoLocal(d))) { count++; d.setDate(d.getDate() - 1); }
    return count;
  }, [stories, items, today]);

  const stats = [
    { label: "Posts this week", value: postsThisWeek.length, emoji: "🗓️", go: "calendar" },
    { label: "Stories this week", value: storiesThisWeek.length, emoji: "📸", go: "stories" },
    { label: "Ideas", value: ideas.length, emoji: "💡", go: "ideas" },
    { label: "Proof", value: proof.length, emoji: "🏆", go: "proof" },
  ];
  const quick = [
    { label: "Log a story", emoji: "📸", go: "stories", cls: "from-violet-600 to-blue-600" },
    { label: "Create a post", emoji: "✨", go: "create", cls: "from-blue-600 to-cyan-600" },
    { label: "Add an idea", emoji: "💡", go: "ideas", cls: "from-amber-600 to-orange-600" },
    { label: "Add proof", emoji: "🏆", go: "proof", cls: "from-emerald-600 to-teal-600" },
  ];

  // ── Pipeline analytics (modeled on the mastermind content dashboard) ──
  const dateOf = (i: ContentItem) => i.scheduled_date ?? i.created_at.slice(0, 10);
  const postedItems = items.filter((i) => i.status === "posted");
  const scheduledItems = items.filter((i) => i.status !== "posted" && i.scheduled_date);
  const backlog = items.filter((i) => i.status !== "posted" && !i.scheduled_date);
  const overdue = items.filter((i) => i.status !== "posted" && i.scheduled_date && i.scheduled_date < today);

  const statusCounts: Record<string, number> = { idea: 0, drafted: 0, scheduled: 0, posted: 0 };
  for (const i of items) if (i.status in statusCounts) statusCounts[i.status]++;

  const byPlatform = PLATFORMS.map((p) => ({ key: p.key, label: p.label, emoji: p.emoji, n: items.filter((i) => i.platforms.includes(p.key)).length })).filter((x) => x.n > 0);
  const byCategory = CATEGORIES.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji, n: items.filter((i) => i.category === c.key).length })).filter((x) => x.n > 0);
  const maxPlat = Math.max(1, ...byPlatform.map((x) => x.n));
  const maxCat = Math.max(1, ...byCategory.map((x) => x.n));

  // posting cadence — pieces posted per week over the last 8 weeks
  const cadence: { label: string; n: number }[] = [];
  for (let w = 7; w >= 0; w--) {
    const s = new Date(); s.setDate(s.getDate() - w * 7 - s.getDay());
    const e = new Date(s); e.setDate(s.getDate() + 6);
    const si = isoLocal(s), ei = isoLocal(e);
    cadence.push({ label: `${s.getMonth() + 1}/${s.getDate()}`, n: postedItems.filter((i) => { const d = dateOf(i); return d >= si && d <= ei; }).length });
  }
  const maxWeek = Math.max(1, ...cadence.map((w) => w.n));

  // going out in the next 7 days
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const in7iso = isoLocal(in7);
  const upcoming = scheduledItems.filter((i) => i.scheduled_date! >= today && i.scheduled_date! <= in7iso).sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1));
  const fmtDay = (iso: string) => new Date(iso + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-5">
      {/* Posting analytics — real numbers across every platform, leads the page */}
      {posted.length > 0 && <PostingAnalytics posted={posted} />}
      {/* Event seat trackers */}
      {/* Numbers + streak — top on desktop, below the buttons on mobile */}
      <div className="order-2 lg:order-1 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((s) => (
            <button key={s.label} onClick={() => onGo(s.go)} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-left hover:border-zinc-700 transition-colors">
              <p className="text-2xl font-extrabold text-white tabular-nums">{s.value}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">{s.emoji} {s.label}</p>
            </button>
          ))}
        </div>
        <div className="bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 rounded-2xl p-3 flex sm:flex-col items-center justify-center gap-2 sm:min-w-[130px]">
          <p className="text-3xl font-extrabold text-amber-400 tabular-nums leading-none">🔥 {streak}</p>
          <p className="text-[11px] text-amber-200/80 font-medium">day{streak === 1 ? "" : "s"} posting streak</p>
        </div>
      </div>

      {/* Quick-add hub — top on mobile, bottom on desktop */}
      <div className="order-1 lg:order-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {quick.map((q) => (
          <button key={q.label} onClick={() => onGo(q.go)} className={`bg-gradient-to-r ${q.cls} rounded-2xl px-4 py-4 text-white font-bold text-sm flex flex-col items-center gap-1.5 hover:brightness-110 transition-all`}>
            <span className="text-2xl">{q.emoji}</span>
            {q.label}
          </button>
        ))}
      </div>

      {/* This week — middle on desktop, bottom on mobile */}
      <div className="order-3 lg:order-2 grid md:grid-cols-2 gap-4">
        {/* Posts this week */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold text-sm">🗓️ This week&apos;s posts</p>
            <button onClick={() => onGo("calendar")} className="text-zinc-500 hover:text-white text-xs">Calendar →</button>
          </div>
          {postsThisWeek.length === 0 ? (
            <p className="text-zinc-600 text-sm py-6 text-center">Nothing scheduled this week. <button onClick={() => onGo("create")} className="text-blue-400 underline">Create a post →</button></p>
          ) : (
            <div className="space-y-1.5">
              {postsThisWeek.slice(0, 8).map((i) => (
                <div key={i.id} className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500 text-xs w-12 flex-shrink-0">{i.scheduled_date ? fmtStoryDate(i.scheduled_date) : ""}</span>
                  <span className="text-zinc-200 truncate flex-1">{i.title}</span>
                  <span className="flex-shrink-0">{(i.platforms ?? []).slice(0, 3).map((p) => <span key={p} className="text-xs">{platformEmoji(p)}</span>)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stories this week */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold text-sm">📸 This week&apos;s stories <span className="text-zinc-600 font-normal">({storiesThisWeek.length})</span></p>
            <button onClick={() => onGo("stories")} className="text-zinc-500 hover:text-white text-xs">All →</button>
          </div>
          {storiesThisWeek.length === 0 ? (
            <p className="text-zinc-600 text-sm py-6 text-center">No stories yet this week. <button onClick={() => onGo("stories")} className="text-blue-400 underline">Log one →</button></p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
              {storiesThisWeek.slice(0, 10).map((s) => (
                <a key={s.id} href={s.image_url} target="_blank" rel="noreferrer" className="relative aspect-[9/16] rounded-lg overflow-hidden border border-zinc-800 bg-black block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image_url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-0.5 left-0.5 flex gap-0.5 text-[10px]">
                    {s.platforms.map((p) => { const meta = STORY_PLATFORMS.find((x) => x.key === p); return meta ? <span key={p}>{meta.emoji}</span> : null; })}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Content pipeline ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <p className="text-white font-semibold text-sm mb-3">📊 Your content pipeline</p>
        <div className="space-y-2.5">
          {CONTENT_STATUSES.map((s) => {
            const n = statusCounts[s.key] ?? 0;
            const pct = items.length ? Math.round((n / items.length) * 100) : 0;
            const fill = s.key === "posted" ? "bg-emerald-500" : s.key === "scheduled" ? "bg-gradient-to-r from-amber-500 to-amber-300" : "bg-zinc-500";
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-24 text-sm text-zinc-300 shrink-0">{s.emoji} {s.label}</div>
                <div className="flex-1 h-6 rounded-lg bg-zinc-800 overflow-hidden">
                  <div className={`h-full rounded-lg ${fill} transition-all`} style={{ width: `${Math.max(pct, n ? 6 : 0)}%` }} />
                </div>
                <div className="w-8 text-right text-sm font-bold text-white tabular-nums shrink-0">{n}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Needs attention ── */}
      {(overdue.length > 0 || backlog.length > 0) && (
        <div className={`rounded-2xl border p-4 flex flex-wrap items-center gap-x-6 gap-y-2 ${overdue.length ? "border-rose-500/50 bg-rose-500/[0.04]" : "border-amber-500/40 bg-amber-500/[0.04]"}`}>
          {overdue.length > 0 && (
            <button onClick={() => onGo("calendar")} className="text-sm text-left hover:opacity-80 transition-opacity">
              <span className="font-bold text-rose-400">⚠️ {overdue.length} overdue</span>
              <span className="text-zinc-400"> — scheduled in the past, not marked posted</span>
            </button>
          )}
          {backlog.length > 0 && (
            <button onClick={() => onGo("calendar")} className="text-sm text-left hover:opacity-80 transition-opacity">
              <span className="font-bold text-amber-400">💡 {backlog.length} in the backlog</span>
              <span className="text-zinc-400"> — give them a date to fill your calendar</span>
            </button>
          )}
        </div>
      )}

      {/* ── By platform / By category ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-white font-semibold text-sm mb-3">By platform</p>
          <div className="space-y-2">
            {byPlatform.length === 0 ? <p className="text-zinc-600 text-sm">Nothing tagged yet.</p> :
              byPlatform.map((x) => <MiniBar key={x.key} label={`${x.emoji} ${x.label}`} n={x.n} max={maxPlat} />)}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-white font-semibold text-sm mb-3">By category</p>
          <div className="space-y-2">
            {byCategory.length === 0 ? <p className="text-zinc-600 text-sm">Nothing tagged yet.</p> :
              byCategory.map((x) => <MiniBar key={x.key} label={`${x.emoji} ${x.label}`} n={x.n} max={maxCat} />)}
          </div>
        </div>
      </div>

      {/* ── Posting cadence ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <p className="text-white font-semibold text-sm mb-1">Posting cadence <span className="text-zinc-600 font-normal">— last 8 weeks</span></p>
        <div className="flex items-end gap-1.5 h-24 mt-3">
          {cadence.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 justify-end">
              <div className="text-[10px] font-bold tabular-nums text-amber-400">{w.n || ""}</div>
              <div className={`w-full rounded-t-md transition-all ${w.n ? "bg-gradient-to-t from-amber-500 to-amber-300" : "bg-zinc-800"}`} style={{ height: `${(w.n / maxWeek) * 72}px`, minHeight: w.n ? 4 : 2 }} />
              <div className="text-[9px] text-zinc-600">{w.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Going out this week ── */}
      {upcoming.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-white font-semibold text-sm mb-3">📅 Going out this week</p>
          <div className="divide-y divide-zinc-800">
            {upcoming.map((it) => (
              <button key={it.id} onClick={() => onGo("calendar")} className="w-full flex items-center gap-3 py-2 text-left hover:bg-zinc-800/30 -mx-2 px-2 rounded-lg transition-colors">
                <span className="shrink-0">{categoryMeta(it.category).emoji}</span>
                <span className="min-w-0 flex-1 text-sm text-zinc-200 truncate">{it.title}</span>
                <span className="shrink-0 flex gap-0.5">{it.platforms.slice(0, 3).map((p) => <span key={p} className="text-xs">{platformEmoji(p)}</span>)}</span>
                <span className="shrink-0 text-xs text-zinc-500 tabular-nums w-24 text-right">{fmtDay(it.scheduled_date!)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Small labelled bar for the By-platform / By-category breakdowns.
function MiniBar({ label, n, max }: { label: string; n: number; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-sm text-zinc-300 shrink-0 truncate">{label}</div>
      <div className="flex-1 h-5 rounded-md bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-md bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${Math.max((n / max) * 100, 6)}%` }} />
      </div>
      <div className="w-8 text-right text-sm font-bold text-white tabular-nums shrink-0">{n}</div>
    </div>
  );
}

// ─── Event spots helpers + tracker + editor ───────────────────────────────────
function eventSpots(ev: { spots_goal: number | null; signups: number | null }) {
  const goal = ev.spots_goal ?? 0;
  const filled = Math.max(0, ev.signups ?? 0);
  const has = goal > 0;
  const pct = has ? Math.min(100, Math.round((filled / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - filled);
  return { has, goal, filled, pct, remaining };
}
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00"); const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}
function eventDayLabel(ev: { start_date: string | null; end_date: string | null }) {
  const d = daysUntil(ev.start_date ?? ev.end_date);
  if (d == null) return "no date set";
  if (d > 1) return `in ${d} days`;
  if (d === 1) return "tomorrow";
  if (d === 0) return "today";
  return "past";
}
// upcoming = its (end or start) date is today or later; undated events still count.
function isUpcomingEvent(ev: { start_date: string | null; end_date: string | null }) {
  const ref = ev.end_date ?? ev.start_date;
  return !ref || ref >= todayLocal();
}
function SpotsBar({ pct, className = "" }: { pct: number; className?: string }) {
  const hot = pct >= 85;
  return (
    <div className={`rounded-full bg-zinc-800 overflow-hidden ${className || "h-2"}`}>
      <div className={`h-full rounded-full transition-all ${hot ? "bg-gradient-to-r from-amber-500 to-rose-500" : "bg-gradient-to-r from-blue-500 to-violet-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Seat tracker shown on the Dashboard + Calendar. Click a card to edit in the sidebar.
function UpcomingEventsTracker({ events, onEdit, onBump }: { events: CEvent[]; onEdit: (id: string) => void; onBump: (id: string, next: number) => void }) {
  const upcoming = events.filter(isUpcomingEvent).sort((a, b) => ((a.start_date ?? "9999") < (b.start_date ?? "9999") ? -1 : 1));
  if (upcoming.length === 0) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-white font-semibold text-sm mb-3">🎟️ Upcoming events <span className="text-zinc-600 font-normal">({upcoming.length})</span></p>
      <div className="grid sm:grid-cols-2 gap-3">
        {upcoming.map((ev) => {
          const sp = eventSpots(ev);
          return (
            <div key={ev.id} className="bg-zinc-950/50 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3.5 transition-colors">
              <button onClick={() => onEdit(ev.id)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-white font-semibold text-sm leading-snug">{ev.title}</p>
                  <span className="text-[11px] text-zinc-500 flex-shrink-0 whitespace-nowrap">{eventDayLabel(ev)}</span>
                </div>
              </button>
              {sp.has ? (
                <div className="mt-2.5">
                  <button onClick={() => onEdit(ev.id)} className="w-full text-left">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-zinc-200 font-semibold">{sp.filled}/{sp.goal} spots <span className="text-zinc-500 font-normal">· {sp.pct}%</span></span>
                      <span className="text-zinc-500">{sp.remaining} to fill</span>
                    </div>
                    <SpotsBar pct={sp.pct} />
                  </button>
                  {/* Quick stepper — bump the headcount without opening the editor */}
                  <div className="flex items-center justify-end gap-2 mt-2.5">
                    <button onClick={() => onBump(ev.id, Math.max(0, sp.filled - 1))} disabled={sp.filled <= 0}
                      className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 text-base font-bold flex items-center justify-center leading-none">−</button>
                    <span className="min-w-[2.75rem] text-center text-white font-bold tabular-nums text-sm">{sp.filled}</span>
                    <button onClick={() => onBump(ev.id, sp.filled + 1)}
                      className="px-3 h-7 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 hover:brightness-110 text-white text-xs font-bold flex items-center justify-center whitespace-nowrap">＋1 signup</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => onEdit(ev.id)} className="text-zinc-600 text-[11px] mt-2 hover:text-zinc-300 transition-colors">Tap to set a seat goal →</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Click an event → edit everything (spots, dates, link, price…) here.
function EventDrawer({ event, onClose, onPatch }: { event: CEvent; onClose: () => void; onPatch: (id: string, p: Partial<CEvent>) => Promise<CEvent | null> }) {
  const [form, setForm] = useState<CEvent>(event);
  useEffect(() => { setForm(event); }, [event]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const set = (p: Partial<CEvent>) => setForm((f) => ({ ...f, ...p }));
  const commit = (p: Partial<CEvent>) => { setForm((f) => ({ ...f, ...p })); void onPatch(event.id, p); };
  const numFrom = (v: string) => (v === "" ? null : Math.max(0, parseInt(v, 10) || 0));
  const sp = eventSpots(form);

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:max-w-md bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-2">
          <span className="text-lg">🎟️</span>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} onBlur={() => commit({ title: form.title })} placeholder="Event name" className="flex-1 bg-transparent text-white font-semibold text-base focus:outline-none" />
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none px-1">✕</button>
        </div>
        <div className="p-4 space-y-5">
          {/* Spots */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <p className="text-white font-semibold flex items-center gap-2 text-sm">🎟️ Spots</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-500 text-[11px] block mb-1">Spots filled</label>
                <input type="number" min={0} inputMode="numeric" value={form.signups ?? ""} onChange={(e) => set({ signups: numFrom(e.target.value) ?? 0 })} onBlur={() => commit({ signups: form.signups ?? 0 })}
                  placeholder="0" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-zinc-500 text-[11px] block mb-1">Spots needed</label>
                <input type="number" min={0} inputMode="numeric" value={form.spots_goal ?? ""} onChange={(e) => set({ spots_goal: numFrom(e.target.value) })} onBlur={() => commit({ spots_goal: form.spots_goal })}
                  placeholder="e.g. 60" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            {sp.has ? (
              <div className="pt-1">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-white font-semibold">{sp.filled}/{sp.goal} filled <span className="text-zinc-500 font-normal">· {sp.pct}%</span></span>
                  <span className="text-zinc-400">{sp.remaining} to fill</span>
                </div>
                <SpotsBar pct={sp.pct} className="h-2.5" />
              </div>
            ) : <p className="text-zinc-600 text-xs">Set spots needed to show a progress bar.</p>}
          </div>

          {/* Details */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">Type</label>
              <select value={form.event_type} onChange={(e) => commit({ event_type: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
                {EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-500 text-[11px] block mb-1">Start date</label>
                <input type="date" value={form.start_date ?? ""} onChange={(e) => commit({ start_date: e.target.value || null })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-zinc-500 text-[11px] block mb-1">End date</label>
                <input type="date" value={form.end_date ?? ""} onChange={(e) => commit({ end_date: e.target.value || null })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">Signup link</label>
              <input value={form.page_url ?? ""} onChange={(e) => set({ page_url: e.target.value || null })} onBlur={() => commit({ page_url: form.page_url })} placeholder="https://…" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
              {form.page_url && <a href={form.page_url} target="_blank" rel="noreferrer" className="inline-block mt-1 text-[11px] text-emerald-400 hover:text-emerald-300">Open link ↗</a>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-500 text-[11px] block mb-1">Price ($)</label>
                <input type="number" min={0} inputMode="numeric" value={form.price ?? ""} onChange={(e) => set({ price: numFrom(e.target.value) })} onBlur={() => commit({ price: form.price })} placeholder="0" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-zinc-500 text-[11px] block mb-1">Location</label>
                <input value={form.location ?? ""} onChange={(e) => set({ location: e.target.value || null })} onBlur={() => commit({ location: form.location })} placeholder="Miami / Zoom…" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-zinc-500 text-[11px] block mb-1">Notes</label>
              <textarea value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} onBlur={() => commit({ notes: form.notes })} rows={3} placeholder="Anything to remember…" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventDateChip({ dateStr, accent }: { dateStr: string | null; accent: boolean }) {
  if (!dateStr) {
    return (
      <div className="w-11 flex-shrink-0 rounded-xl border border-zinc-700/60 bg-zinc-800/50 py-1.5 text-center">
        <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500 leading-none">TBD</p>
        <p className="text-zinc-600 text-base font-extrabold leading-tight mt-0.5">–</p>
      </div>
    );
  }
  const dt = new Date(dateStr + "T12:00");
  return (
    <div className={`w-11 flex-shrink-0 rounded-xl border py-1.5 text-center ${accent ? "border-blue-500/40 bg-blue-600/20" : "border-zinc-700/60 bg-zinc-800/50"}`}>
      <p className={`text-[9px] font-bold uppercase tracking-wide leading-none ${accent ? "text-blue-300" : "text-zinc-500"}`}>{dt.toLocaleDateString("en-US", { month: "short" })}</p>
      <p className="text-white text-base font-extrabold leading-tight mt-0.5">{dt.getDate()}</p>
    </div>
  );
}

function EventRow({ ev, accent, onEdit, onBump }: { ev: CEvent; accent: boolean; onEdit: (id: string) => void; onBump: (id: string, next: number) => void }) {
  const sp = eventSpots(ev);
  const d = daysUntil(ev.start_date ?? ev.end_date);
  const soldOut = sp.has && sp.remaining === 0;
  const urgency =
    d == null ? "text-zinc-600"
      : d < 0 ? "text-zinc-600"
        : d === 0 ? "text-rose-300"
          : d <= 3 ? "text-rose-300"
            : d <= 14 ? "text-amber-300"
              : "text-zinc-500";

  return (
    <div className="group px-3 py-3 hover:bg-zinc-800/30 transition-colors">
      <div className="flex items-start gap-2.5">
        <EventDateChip dateStr={ev.start_date ?? ev.end_date} accent={accent} />
        <button onClick={() => onEdit(ev.id)} className="min-w-0 flex-1 text-left">
          <p className="text-white text-[13px] font-semibold leading-snug break-words group-hover:text-blue-200 transition-colors">{ev.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px]">
            <span className="text-zinc-500">{EVENT_TYPES.find((t) => t.key === ev.event_type)?.label ?? "Event"}</span>
            {d != null && <><span className="text-zinc-700">·</span><span className={`font-medium ${urgency}`}>{eventDayLabel(ev)}</span></>}
            {soldOut && <span className="ml-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">Sold out</span>}
          </p>
        </button>
      </div>

      {sp.has ? (
        <div className="mt-2.5 pl-[54px]">
          <button onClick={() => onEdit(ev.id)} className="w-full text-left">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-zinc-200">{sp.filled}/{sp.goal} <span className="font-normal text-zinc-500">· {sp.pct}%</span></span>
              <span className="text-zinc-500">{sp.remaining} to fill</span>
            </div>
            <SpotsBar pct={sp.pct} />
          </button>
          <div className="mt-2 flex items-center gap-1.5">
            <button onClick={() => onBump(ev.id, Math.max(0, sp.filled - 1))} disabled={sp.filled <= 0}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800 text-sm font-bold leading-none text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-30">−</button>
            <button onClick={() => onBump(ev.id, sp.filled + 1)}
              className="flex h-6 flex-1 items-center justify-center rounded-md bg-gradient-to-r from-blue-600 to-violet-600 text-[11px] font-bold text-white transition-all hover:brightness-110">＋1 signup</button>
          </div>
        </div>
      ) : (
        <button onClick={() => onEdit(ev.id)} className="mt-1.5 pl-[54px] text-[11px] text-zinc-600 transition-colors hover:text-zinc-300">＋ Set a seat goal</button>
      )}
    </div>
  );
}

function EventsRail({ events, onEdit, onBump, onChanged }: {
  events: CEvent[]; onEdit: (id: string) => void; onBump: (id: string, next: number) => void; onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("free_webinar");
  const [date, setDate] = useState("");
  const [showPast, setShowPast] = useState(false);

  async function addEvent() {
    if (!title.trim()) return;
    await fetch("/api/content/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, event_type: type, start_date: date || null }) });
    setTitle(""); setDate(""); setAdding(false); onChanged();
  }

  // One running list, soonest first; undated fall to the end, past collapses below.
  const key = (e: CEvent) => e.start_date ?? e.end_date ?? "9999-99-99";
  const upcoming = events.filter(isUpcomingEvent).sort((a, b) => key(a).localeCompare(key(b)));
  const past = events.filter((e) => !isUpcomingEvent(e)).sort((a, b) => key(b).localeCompare(key(a)));

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3.5 py-3">
        <p className="text-sm font-bold text-white">🎟️ Events <span className="font-normal text-zinc-600">{upcoming.length}</span></p>
        <button onClick={() => setAdding((v) => !v)} title="Add an event"
          className="rounded-lg bg-zinc-800 px-2 py-1 text-xs font-bold text-zinc-200 transition-colors hover:bg-zinc-700">{adding ? "Cancel" : "＋ Add"}</button>
      </div>

      {adding && (
        <div className="space-y-2 border-b border-zinc-800 bg-zinc-950/40 p-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Event name"
            onKeyDown={(e) => { if (e.key === "Enter") void addEvent(); }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
          <div className="grid grid-cols-2 gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none">
              {EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none" />
          </div>
          <button onClick={() => void addEvent()} disabled={!title.trim()}
            className="w-full rounded-lg bg-blue-600 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-40">Save event</button>
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 ? (
        <p className="px-3.5 py-8 text-center text-xs text-zinc-600">No events yet.<br />Add your next launch ↑</p>
      ) : (
        <div className="divide-y divide-zinc-800/70">
          {upcoming.map((ev, i) => <EventRow key={ev.id} ev={ev} accent={i === 0} onEdit={onEdit} onBump={onBump} />)}
          {upcoming.length === 0 && <p className="px-3.5 py-6 text-center text-xs text-zinc-600">Nothing coming up.</p>}
        </div>
      )}

      {past.length > 0 && (
        <div className="border-t border-zinc-800">
          <button onClick={() => setShowPast((v) => !v)}
            className="w-full px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-600 transition-colors hover:text-zinc-400">
            {showPast ? "▾" : "▸"} Past ({past.length})
          </button>
          {showPast && (
            <div className="divide-y divide-zinc-800/70 opacity-60">
              {past.map((ev) => <EventRow key={ev.id} ev={ev} accent={false} onEdit={onEdit} onBump={onBump} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function ContentWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = TABS.some((candidate) => candidate.key === requestedTab) ? requestedTab! : "calendar";
  const [items, setItems] = useState<ContentItem[]>([]);
  const [events, setEvents] = useState<CEvent[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [proof, setProof] = useState<Proof[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [posted, setPosted] = useState<Posted[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editEventId, setEditEventId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await (await fetch("/api/content")).json();
    setItems(j.items ?? []); setEvents(j.events ?? []); setIdeas(j.ideas ?? []); setProof(j.proof ?? []); setStories(j.stories ?? []);
  }, []);
  const loadPosted = useCallback(async () => {
    const j = await (await fetch("/api/content/posted")).json();
    setPosted(j.posted ?? []);
  }, []);
  useEffect(() => { void loadPosted(); }, [loadPosted]);
  useEffect(() => { void load(); }, [load]);

  const selectTab = useCallback((nextTab: string) => {
    router.push(nextTab === "calendar" ? "/content" : `/content?tab=${nextTab}`, { scroll: false });
  }, [router]);

  const patchItem = useCallback(async (id: string, patch: Partial<ContentItem>) => {
    const current = items.find((item) => item.id === id);
    if (current?.meta?.reel_workflow === "idea_board") {
      const keys = Object.keys(patch);
      if (keys.some((key) => key !== "scheduled_date" && key !== "status")) return null;
      const stage = patch.status === "idea" ? "idea" : patch.status === "drafted" ? "shot" : patch.status === "posted" ? "posted" : undefined;
      if (patch.status !== undefined && !stage) return null;
      const body = {
        id,
        expected_updated_at: current.updated_at,
        ...(patch.scheduled_date !== undefined ? { scheduled_date: patch.scheduled_date } : {}),
        ...(stage ? { stage } : {}),
      };
      const response = await fetch("/api/instagram/reel-ideas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await response.json();
      if (response.ok && j.item) { setItems((prev) => prev.map((x) => (x.id === id ? j.item : x))); return j.item as ContentItem; }
      return null;
    }
    const response = await fetch("/api/content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const j = await response.json();
    if (response.ok && j.item) { setItems((prev) => prev.map((x) => (x.id === id ? j.item : x))); return j.item as ContentItem; }
    return null;
  }, [items]);
  const delItem = useCallback(async (id: string) => {
    try {
      const response = await fetch("/api/content", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) return false;
      setItems((current) => current.filter((item) => item.id !== id));
      setOpenId(null);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Simplest add: a title → new item, opened straight into the drawer to flesh out
  const quickAdd = useCallback(async (title: string) => {
    const j = await (await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, category: "value", status: "idea", platforms: [], meta: { topic: title } }) })).json();
    if (j.item) { setItems((prev) => [j.item, ...prev]); setOpenId(j.item.id); }
  }, []);
  // Click a day on the calendar → new item pre-dated to that day, opened in the sidebar
  const createOn = useCallback(async (dateStr: string) => {
    const j = await (await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "New content", category: "value", status: "scheduled", scheduled_date: dateStr, platforms: [] }) })).json();
    if (j.item) { setItems((prev) => [j.item, ...prev]); setOpenId(j.item.id); }
  }, []);

  const patchEvent = useCallback(async (id: string, patch: Partial<CEvent>) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const j = await (await fetch("/api/content/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) })).json();
    if (j.event) { setEvents((prev) => prev.map((e) => (e.id === id ? j.event : e))); return j.event as CEvent; }
    return null;
  }, []);
  // Quick headcount bump from a tracker card (absolute new signups value).
  const bumpEvent = useCallback((id: string, next: number) => { void patchEvent(id, { signups: Math.max(0, next) }); }, [patchEvent]);

  const openItem = items.find((i) => i.id === openId) ?? null;
  const openEvent = events.find((e) => e.id === editEventId) ?? null;
  const counts = useMemo(() => ({ ideas: ideas.length, proof: proof.length, calendar: items.length, events: events.filter(isUpcomingEvent).length }), [ideas, items, proof, events]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">✍️ Content</h1>
        <p className="text-zinc-500 text-sm mt-0.5">One idea, every platform. Drop it on the calendar, draft it in your voice.</p>
      </div>

      <div>
        <div className="min-w-0">
          {tab === "dashboard" && (
            <MarketingDashboard
              overview={<DashboardTab items={items} ideas={ideas} proof={proof} stories={stories} events={events} posted={posted} onGo={selectTab} />}
              posted={posted}
            />
          )}
          {tab === "calendar" && (
            <div className="space-y-8">
              <CalendarTab items={items} events={events} onOpen={(i) => setOpenId(i.id)} onQuickAdd={quickAdd} onCreateOn={createOn} onReschedule={(id, date) => void patchItem(id, { scheduled_date: date })} />
              <div className="border-t border-zinc-800 pt-8">
                <ContentSpreadsheet items={items} onOpen={(i) => setOpenId(i.id)} onPatch={patchItem} onDelete={delItem} />
              </div>
            </div>
          )}
          {tab === "ideas" && <IdeasTab ideas={ideas} onChanged={load} />}
          {tab === "proof" && <ProofTab proof={proof} onChanged={load} />}
          {tab === "events" && <EventsTab events={events} onChanged={load} onEditEvent={setEditEventId} onBumpEvent={bumpEvent} />}
          {tab === "posted" && <PostedTab posted={posted} onChanged={loadPosted} />}
        </div>

      </div>

      {openItem && <ItemDrawer item={openItem} events={events} proof={proof} onClose={() => setOpenId(null)} onPatch={patchItem} onDelete={delItem} />}
      {openEvent && <EventDrawer event={openEvent} onClose={() => setEditEventId(null)} onPatch={patchEvent} />}
    </div>
  );
}

export default function ContentPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-6 text-sm text-zinc-500">Loading content…</div>}>
      <ContentWorkspace />
    </Suspense>
  );
}
