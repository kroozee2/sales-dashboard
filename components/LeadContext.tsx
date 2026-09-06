"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ScreenshotAnalysis {
  summary: string;
  about_them: string;
  signals: string[];
  stage: string;
  next_message: string;
  questions: string[];
  watch_outs: string[];
}

export interface LeadScreenshot {
  id: string;
  lead_id: string;
  image_url: string;
  analysis: ScreenshotAnalysis;
  created_at: string;
}

// Read a File into a base64 data URL
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Upload + analyze a conversation screenshot against a lead
export async function saveScreenshotContext(leadId: string, file: File): Promise<LeadScreenshot> {
  const dataUrl = await fileToBase64(file);
  const res = await fetch(`/api/leads/${leadId}/screenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageData: dataUrl, mimeType: file.type || "image/png" }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.screenshot as LeadScreenshot;
}

function CopyLine({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="w-full text-left bg-zinc-950/60 border border-zinc-800 hover:border-blue-600/50 rounded-xl px-3 py-2.5 transition-colors group"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide">{label}</span>
        <span className={`text-[10px] font-semibold ${copied ? "text-emerald-400" : "text-zinc-600 group-hover:text-blue-400"}`}>
          {copied ? "✓ Copied" : "tap to copy"}
        </span>
      </div>
      <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
    </button>
  );
}

function AnalysisCard({ shot, onDelete }: { shot: LeadScreenshot; onDelete: () => void }) {
  const a = shot.analysis ?? ({} as ScreenshotAnalysis);
  const [openImg, setOpenImg] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex gap-3 p-3">
        <button onClick={() => setOpenImg((v) => !v)} className="flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.image_url} alt="Conversation screenshot" className="w-16 h-16 rounded-xl object-cover border border-zinc-800 hover:border-blue-500/50 transition-colors" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {a.stage && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">{a.stage}</span>}
            <button onClick={onDelete} title="Delete" className="text-zinc-600 hover:text-rose-400 text-xs flex-shrink-0">🗑</button>
          </div>
          {a.summary && <p className="text-zinc-300 text-xs mt-1.5 leading-relaxed">{a.summary}</p>}
          <p className="text-zinc-600 text-[10px] mt-1">{new Date(shot.created_at).toLocaleString()}</p>
        </div>
      </div>

      {openImg && (
        <a href={shot.image_url} target="_blank" rel="noreferrer" className="block px-3 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.image_url} alt="Conversation screenshot" className="w-full rounded-xl border border-zinc-800" />
        </a>
      )}

      <div className="px-3 pb-3 space-y-2.5">
        {a.about_them && (
          <div>
            <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-1">👤 About them</p>
            <p className="text-zinc-300 text-xs leading-relaxed">{a.about_them}</p>
          </div>
        )}

        {a.signals?.length > 0 && (
          <div>
            <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-1">🔎 Signals</p>
            <ul className="space-y-1">
              {a.signals.map((s, i) => <li key={i} className="text-zinc-300 text-xs leading-relaxed flex gap-1.5"><span className="text-emerald-400">•</span>{s}</li>)}
            </ul>
          </div>
        )}

        {a.next_message && <CopyLine label="💬 Say this next" text={a.next_message} />}

        {a.questions?.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide">❓ Ask next</p>
            {a.questions.map((q, i) => <CopyLine key={i} label={`Option ${i + 1}`} text={q} />)}
          </div>
        )}

        {a.watch_outs?.length > 0 && (
          <div>
            <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-1">⚠️ Watch out</p>
            <ul className="space-y-1">
              {a.watch_outs.map((w, i) => <li key={i} className="text-amber-300/80 text-xs leading-relaxed flex gap-1.5"><span>•</span>{w}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function LeadContextPanel({ leadId }: { leadId: string }) {
  const [shots, setShots] = useState<LeadScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/screenshot`);
      const json = await res.json();
      setShots((json.screenshots ?? []) as LeadScreenshot[]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const handleFile = useCallback(async (file: File) => {
    pending.current = file;
    setPreview(await fileToBase64(file));
    setErr(null);
  }, []);

  // paste-to-add
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) void handleFile(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile]);

  async function analyze() {
    if (!pending.current) return;
    setBusy(true); setErr(null);
    try {
      const shot = await saveScreenshotContext(leadId, pending.current);
      setShots((p) => [shot, ...p]);
      pending.current = null;
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that screenshot");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    setShots((p) => p.filter((s) => s.id !== id));
    await fetch(`/api/leads/${leadId}/screenshot`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screenshotId: id }),
    });
  }

  return (
    <div className="p-4 space-y-4">
      {/* Uploader */}
      <div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-zinc-700 hover:border-blue-500/60 rounded-2xl p-5 text-center transition-colors"
        >
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="Screenshot preview" className="max-h-48 mx-auto rounded-xl border border-zinc-800" />
          ) : (
            <>
              <p className="text-2xl mb-1">📸</p>
              <p className="text-zinc-300 text-sm font-medium">Add a conversation screenshot</p>
              <p className="text-zinc-600 text-xs mt-0.5">Click to upload, or paste an image</p>
            </>
          )}
        </button>

        {preview && (
          <div className="flex gap-2 mt-2">
            <button onClick={analyze} disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:opacity-90 disabled:opacity-50 text-white text-sm font-semibold transition-opacity">
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Reading the conversation…
                </span>
              ) : "🤖 Read it & save the context"}
            </button>
            <button onClick={() => { pending.current = null; setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">Clear</button>
          </div>
        )}

        {err && <p className="text-rose-400 text-xs mt-2">{err}</p>}
      </div>

      {/* Saved context */}
      {loading ? (
        <p className="text-zinc-600 text-sm text-center py-6 animate-pulse">Loading context…</p>
      ) : shots.length === 0 ? (
        <p className="text-zinc-600 text-xs text-center py-4">No conversation context saved yet. Drop in a screenshot and I&apos;ll tell you exactly what to say next.</p>
      ) : (
        <div className="space-y-3">
          {shots.map((s) => <AnalysisCard key={s.id} shot={s} onDelete={() => void del(s.id)} />)}
        </div>
      )}
    </div>
  );
}
