'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
type Message = { role: 'user' | 'assistant'; content: string };
type ActionLog = { tool: string; label: string; detail?: string; ok?: boolean };
type JarvisResult = {
  status?: 'done' | 'partial' | 'nothing' | 'error';
  summary: string;
  actionLog?: ActionLog[];
  generatedContent?: { label: string; content: string }[];
};

const STARTERS = [
  'Show me my newest leads and flag anything that needs attention.',
  'What happened on my most recent sales calls?',
  'Find Doc’s call and tell me what the main objection was.',
  'Draft a warm follow-up for a hot prospect.',
];

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Working',
  speaking: 'Speaking',
  error: 'Needs attention',
};

export default function JarvisPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'I’m online. Ask me about your pipeline, calls, contacts, or what needs your attention.' },
  ]);
  const [activity, setActivity] = useState<ActionLog[]>([]);
  const [error, setError] = useState('');
  const [cartesiaConfigured, setCartesiaConfigured] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/jarvis/status')
      .then((res) => res.json())
      .then((data: { cartesiaConfigured?: boolean }) => setCartesiaConfigured(Boolean(data.cartesiaConfigured)))
      .catch(() => setCartesiaConfigured(false));
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, phase]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioRef.current) URL.revokeObjectURL(audioRef.current.src);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    if (cartesiaConfigured) {
      try {
        setPhase('speaking');
        const response = await fetch('/api/jarvis/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!response.ok) throw new Error('Cartesia speech unavailable');
        const url = URL.createObjectURL(await response.blob());
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setPhase('idle');
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setPhase('idle');
        };
        await audio.play();
        return;
      } catch {
        // Keep Jarvis usable if Cartesia is temporarily unavailable.
      }
    }

    if ('speechSynthesis' in window) {
      setPhase('speaking');
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.94;
      utterance.pitch = 0.88;
      utterance.onend = () => setPhase('idle');
      utterance.onerror = () => setPhase('idle');
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else {
      setPhase('idle');
    }
  }, [cartesiaConfigured]);

  const runCommand = useCallback(async (command: string) => {
    const clean = command.trim();
    if (!clean || phase === 'thinking') return;

    const history = messages.slice(-12);
    setMessages((current) => [...current, { role: 'user', content: clean }]);
    setInput('');
    setError('');
    setActivity([]);
    setPhase('thinking');

    try {
      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: clean, history }),
      });
      const data = await response.json() as JarvisResult & { error?: string };
      if (!response.ok) throw new Error(data.error || `Jarvis returned ${response.status}`);
      const summary = data.summary || 'I finished, but there was no summary to show.';
      setMessages((current) => [...current, { role: 'assistant', content: summary }]);
      setActivity(data.actionLog || []);
      await speak(summary);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Jarvis could not complete that.';
      setError(message);
      setMessages((current) => [...current, { role: 'assistant', content: `I hit a problem: ${message}` }]);
      setPhase('error');
    }
  }, [messages, phase, speak]);

  const transcribeRecording = useCallback(async (blob: Blob) => {
    setPhase('thinking');
    try {
      const form = new FormData();
      form.set('file', blob, `jarvis.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
      const response = await fetch('/api/jarvis/transcribe', { method: 'POST', body: form });
      const data = await response.json() as { transcript?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'I could not hear that clearly.');
      if (!data.transcript) throw new Error('I did not catch any words. Try again.');
      setInput(data.transcript);
      await runCommand(data.transcript);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Voice transcription failed.');
      setPhase('error');
    }
  }, [runCommand]);

  const stopListening = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const startListening = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferred = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType: preferred });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        void transcribeRecording(blob);
      };
      recorder.start(250);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((seconds) => seconds + 1), 1000);
      setPhase('listening');
    } catch {
      setError('Microphone access is blocked. Allow access for this site, then try again.');
      setPhase('error');
    }
  }, [transcribeRecording]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runCommand(input);
  };

  const clearConversation = () => {
    window.speechSynthesis?.cancel();
    setMessages([{ role: 'assistant', content: 'Fresh conversation. What should we work on?' }]);
    setActivity([]);
    setError('');
    setPhase('idle');
  };

  return (
    <div className="relative min-h-[calc(100vh-8rem)] overflow-hidden rounded-3xl border border-cyan-500/15 bg-[#050b16] shadow-2xl shadow-cyan-950/30">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.06) 1px, transparent 1px)', backgroundSize: '36px 36px', maskImage: 'radial-gradient(circle at 50% 32%, black, transparent 78%)' }} />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[110px]" />

      <div className="relative z-10 grid min-h-[calc(100vh-8rem)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col border-cyan-500/10 xl:border-r">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4 sm:px-7">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Jarvis 🤖</h1>
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> Online
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">Your voice-operated command center for Scale OS</p>
            </div>
            <button onClick={clearConversation} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white">New conversation</button>
          </header>

          <div className="grid flex-1 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="flex items-center justify-center border-b border-white/5 p-7 lg:border-b-0 lg:border-r">
              <div className="flex flex-col items-center text-center">
                <div className={`jarvis-core relative grid h-44 w-44 place-items-center rounded-full sm:h-52 sm:w-52 ${phase === 'listening' ? 'is-listening' : ''} ${phase === 'thinking' ? 'is-thinking' : ''} ${phase === 'speaking' ? 'is-speaking' : ''}`}>
                  <div className="absolute inset-0 animate-[spin_16s_linear_infinite] rounded-full border border-dashed border-cyan-300/25" />
                  <div className="absolute inset-4 animate-[spin_10s_linear_infinite_reverse] rounded-full border border-cyan-400/25 border-l-cyan-300/80" />
                  <div className="absolute inset-9 rounded-full border border-blue-300/20 bg-cyan-400/5 shadow-[inset_0_0_35px_rgba(34,211,238,.18),0_0_45px_rgba(34,211,238,.18)]" />
                  <div className={`grid h-24 w-24 place-items-center rounded-full border border-cyan-200/40 bg-gradient-to-br from-cyan-300/25 via-blue-500/20 to-violet-500/20 text-5xl shadow-[0_0_35px_rgba(34,211,238,.35)] transition-transform duration-300 ${phase === 'speaking' ? 'scale-110' : ''}`}>🤖</div>
                  {phase === 'listening' && <div className="absolute inset-0 animate-ping rounded-full border border-cyan-300/30" />}
                </div>
                <div className="mt-6 font-mono text-xs uppercase tracking-[0.32em] text-cyan-300">{PHASE_LABEL[phase]}</div>
                <div className="mt-2 h-5 text-xs text-slate-500">
                  {phase === 'listening' ? `${recordingTime}s · tap stop when finished` : phase === 'thinking' ? 'Analyzing and taking action' : phase === 'speaking' ? 'Responding through voice' : 'Tap the microphone to begin'}
                </div>
                <div className="mt-5 flex gap-1.5" aria-hidden="true">
                  {[8, 16, 24, 12, 20, 10, 18].map((height, index) => <span key={index} className={`w-1 rounded-full bg-cyan-400/70 ${phase === 'listening' || phase === 'speaking' ? 'animate-pulse' : ''}`} style={{ height }} />)}
                </div>
              </div>
            </div>

            <div className="flex min-h-[520px] flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'assistant' && <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-sm">🤖</div>}
                    <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'rounded-br-md bg-blue-600 text-white shadow-lg shadow-blue-950/30' : 'rounded-bl-md border border-white/8 bg-white/[0.045] text-slate-200'}`}>
                      {message.content}
                    </div>
                  </div>
                ))}
                {phase === 'thinking' && (
                  <div className="flex items-center gap-3 text-sm text-cyan-300/80">
                    <div className="grid h-8 w-8 place-items-center rounded-full border border-cyan-400/20 bg-cyan-400/10">🤖</div>
                    <span className="flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:240ms]" /></span>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>

              <div className="border-t border-white/5 p-4 sm:p-5">
                {error && <div className="mb-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</div>}
                <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-cyan-400/15 bg-black/25 p-2 shadow-[0_0_25px_rgba(34,211,238,.05)] focus-within:border-cyan-400/35">
                  <button
                    type="button"
                    onClick={() => phase === 'listening' ? stopListening() : void startListening()}
                    disabled={phase === 'thinking' || phase === 'speaking'}
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${phase === 'listening' ? 'bg-red-500 text-white shadow-lg shadow-red-950/40' : 'bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20'}`}
                    aria-label={phase === 'listening' ? 'Stop recording' : 'Speak to Jarvis'}
                  >
                    {phase === 'listening' ? '■' : '🎙️'}
                  </button>
                  <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void runCommand(input); } }} rows={1} placeholder="Ask Jarvis anything about your business…" className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-slate-600" />
                  <button type="submit" disabled={!input.trim() || phase === 'thinking'} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400 text-lg font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Send command">↑</button>
                </form>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STARTERS.slice(0, 3).map((starter) => <button key={starter} onClick={() => void runCommand(starter)} className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-[11px] text-slate-500 transition hover:border-cyan-400/20 hover:text-cyan-200">{starter}</button>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="border-t border-cyan-500/10 bg-black/10 p-5 xl:border-t-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Live activity</h2>
            <span className="font-mono text-[10px] text-slate-600">SYSTEM LOG</span>
          </div>
          <div className="mt-4 space-y-3">
            {activity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.02] p-5 text-center">
                <div className="text-2xl opacity-50">⚡</div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">Actions Jarvis takes will appear here in real time.</p>
              </div>
            ) : activity.map((item, index) => (
              <div key={`${item.tool}-${index}`} className="rounded-xl border border-white/7 bg-white/[0.035] p-3">
                <div className="flex gap-2.5">
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${item.ok === false ? 'bg-red-400' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.7)]'}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-300">{item.label}</p>
                    {item.detail && <p className="mt-1 truncate text-[10px] text-slate-600">{item.detail}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Connections</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ['Sales OS', true],
                ['Fathom', true],
                ['GoHighLevel', true],
                ['Cartesia', cartesiaConfigured],
              ].map(([label, connected]) => (
                <div key={String(label)} className="rounded-xl border border-white/7 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />{label}</div>
                  <p className="mt-1 text-[9px] uppercase tracking-wider text-slate-700">{connected ? 'Connected' : 'Setup needed'}</p>
                </div>
              ))}
            </div>
          </div>

          {!cartesiaConfigured && (
            <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-3 text-[11px] leading-relaxed text-amber-200/70">
              Jarvis is usable now with browser voice. Add <code className="text-amber-200">CARTESIA_API_KEY</code> and <code className="text-amber-200">CARTESIA_VOICE_ID</code> in Vercel to activate Cartesia Ink + Sonic.
            </div>
          )}

          <div className="mt-7 rounded-2xl border border-cyan-400/10 bg-gradient-to-br from-cyan-400/[0.07] to-blue-500/[0.03] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">Current reach</div>
            <ul className="mt-3 space-y-2 text-xs text-slate-500">
              <li>• Read and update leads</li>
              <li>• Inspect calls and recordings</li>
              <li>• Search GHL contacts</li>
              <li>• Draft follow-up messages</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
