'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type Phase = 'closed' | 'open' | 'recording' | 'processing' | 'result' | 'error';

interface ActionLog { tool: string; label: string; detail?: string; ok?: boolean }
interface GeneratedContent { type: string; label: string; content: string }
interface AssistantResult {
  status?: 'done' | 'partial' | 'nothing' | 'error';
  changed?: number;
  failed?: number;
  actionLog: ActionLog[];
  summary: string;
  generatedContent?: GeneratedContent[];
}

const TOOL_ICONS: Record<string, string> = {
  search_leads: '🔍', create_lead: '➕', update_lead: '✏️', add_lead_note: '📝',
  search_ghl: '🔎', find_socials: '🌐', search_sales_calls: '📞', update_sales_call: '✏️',
  list_fathom_recordings: '🎥', sync_fathom_to_call: '🔄', generate_message: '💬',
};

const HINTS = [
  'Move Sarah Kim to Hot Prospect and note she needs 30 days',
  'Add a note to Doc — he wants to start after his launch',
  'Find Doc\'s Fathom recording and sync it to his call',
  'Draft an IG DM to Sarah — she\'s interested in BOARDROOM',
];

export function AIAssistant() {
  const [phase, setPhase] = useState<Phase>('closed');
  const [text, setText] = useState('');
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [hintIdx] = useState(() => Math.floor(Math.random() * HINTS.length));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const stoppingRef = useRef(false);

  useEffect(() => {
    if (phase === 'open') setTimeout(() => textareaRef.current?.focus(), 80);
  }, [phase]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPhase('closed'); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const submit = useCallback(async (transcript: string) => {
    if (!transcript.trim()) { setPhase('open'); return; }
    setPhase('processing');
    setResult(null);
    setErrorMsg('');
    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as AssistantResult;
      setResult(data);
      setPhase('result');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, []);

  const stopRecording = useCallback(() => {
    stoppingRef.current = true;
    recognitionRef.current?.stop();
    const captured = finalTranscriptRef.current.trim();
    setText(captured);
    if (captured) void submit(captured);
    else setPhase('open');
  }, [submit]);

  const startRecording = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setErrorMsg('Voice input needs Chrome or Safari. You can type your command instead.');
      setPhase('error');
      return;
    }

    // iOS Safari: continuous mode is unsupported and causes 'audio-capture' errors.
    const isIOS = typeof navigator !== 'undefined' &&
      (/iP(hone|ad|od)/.test(navigator.userAgent) ||
       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    // Explicitly request mic permission first. This is what fixes 'audio-capture' on
    // mobile: it prompts for access and confirms a mic exists. We immediately release
    // the stream so the Speech Recognition engine can capture the audio itself.
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      setErrorMsg('Microphone blocked. Allow mic access for this site in your browser settings, then try again. You can type instead.');
      setPhase('error');
      return;
    }

    finalTranscriptRef.current = text ? text + ' ' : '';
    stoppingRef.current = false;
    const r = new SR();
    r.continuous = !isIOS;    // iOS can't do continuous; we restart it on end instead
    r.interimResults = true;  // show words as they land
    r.lang = 'en-US';
    recognitionRef.current = r;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscriptRef.current += chunk + ' ';
        else interim += chunk;
      }
      setText((finalTranscriptRef.current + interim).trimStart());
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // benign, keep going
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setErrorMsg('Microphone blocked. Allow mic access for this site, then try again. You can type instead.');
      } else {
        setErrorMsg(`Mic error: ${e.error}. You can type instead.`);
      }
      setPhase('error');
    };
    r.onend = () => {
      // Auto-stops after silence (and after every phrase on iOS) — resume unless the
      // user tapped Stop. A tiny delay avoids the rapid-restart 'audio-capture' loop.
      if (!stoppingRef.current) {
        setTimeout(() => {
          if (!stoppingRef.current) { try { r.start(); } catch { /* already starting */ } }
        }, 250);
      }
    };
    try { r.start(); setPhase('recording'); } catch { setPhase('open'); }
  }, [text]);

  const reset = () => { setText(''); setResult(null); setPhase('open'); };

  const copy = (content: string, idx: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const isOpen = phase !== 'closed';

  // Status banner styling
  const statusMeta = (() => {
    const s = result?.status;
    if (s === 'partial') return { emoji: '⚠️', label: 'Partly done', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300' };
    if (s === 'nothing') return { emoji: '🤔', label: 'Nothing to change', cls: 'bg-zinc-800 border-zinc-700 text-zinc-400' };
    if (s === 'error') return { emoji: '⚠️', label: 'Failed', cls: 'bg-red-500/15 border-red-500/30 text-red-300' };
    return { emoji: '✅', label: 'Done', cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' };
  })();

  return (
    <div className="fixed bottom-20 lg:bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="w-80 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <span className="text-sm font-semibold text-white">AI Assistant</span>
            </div>
            <button onClick={() => setPhase('closed')} className="text-zinc-500 hover:text-white text-lg leading-none transition-colors">×</button>
          </div>

          {/* Input */}
          {(phase === 'open' || phase === 'recording') && (
            <div className="flex flex-col">
              {phase === 'recording' && (
                <div className="flex items-center gap-2 px-4 pt-3 -mb-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[11px] text-red-400 font-medium">Listening… tap Stop when you&apos;re done</span>
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(text); }}
                placeholder={HINTS[hintIdx]}
                rows={3}
                className="bg-transparent text-white placeholder-zinc-600 text-sm p-4 resize-none outline-none leading-relaxed"
              />
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-zinc-800">
                <button
                  onClick={() => phase === 'recording' ? stopRecording() : startRecording()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    phase === 'recording' ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                  }`}
                >
                  {phase === 'recording' ? '⏹ Stop & Run' : '🎙 Speak'}
                </button>
                {phase !== 'recording' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-700 text-[10px]">⌘↵</span>
                    <button
                      onClick={() => void submit(text)}
                      disabled={!text.trim()}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-xs font-semibold transition-colors"
                    >
                      Run
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Processing */}
          {phase === 'processing' && (
            <div className="flex items-center gap-3 px-4 py-5 text-zinc-400 text-sm">
              <span className="w-4 h-4 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin shrink-0" />
              <span className="truncate">Working: &ldquo;{text.slice(0, 40)}{text.length > 40 ? '…' : ''}&rdquo;</span>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="px-4 py-3 flex flex-col gap-3">
              <p className="text-xs text-red-400">{errorMsg || 'Something went wrong.'}</p>
              <button onClick={reset} className="self-start text-xs text-zinc-500 hover:text-zinc-300">← Try again</button>
            </div>
          )}

          {/* Result */}
          {phase === 'result' && result && (
            <div className="flex flex-col gap-0 max-h-96 overflow-y-auto">
              {/* Status banner */}
              <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 ${statusMeta.cls}`}>
                <span>{statusMeta.emoji}</span>
                <span className="text-sm font-semibold">{statusMeta.label}</span>
                {typeof result.changed === 'number' && result.changed > 0 && (
                  <span className="text-[11px] opacity-80">· {result.changed} update{result.changed === 1 ? '' : 's'} saved</span>
                )}
                {typeof result.failed === 'number' && result.failed > 0 && (
                  <span className="text-[11px] opacity-80">· {result.failed} failed</span>
                )}
              </div>

              {/* Actions — each with a real ✓/✗ */}
              {result.actionLog.length > 0 && (
                <div className="px-4 py-3 flex flex-col gap-1.5 border-b border-zinc-800">
                  {result.actionLog.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0">{log.ok === false ? '✗' : TOOL_ICONS[log.tool] ?? '⚙️'}</span>
                      <span className={log.ok === false ? 'text-red-400' : 'text-zinc-300'}>{log.label}</span>
                      {log.detail && <span className="text-zinc-600 ml-auto shrink-0 text-[10px]">{log.detail}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              {result.summary && (
                <p className="text-sm text-zinc-200 leading-relaxed px-4 py-3 border-b border-zinc-800 whitespace-pre-wrap">{result.summary}</p>
              )}

              {/* Generated content */}
              {result.generatedContent?.map((item, i) => (
                <div key={i} className="px-4 py-3 border-b border-zinc-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">{item.label}</span>
                    <button
                      onClick={() => copy(item.content, i)}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
                    >
                      {copiedIdx === i ? '✓' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{item.content}</p>
                </div>
              ))}

              <button onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-300 px-4 py-3 text-left transition-colors">
                ← Run another command
              </button>
            </div>
          )}
        </div>
      )}

      {/* Trigger */}
      <button
        onClick={() => setPhase(phase === 'closed' ? 'open' : 'closed')}
        title="AI Assistant"
        className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-xl transition-all duration-200 ${
          isOpen ? 'bg-zinc-800 border border-zinc-600 rotate-0 scale-95' : 'bg-gradient-to-br from-blue-600 to-violet-600 hover:scale-105 shadow-blue-500/30'
        }`}
      >
        {isOpen ? '×' : '✦'}
      </button>
    </div>
  );
}
