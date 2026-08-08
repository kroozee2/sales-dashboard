"use client";

import { useEffect, useRef, useState } from "react";

// ─── Local voice hook (browser speech-to-text, same as the content page) ───────
function useVoice(onText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const supported = typeof window !== "undefined" && !!((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
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

type Graphic = { id: string; title: string | null; image_url: string; spec: string | null; format: string | null; created_at: string };

const FORMATS: { key: string; label: string; emoji: string; hint: string }[] = [
  { key: "youtube_thumbnail", label: "YouTube Thumbnail", emoji: "🎬", hint: "16:9 · big bold hook" },
  { key: "instagram_post", label: "Instagram Post", emoji: "📸", hint: "1:1 square" },
  { key: "instagram_story", label: "Story / Reel Cover", emoji: "📱", hint: "9:16 vertical" },
  { key: "carousel", label: "Carousel Slide", emoji: "🎠", hint: "4:5 · one idea" },
  { key: "framework", label: "Framework / Offer", emoji: "📊", hint: "black + gold infographic" },
  { key: "freeform", label: "Freeform", emoji: "🖼️", hint: "anything" },
];

// Starter templates. Framework ones carry an SVG preview; social ones are prompt starters.
const dataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const EXAMPLES: { label: string; format: string; starter: string; svg?: string }[] = [
  {
    label: "YouTube: big hook thumbnail", format: "youtube_thumbnail",
    starter: "A YouTube thumbnail for a video about scaling to $100K months. Huge bold text 'THE $100K SYSTEM' on the left, leave the right third clear for my face, dark background with gold + electric blue accents, an upward arrow.",
  },
  {
    label: "IG: quote / hook post", format: "instagram_post",
    starter: "An Instagram post graphic with a bold hook: 'Leads every day. Sales every week. Clients who stay.' 7-Figure CEO black + gold, my handle @kaptainkroeze small at the bottom.",
  },
  {
    label: "Offer Ascension Ladder", format: "framework",
    starter: "An offer ascension ladder: entry offer at the bottom (widest), highest-ticket at the top (narrowest, solid gold). Each rung shows the name, a one-line note, and the price.",
    svg: `<svg width="800" height="420" viewBox="0 0 800 420" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="420" fill="#0b0b10"/><text x="400" y="40" text-anchor="middle" font-size="26" font-weight="700" fill="#f0d77b" font-family="Georgia, serif">Your Offer Ascension</text><g><rect x="250" y="70" width="300" height="72" rx="12" fill="#d4af37"/><text x="400" y="102" text-anchor="middle" font-size="18" font-weight="700" fill="#14120a">Mastermind</text><text x="400" y="125" text-anchor="middle" font-size="14" fill="#3a2f0a">6-month inner circle · $25K</text></g><g><rect x="200" y="152" width="400" height="72" rx="12" fill="#17141c" stroke="#d4af37" stroke-width="1.5"/><text x="400" y="184" text-anchor="middle" font-size="18" font-weight="700" fill="#f5f2e8">Signature Coaching</text><text x="400" y="207" text-anchor="middle" font-size="14" fill="#b8b2a0">90-day accelerator · $6,000</text></g><g><rect x="150" y="234" width="500" height="72" rx="12" fill="#17141c" stroke="#d4af37" stroke-width="1.5"/><text x="400" y="266" text-anchor="middle" font-size="18" font-weight="700" fill="#f5f2e8">Course + Community</text><text x="400" y="289" text-anchor="middle" font-size="14" fill="#b8b2a0">Self-paced + group · $997</text></g><g><rect x="100" y="316" width="600" height="72" rx="12" fill="#17141c" stroke="#d4af37" stroke-width="1.5"/><text x="400" y="348" text-anchor="middle" font-size="18" font-weight="700" fill="#f5f2e8">$97 Paid Masterclass</text><text x="400" y="371" text-anchor="middle" font-size="14" fill="#b8b2a0">Front-end buyers list · $97</text></g></svg>`,
  },
  {
    label: "Business Systems Map", format: "framework",
    starter: "A systems map of my core business systems as numbered cards: lead generation, sales, fulfillment, retention. Each card has a bold title and a one-line detail.",
    svg: `<svg width="800" height="452" viewBox="0 0 800 452" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="452" fill="#0b0b10"/><text x="400" y="40" text-anchor="middle" font-size="26" font-weight="700" fill="#f0d77b" font-family="Georgia, serif">Your Business Systems</text><g><rect x="60" y="64" width="680" height="80" rx="12" fill="#17141c" stroke="#d4af37" stroke-width="1.5"/><circle cx="100" cy="104" r="20" fill="#d4af37"/><text x="100" y="111" text-anchor="middle" font-size="20" font-weight="700" fill="#14120a">1</text><text x="138" y="98" font-size="19" font-weight="700" fill="#f5f2e8">Lead Generation</text><text x="138" y="124" font-size="14" fill="#b8b2a0">Daily content + DM outreach that fills the pipeline</text></g><g><rect x="60" y="156" width="680" height="80" rx="12" fill="#17141c" stroke="#d4af37" stroke-width="1.5"/><circle cx="100" cy="196" r="20" fill="#d4af37"/><text x="100" y="203" text-anchor="middle" font-size="20" font-weight="700" fill="#14120a">2</text><text x="138" y="190" font-size="19" font-weight="700" fill="#f5f2e8">Sales</text><text x="138" y="216" font-size="14" fill="#b8b2a0">Scriptless calls + DM closes on a weekly rhythm</text></g><g><rect x="60" y="248" width="680" height="80" rx="12" fill="#17141c" stroke="#d4af37" stroke-width="1.5"/><circle cx="100" cy="288" r="20" fill="#d4af37"/><text x="100" y="295" text-anchor="middle" font-size="20" font-weight="700" fill="#14120a">3</text><text x="138" y="282" font-size="19" font-weight="700" fill="#f5f2e8">Fulfillment</text><text x="138" y="308" font-size="14" fill="#b8b2a0">A clear client pathway that delivers the result</text></g><g><rect x="60" y="340" width="680" height="80" rx="12" fill="#17141c" stroke="#d4af37" stroke-width="1.5"/><circle cx="100" cy="380" r="20" fill="#d4af37"/><text x="100" y="387" text-anchor="middle" font-size="20" font-weight="700" fill="#14120a">4</text><text x="138" y="374" font-size="19" font-weight="700" fill="#f5f2e8">Retention + Referral</text><text x="138" y="400" font-size="14" fill="#b8b2a0">Wins, upsells, and referrals that compound LTV</text></g></svg>`,
  },
];

export default function GraphicsStudio() {
  const [format, setFormat] = useState("youtube_thumbnail");
  const [prompt, setPrompt] = useState("");
  const [colors, setColors] = useState("");
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [spec, setSpec] = useState<string | null>(null);
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [library, setLibrary] = useState<Graphic[]>([]);
  const [storing, setStoring] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const promptVoice = useVoice((t) => setPrompt((p) => (p ? p.trimEnd() + " " : "") + t.trim()));
  const refineVoice = useVoice((t) => setRefine((p) => (p ? p.trimEnd() + " " : "") + t.trim()));

  useEffect(() => { void fetch("/api/content/graphics").then((r) => r.json()).then((d) => setLibrary(d.graphics ?? [])).catch(() => {}); }, []);

  async function onRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setUploading(true); setErr(null);
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/content/upload", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setUploading(false);
    if (!r?.url) { setErr(r?.error ?? "Upload failed."); return; }
    setRefUrl(r.url);
  }

  async function generate() {
    if (!prompt.trim() && !refUrl) { setErr("Describe the graphic you want, or upload one to model."); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/content/graphic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, colors, format, exampleImageUrl: refUrl || undefined }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(d.error ?? "Couldn't build that."); return; }
    setImg(d.image_url); setSpec(d.spec); setRefine("");
  }

  async function applyRefine() {
    if (!refine.trim() || !img || !spec) return;
    setBusy(true); setErr(null);
    const res = await fetch("/api/content/graphic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, colors, format, previousSpec: spec, refine }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(d.error ?? "Couldn't apply that."); return; }
    setImg(d.image_url); setSpec(d.spec); setRefine("");
  }

  async function saveToLibrary() {
    if (!img || storing) return;
    const title = window.prompt("Name this graphic:", prompt.slice(0, 60) || FORMATS.find((f) => f.key === format)?.label || "Graphic");
    if (title === null) return;
    setStoring(true); setErr(null);
    const r = await fetch("/api/content/graphics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, image_url: img, spec, format }) }).then((x) => x.json()).catch(() => null);
    setStoring(false);
    if (!r?.graphic) { setErr(r?.error ?? "Save failed."); return; }
    setLibrary((l) => [r.graphic as Graphic, ...l]);
    setJustSaved(true); setTimeout(() => setJustSaved(false), 1500);
  }

  async function deleteSaved(id: string) {
    setLibrary((l) => l.filter((g) => g.id !== id));
    await fetch(`/api/content/graphics?id=${id}`, { method: "DELETE" });
  }

  async function download() {
    if (!img) return;
    try {
      const blob = await fetch(img).then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${(prompt || "graphic").slice(0, 40).replace(/[^a-z0-9]+/gi, "-")}.png`; a.click();
      URL.revokeObjectURL(url);
    } catch { window.open(img, "_blank"); }
  }

  const mic = (v: { listening: boolean; toggle: () => void; supported: boolean }, label: string) =>
    v.supported ? (
      <button onClick={v.toggle} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${v.listening ? "bg-rose-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"}`}>
        {v.listening ? "⏹ Stop" : `🎙️ ${label}`}
      </button>
    ) : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-white font-semibold text-sm">🎨 Graphics studio</p>
        <p className="text-zinc-500 text-xs mt-0.5">YouTube thumbnails, Instagram graphics, framework + offer graphics — in the 7-Figure CEO look. Describe it or speak it, drop in an example to model, edit until it&apos;s right.</p>
      </div>

      {/* Format */}
      <div>
        <p className="text-zinc-400 text-[11px] uppercase tracking-wide mb-1.5">What are you making?</p>
        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map((f) => (
            <button key={f.key} onClick={() => setFormat(f.key)} title={f.hint}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${format === f.key ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
              {f.emoji} {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Describe */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-white font-semibold text-sm">Describe the graphic</p>
          {mic(promptVoice, "Speak it")}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onRefFile} />
        {refUrl ? (
          <div className="flex items-start gap-3 rounded-xl border border-blue-500/40 bg-blue-500/[0.05] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refUrl} alt="to model" className="h-20 rounded-lg border border-zinc-800 object-contain bg-black" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-blue-200">📐 Modeling this graphic</p>
              <p className="text-xs text-zinc-400 mt-0.5">Tell it your changes below — your colors, words, numbers — and it recreates the structure with them.</p>
              <button onClick={() => setRefUrl(null)} className="text-xs text-zinc-500 hover:text-rose-400 mt-1.5">✕ Remove</button>
            </div>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full text-sm text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700 rounded-xl py-2 transition-colors">
            {uploading ? "Uploading…" : "📐 Upload a graphic / thumbnail to model (optional)"}
          </button>
        )}
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
          placeholder={refUrl ? `Your changes: e.g. "use my colors, make the text 'THE $100K SYSTEM', my face on the right…"` : "e.g. A YouTube thumbnail: huge bold 'RING THE BELL' text, gold on black, an upward chart arrow, room for my face on the right…"}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
        <input value={colors} onChange={(e) => setColors(e.target.value)}
          placeholder="🎨 Your colors (optional) — e.g. deep navy + neon green, or leave for black + gold"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
        {err && <p className="text-rose-400 text-xs">{err}</p>}
        <button onClick={() => void generate()} disabled={busy}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:brightness-110 disabled:opacity-50 text-white text-sm font-bold transition-all">
          {busy && !img ? "🎨 Designing… (about a minute)" : img ? "↻ Start a new graphic" : "✨ Make my graphic"}
        </button>
      </div>

      {/* Result + refine */}
      {img && (
        <div className="bg-zinc-900 border border-blue-500/30 rounded-2xl p-4 space-y-3">
          <div className="rounded-xl overflow-hidden border border-zinc-800 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="your graphic" className="w-full block" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => void saveToLibrary()} disabled={storing} className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-colors">{justSaved ? "✓ Saved" : storing ? "Saving…" : "💾 Save it"}</button>
            <button onClick={() => void download()} className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors">⬇ Download PNG</button>
          </div>
          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-white font-semibold text-sm">✍️ Edit it — tell it what to change</p>
              {mic(refineVoice, "Speak the change")}
            </div>
            <textarea value={refine} onChange={(e) => setRefine(e.target.value)} rows={2}
              placeholder="e.g. make the text bigger, change it to 'FIRST $100K MONTH', warmer background…"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y" />
            <button onClick={() => void applyRefine()} disabled={busy || !refine.trim()} className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-xs font-semibold transition-colors">{busy && img ? "Redrawing…" : "✨ Apply the change"}</button>
          </div>
        </div>
      )}

      {/* Saved library */}
      {library.length > 0 && (
        <div>
          <p className="text-zinc-400 text-[11px] uppercase tracking-wide mb-2">💾 Your saved graphics</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {library.map((g) => (
              <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.image_url} alt={g.title ?? ""} className="w-full block bg-black" />
                <div className="p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-white font-semibold truncate">{g.title}</p>
                    <p className="text-[10px] text-zinc-600">{new Date(g.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {g.spec && <button onClick={() => { setImg(g.image_url); setSpec(g.spec); setPrompt(g.title ?? ""); if (g.format) setFormat(g.format); setRefine(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} title="Open to edit" className="text-zinc-500 hover:text-blue-300 text-xs">✏️</button>}
                    <a href={g.image_url} download target="_blank" rel="noreferrer" title="Download" className="text-zinc-500 hover:text-white text-xs">⬇</a>
                    <button onClick={() => void deleteSaved(g.id)} title="Delete" className="text-zinc-600 hover:text-rose-400 text-xs">🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Templates to model */}
      <div>
        <p className="text-zinc-400 text-[11px] uppercase tracking-wide mb-2">Templates to model</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {EXAMPLES.map((ex) => (
            <div key={ex.label} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {ex.svg
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={dataUri(ex.svg)} alt={ex.label} className="w-full block" />
                : <div className="h-28 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-3xl">{FORMATS.find((f) => f.key === ex.format)?.emoji}</div>}
              <div className="p-2.5 flex items-center justify-between gap-2">
                <p className="text-xs text-white font-semibold">{ex.label}</p>
                <button onClick={() => { setFormat(ex.format); setPrompt(ex.starter); setImg(null); setSpec(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold flex-shrink-0">✍️ Model this</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
