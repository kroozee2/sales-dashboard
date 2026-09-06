'use client';

import { useState, useRef, useCallback } from 'react';

type Mode = 'idle' | 'recording' | 'processing' | 'done' | 'error';

interface ActionLog {
  tool: string;
  label: string;
  detail?: string;
}

interface GeneratedContent {
  type: string;
  label: string;
  content: string;
}

interface AssistantResult {
  actionLog: ActionLog[];
  summary: string;
  spokenSummary: string;
  generatedContent?: GeneratedContent[];
}

const TOOL_ICONS: Record<string, string> = {
  search_leads: '🔍',
  create_lead: '➕',
  update_lead: '✏️',
  add_lead_note: '📝',
  search_ghl: '🔎',
  find_socials: '🌐',
  search_sales_calls: '📞',
  update_sales_call: '✏️',
  list_fathom_recordings: '🎥',
  sync_fathom_to_call: '🔄',
  generate_message: '💬',
};

const EXAMPLES = [
  'Add Jon Smith as a hot lead. I met him at the Flow Mastermind. Find his email and socials.',
  "Update Doc's sales call — find his Fathom recording and update the objection notes.",
  'Draft an Instagram DM to Sarah Johnson. She is interested in BOARDROOM.',
  'Who are my most recent leads from referrals?',
];

export default function AIPage() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const recognitionRef = useRef<unknown>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;
    setMode('processing');
    setResult(null);
    setErrorMsg('');
    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json() as AssistantResult;
      setResult(data);
      setMode('done');
      // Speak the summary
      if (data.spokenSummary && 'speechSynthesis' in window) {
        const utt = new SpeechSynthesisUtterance(data.spokenSummary);
        utt.rate = 0.88;
        utt.pitch = 0.9;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find((v) => v.name === 'Samantha')
          ?? voices.find((v) => v.name.includes('Ava'))
          ?? voices.find((v) => v.lang === 'en-US' && !v.name.toLowerCase().includes('male'))
          ?? voices.find((v) => v.lang.startsWith('en'));
        if (preferred) utt.voice = preferred;
        window.speechSynthesis.speak(utt);
      }
    } catch (err) {
      setErrorMsg(String(err));
      setMode('error');
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (mode === 'recording') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (recognitionRef.current as any)?.stop();
      setMode('idle');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setErrorMsg('Speech recognition is not supported in this browser. Use Chrome.');
      setMode('error');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as new () => any;
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = 'en-US';
    recognitionRef.current = r;
    r.onresult = (e: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = (e as any).results[0][0].transcript as string;
      setText(transcript);
      void submit(transcript);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
      setErrorMsg(`Mic error: ${e.error}`);
      setMode('error');
    };
    r.onend = () => {

    };
    r.start();
    setMode('recording');
    setResult(null);
    setErrorMsg('');
    setText('');
  }, [mode, submit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void submit(text);
    }
  };

  const copy = (content: string, idx: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const reset = () => {
    setText('');
    setResult(null);
    setMode('idle');
    setErrorMsg('');
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <div className="max-w-2xl mx-auto py-4 flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">AI Assistant</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Type a command or speak it. Works across leads, calls, Fathom, GHL, and messages.
        </p>
      </div>

      {/* Input card */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="E.g. Add Jon Smith as a hot lead from the Flow Mastermind. Find his email and socials, then draft an Instagram DM..."
          rows={5}
          className="w-full bg-transparent text-white placeholder-zinc-500 text-sm p-4 resize-none outline-none"
          disabled={mode === 'processing' || mode === 'recording'}
        />
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-zinc-800">
          {/* Voice button */}
          <button
            onClick={toggleRecording}
            disabled={mode === 'processing'}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'recording'
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            {mode === 'recording' ? '⏹ Stop' : '🎙 Speak'}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-zinc-600 text-xs hidden sm:block">⌘↵ to send</span>
            <button
              onClick={() => void submit(text)}
              disabled={!text.trim() || mode === 'processing' || mode === 'recording'}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {mode === 'processing' ? 'Working…' : 'Run'}
            </button>
          </div>
        </div>
      </div>

      {/* Example chips */}
      {mode === 'idle' && !result && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Try these</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setText(ex)}
                className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-left"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Processing */}
      {mode === 'processing' && (
        <div className="flex items-center gap-3 text-zinc-400 text-sm">
          <span className="inline-block w-4 h-4 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin" />
          Working on it…
        </div>
      )}

      {/* Error */}
      {mode === 'error' && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-sm text-red-300">
          {errorMsg || 'Something went wrong. Please try again.'}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="flex flex-col gap-4">
          {/* Actions taken */}
          {result.actionLog.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex flex-col gap-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-1">Actions taken</p>
              {result.actionLog.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 mt-0.5">{TOOL_ICONS[log.tool] ?? '⚙️'}</span>
                  <span className="text-zinc-200">{log.label}</span>
                  {log.detail && <span className="text-zinc-500 ml-auto text-xs shrink-0">{log.detail}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {result.summary && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-2">Result</p>
              <p className="text-zinc-100 text-sm leading-relaxed">{result.summary}</p>
            </div>
          )}

          {/* Generated content */}
          {result.generatedContent?.map((item, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-blue-400 uppercase tracking-wider font-medium">{item.label}</p>
                <button
                  onClick={() => copy(item.content, i)}
                  className="text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  {copiedIdx === i ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-zinc-200 text-sm whitespace-pre-wrap leading-relaxed">{item.content}</p>
            </div>
          ))}

          {/* Run another */}
          <button
            onClick={reset}
            className="self-start text-sm text-zinc-400 hover:text-white transition-colors"
          >
            ← Run another command
          </button>
        </div>
      )}
    </div>
  );
}
