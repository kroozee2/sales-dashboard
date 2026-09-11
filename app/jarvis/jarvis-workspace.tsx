'use client';

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Bot, Library, Network, Sparkles } from 'lucide-react';
import { AgentSkillsCatalog, AgentWorkforceDashboard } from '@/components/agent-workforce-dashboard';
import { JARVIS_INTERNAL_WORKERS, JARVIS_PROFILE } from '@/lib/agent-workforce-jarvis';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
type WorkspaceTab = 'jarvis' | 'core' | 'subagent' | 'skills';
type Message = { role: 'user' | 'assistant'; content: string; alert?: boolean };
type ActionLog = { tool: string; label: string; detail?: string; ok?: boolean };
type JarvisResult = {
  status?: 'done' | 'partial' | 'nothing' | 'error';
  summary: string;
  actionLog?: ActionLog[];
  generatedContent?: { type: string; label: string; content: string }[];
  generatedContentOmitted?: number;
  readOnly?: boolean;
  mutationNotice?: string;
  changed?: number;
  failed?: number;
};

const STARTERS = [
  'List my newest leads with stage, quality, source, and note excerpts.',
  'List my recent sales calls with outcomes, bounded objection and note excerpts, deal amounts, and recording links.',
  'Find Doc’s call and show bounded excerpts of recorded objections and objection notes.',
  'Draft a warm follow-up for a hot prospect.',
];

const JARVIS_WORKER_STAGE_LABEL: Record<string, string> = {
  planned: 'Planned', designed: 'Designed', building: 'Building', testing: 'Testing', live: 'Released', paused: 'Paused',
};

const JARVIS_WORKER_STAGE: Record<string, string> = {
  planned: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
  designed: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
  building: 'border-blue-500/25 bg-blue-500/10 text-blue-300',
  testing: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  live: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  paused: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Working',
  speaking: 'Speaking',
  error: 'Needs attention',
};

// Shown when the workforce cannot be loaded because this browser is not signed
// in as an owner. It names the reason rather than quietly showing something
// else, and points at the one action that resolves it.
function WorkforceLocked({ checked, view }: { checked: boolean; view: 'core' | 'subagent' | 'skills' }) {
  const label = view === 'core' ? 'Core Agents' : view === 'subagent' ? 'Sub-agents' : 'Skills';
  if (!checked) {
    return (
      <div role="status" className="rounded-3xl border border-white/[0.07] bg-[#090a0d] p-8 text-center text-sm text-zinc-400">
        Checking your access to the AI workforce…
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-[#090a0d] p-8 text-center sm:p-10">
      <div aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-xl">🔒</div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-white">{label} needs an owner sign-in</h2>
      <p className="mx-auto mt-3 max-w-md break-words text-sm leading-6 text-zinc-400 [overflow-wrap:anywhere]">
        This browser is signed in to Sales OS but is not recognised as an owner account, so the agent definitions stay locked. Signing in again restores access.
      </p>
      <a
        href={`/login?next=${encodeURIComponent(`/jarvis?tab=${view}`)}`}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
      >
        Sign in to continue
      </a>
      <p className="mt-4 text-xs text-zinc-400">Jarvis stays available on its own tab either way.</p>
    </div>
  );
}

export default function JarvisWorkspace({ initialTab }: { initialTab: WorkspaceTab }) {
  // The route-supplied tab is authoritative. Local state makes in-page tabs
  // immediate, while the synchronization effect clears any stale selection
  // whenever App Router supplies a new query-backed destination.
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(initialTab);
  const [routeTab, setRouteTab] = useState<WorkspaceTab>(initialTab);
  if (routeTab !== initialTab) {
    setRouteTab(initialTab);
    setWorkspaceTab(initialTab);
  }
  const [workforceOwnerId, setWorkforceOwnerId] = useState<string | null>(null);
  const [workforceChecked, setWorkforceChecked] = useState(false);
  const [workforceEditorOpen, setWorkforceEditorOpen] = useState(false);
  // The workforce tabs exist only for an owner. Anyone else deep linking into
  // them lands back on Jarvis rather than on an empty panel.
  // A visitor who is not a recognised owner still lands on the workspace they
  // asked for. Sending them to the Jarvis assistant instead made a sidebar
  // entry look broken: you clicked Core Agents and got a read-only chat.
  const [workspaceNotice, setWorkspaceNotice] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [commandInFlight, setCommandInFlight] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'I’m ready for read-only lookups. Ask me to list leads, calls, contacts, recordings, or draft a message.' },
  ]);
  const [activity, setActivity] = useState<ActionLog[]>([]);
  const [generatedContent, setGeneratedContent] = useState<{ label: string; content: string }[]>([]);
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState('');
  const [cartesiaConfigured, setCartesiaConfigured] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const jarvisActiveRef = useRef(true);
  const microphoneEpochRef = useRef(0);
  const microphoneStartingRef = useRef<number | null>(null);
  const operationEpochRef = useRef(0);
  const commandRunningRef = useRef(false);
  const commandHistoryGuardId = `jarvis-command-${useId()}`;
  const commandHistoryGenerationRef = useRef(0);
  const abortControllersRef = useRef(new Set<AbortController>());
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
    const controller = new AbortController();
    fetch('/api/team', { signal: controller.signal })
      .then((res) => res.ok ? res.json() : null)
      .then((data: { me?: { id?: string; role?: string; active?: boolean } } | null) => {
        if (!controller.signal.aborted) setWorkforceOwnerId(data?.me?.role === 'owner' && data.me.active === true && typeof data.me.id === 'string' ? data.me.id : null);
      })
      .catch(() => { if (!controller.signal.aborted) setWorkforceOwnerId(null); })
      .finally(() => { if (!controller.signal.aborted) setWorkforceChecked(true); });
    return () => controller.abort();
  }, []);


  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, phase]);

  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    jarvisActiveRef.current = true;
    return () => {
      discardRecordingRef.current = true;
      jarvisActiveRef.current = false;
      microphoneEpochRef.current += 1;
      operationEpochRef.current += 1;
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
      commandRunningRef.current = false;
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) URL.revokeObjectURL(audioRef.current.src);
    };
  }, []);

  useEffect(() => {
    const generation = ++commandHistoryGenerationRef.current;
    const guardId = commandHistoryGuardId;
    if (!commandInFlight) {
      if (window.history.state?.jarvisCommandGuard === guardId) queueMicrotask(() => {
        if (commandHistoryGenerationRef.current === generation && window.history.state?.jarvisCommandGuard === guardId) window.history.back();
      });
      return;
    }
    if (window.history.state?.jarvisCommandGuard !== guardId) window.history.pushState({ ...window.history.state, jarvisCommandGuard: guardId }, '');
    const warning = 'Jarvis is still finishing this read-only analysis. Wait for the result before leaving.';
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!commandRunningRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const onDocumentClick = (event: MouseEvent) => {
      if (!commandRunningRef.current || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target.toLowerCase() !== '_self')) return;
      const destination = new URL(anchor.href, window.location.href);
      const current = window.location;
      if (destination.origin === current.origin && destination.pathname === current.pathname && destination.search === current.search) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setError(warning);
    };
    const onPopState = (event: PopStateEvent) => {
      if (!commandRunningRef.current || event.state?.jarvisCommandGuard === guardId) return;
      window.history.forward();
      setError(warning);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, [commandHistoryGuardId, commandInFlight]);

  const trackedFetch = useCallback(async <T,>(url: string, init: RequestInit, epoch: number, readBody: (response: Response) => Promise<T>) => {
    const controller = new AbortController();
    abortControllersRef.current.add(controller);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!jarvisActiveRef.current || operationEpochRef.current !== epoch) throw new DOMException('Jarvis operation cancelled', 'AbortError');
      const data = await readBody(response);
      if (!jarvisActiveRef.current || operationEpochRef.current !== epoch) throw new DOMException('Jarvis operation cancelled', 'AbortError');
      return { response, data };
    } finally {
      abortControllersRef.current.delete(controller);
    }
  }, []);

  const speak = useCallback(async (text: string, epoch = operationEpochRef.current) => {
    if (!text.trim() || !jarvisActiveRef.current || operationEpochRef.current !== epoch) return;
    if (cartesiaConfigured) {
      try {
        setPhase('speaking');
        const { response, data: blob } = await trackedFetch('/api/jarvis/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }, epoch, (result) => result.blob());
        if (!response.ok) throw new Error('Cartesia speech unavailable');
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        let urlActive = true;
        const releaseAudio = () => {
          if (urlActive) URL.revokeObjectURL(url);
          urlActive = false;
          if (audioRef.current === audio) audioRef.current = null;
        };
        audio.onended = () => {
          releaseAudio();
          if (operationEpochRef.current === epoch) setPhase('idle');
        };
        audio.onerror = () => {
          releaseAudio();
          if (operationEpochRef.current === epoch) setPhase('idle');
        };
        if (!jarvisActiveRef.current || operationEpochRef.current !== epoch) { releaseAudio(); return; }
        try {
          await audio.play();
        } catch {
          audio.pause();
          releaseAudio();
          throw new Error('Cartesia playback unavailable');
        }
        if (!jarvisActiveRef.current || operationEpochRef.current !== epoch) { audio.pause(); releaseAudio(); }
        return;
      } catch (caught) {
        if (!jarvisActiveRef.current || operationEpochRef.current !== epoch || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        // Keep Jarvis usable if Cartesia is temporarily unavailable.
      }
    }

    if (!jarvisActiveRef.current || operationEpochRef.current !== epoch) return;
    if ('speechSynthesis' in window) {
      setPhase('speaking');
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.94;
      utterance.pitch = 0.88;
      utterance.onend = () => { if (operationEpochRef.current === epoch) setPhase('idle'); };
      utterance.onerror = () => { if (operationEpochRef.current === epoch) setPhase('idle'); };
      window.speechSynthesis.cancel();
      if (jarvisActiveRef.current && operationEpochRef.current === epoch) window.speechSynthesis.speak(utterance);
    } else {
      setPhase('idle');
    }
  }, [cartesiaConfigured, trackedFetch]);

  const runCommand = useCallback(async (command: string) => {
    const clean = command.trim();
    if (!jarvisActiveRef.current) return;
    if (!clean || commandRunningRef.current || phase === 'thinking' || phase === 'listening' || phase === 'speaking') return;

    const epoch = operationEpochRef.current;
    commandRunningRef.current = true;
    setCommandInFlight(true);
    const history = messages.slice(-12);
    setMessages((current) => [...current, { role: 'user', content: clean }]);
    setInput('');
    setError('');
    setActivity([]);
    setGeneratedContent([]);
    setCopyStatus('');
    setPhase('thinking');

    try {
      const { response, data } = await trackedFetch<JarvisResult & { error?: string }>('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: clean, history }),
      }, epoch, (result) => result.json());
      if (!response.ok) throw new Error(data.error || `Jarvis returned ${response.status}`);
      const serverNotice = data.readOnly && data.changed === 0 ? (data.mutationNotice || 'Read-only result. No SalesOS records were changed.') : 'Result integrity could not be verified.';
      const groundedSummary = data.summary?.startsWith(serverNotice) ? data.summary : `${serverNotice}\n\n${data.summary || 'No analysis was returned.'}`;
      const artifactEnvelopeValid = Array.isArray(data.generatedContent)
        && data.generatedContent.length <= 10
        && Number.isInteger(data.generatedContentOmitted) && (data.generatedContentOmitted ?? -1) >= 0
        && data.generatedContent.every((item) => item && typeof item === 'object' && !Array.isArray(item)
          && Object.keys(item).sort().join(',') === 'content,label,type'
          && item.type === 'message_draft' && item.label === 'AI-generated message draft, not sent'
          && typeof item.content === 'string' && item.content.length <= 4000);
      const artifactProblem = !artifactEnvelopeValid;
      const omittedDrafts = artifactEnvelopeValid ? data.generatedContentOmitted ?? 0 : 0;
      const alert = data.status === 'partial' || data.status === 'error' || artifactProblem || omittedDrafts > 0;
      const resultNotice = data.status === 'partial'
        ? `Partial result: ${typeof data.failed === 'number' ? data.failed : 'one or more'} lookup${data.failed === 1 ? '' : 's'} failed. Successful verified results follow.\n\n`
        : data.status === 'error' ? 'Lookup failed. No unverified result is displayed.\n\n' : '';
      const artifactNotice = artifactProblem ? 'Draft artifacts failed validation and were withheld.\n\n' : omittedDrafts > 0 ? `${omittedDrafts} additional message draft${omittedDrafts === 1 ? '' : 's'} omitted due to the 10-draft display limit.\n\n` : '';
      const summary = `${resultNotice}${artifactNotice}${groundedSummary}`;
      const drafts = artifactEnvelopeValid ? data.generatedContent!.map((item) => ({ label: item.label, content: item.content })) : [];
      setMessages((current) => [...current, { role: 'assistant', content: summary, alert }]);
      setActivity(data.actionLog || []);
      setGeneratedContent(drafts);
      await speak(summary, epoch);
    } catch (caught) {
      if (!jarvisActiveRef.current || operationEpochRef.current !== epoch || (caught instanceof DOMException && caught.name === 'AbortError')) return;
      const message = caught instanceof Error ? caught.message : 'Jarvis could not complete that.';
      setError(message);
      setMessages((current) => [...current, { role: 'assistant', content: `I hit a problem: ${message}` }]);
      setPhase('error');
    } finally {
      if (operationEpochRef.current === epoch) {
        commandRunningRef.current = false;
        setCommandInFlight(false);
      }
    }
  }, [messages, phase, speak, trackedFetch]);

  const transcribeRecording = useCallback(async (blob: Blob) => {
    const epoch = operationEpochRef.current;
    if (!jarvisActiveRef.current) return;
    setPhase('thinking');
    try {
      const form = new FormData();
      form.set('file', blob, `jarvis.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
      const { response, data } = await trackedFetch<{ transcript?: string; error?: string }>('/api/jarvis/transcribe', { method: 'POST', body: form }, epoch, (result) => result.json());
      if (!response.ok) throw new Error(data.error || 'I could not hear that clearly.');
      if (!data.transcript) throw new Error('I did not catch any words. Try again.');
      setInput(data.transcript);
      await runCommand(data.transcript);
    } catch (caught) {
      if (!jarvisActiveRef.current || operationEpochRef.current !== epoch || (caught instanceof DOMException && caught.name === 'AbortError')) return;
      setError(caught instanceof Error ? caught.message : 'Voice transcription failed.');
      setPhase('error');
    }
  }, [runCommand, trackedFetch]);

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      if (recorder.state !== 'inactive') {
        recorder.stop();
        streamRef.current?.getTracks().forEach((track) => track.stop());
      }
      return;
    }
    microphoneEpochRef.current += 1;
    microphoneStartingRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecordingTime(0);
    setPhase('idle');
  }, []);

  const startListening = useCallback(async () => {
    if (!jarvisActiveRef.current) return;
    if (microphoneStartingRef.current !== null || mediaRecorderRef.current) return;
    const microphoneEpoch = ++microphoneEpochRef.current;
    const operationEpoch = operationEpochRef.current;
    microphoneStartingRef.current = microphoneEpoch;
    setError('');
    setPhase('listening');
    let acquiredStream: MediaStream | null = null;
    let createdRecorder: MediaRecorder | null = null;
    let createdTimer: ReturnType<typeof setInterval> | null = null;
    const recordingChunks: Blob[] = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      acquiredStream = stream;
      if (!jarvisActiveRef.current || microphoneEpochRef.current !== microphoneEpoch || mediaRecorderRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      discardRecordingRef.current = false;
      chunksRef.current = recordingChunks;
      const preferred = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType: preferred });
      createdRecorder = recorder;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recordingChunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (createdTimer) clearInterval(createdTimer);
        const ownsRecorder = microphoneEpochRef.current === microphoneEpoch && mediaRecorderRef.current === recorder;
        if (!ownsRecorder) return;
        mediaRecorderRef.current = null;
        if (streamRef.current === stream) streamRef.current = null;
        if (timerRef.current === createdTimer) timerRef.current = null;
        if (chunksRef.current === recordingChunks) chunksRef.current = [];
        if (!jarvisActiveRef.current || operationEpochRef.current !== operationEpoch || discardRecordingRef.current) {
          setRecordingTime(0);
          if (operationEpochRef.current === operationEpoch) setPhase('idle');
          return;
        }
        const blob = new Blob(recordingChunks, { type: recorder.mimeType });
        void transcribeRecording(blob);
      };
      recorder.start(250);
      setRecordingTime(0);
      createdTimer = setInterval(() => {
        if (microphoneEpochRef.current === microphoneEpoch && mediaRecorderRef.current === recorder) {
          setRecordingTime((seconds) => seconds + 1);
        }
      }, 1000);
      timerRef.current = createdTimer;
    } catch {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      if (createdTimer) clearInterval(createdTimer);
      const ownsGeneration = microphoneEpochRef.current === microphoneEpoch;
      if (ownsGeneration) {
        if (createdRecorder) {
          createdRecorder.ondataavailable = null;
          createdRecorder.onstop = null;
          if (createdRecorder.state !== 'inactive') {
            try { createdRecorder.stop(); } catch { /* already stopped */ }
          }
        }
        if (mediaRecorderRef.current === createdRecorder) mediaRecorderRef.current = null;
        if (streamRef.current === acquiredStream) streamRef.current = null;
        if (timerRef.current === createdTimer) timerRef.current = null;
        if (chunksRef.current === recordingChunks) chunksRef.current = [];
        discardRecordingRef.current = true;
        setRecordingTime(0);
        if (jarvisActiveRef.current) {
          setError('Microphone access is blocked. Allow access for this site, then try again.');
          setPhase('error');
        }
      }
    } finally {
      if (microphoneStartingRef.current === microphoneEpoch) microphoneStartingRef.current = null;
    }
  }, [transcribeRecording]);

  const deactivateJarvis = useCallback(() => {
    discardRecordingRef.current = true;
    microphoneEpochRef.current += 1;
    microphoneStartingRef.current = null;
    operationEpochRef.current += 1;
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    const timer = timerRef.current;
    mediaRecorderRef.current = null;
    streamRef.current = null;
    timerRef.current = null;
    chunksRef.current = [];
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* already stopped */ }
    }
    stream?.getTracks().forEach((track) => track.stop());
    if (timer) clearInterval(timer);
    setRecordingTime(0);
    const activeAudio = audioRef.current;
    activeAudio?.pause();
    if (activeAudio?.src) URL.revokeObjectURL(activeAudio.src);
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setPhase('idle');
  }, []);

  const selectWorkspaceTab = useCallback((nextTab: WorkspaceTab): boolean => {
    if (commandRunningRef.current) {
      setWorkspaceNotice('Jarvis is finishing the current command. Wait for the result before switching workspaces.');
      return false;
    }
    if (workforceEditorOpen) {
      setWorkspaceNotice('Close the agent editor before switching workspaces. The editor will confirm before discarding unsaved changes.');
      return false;
    }
    setWorkspaceNotice('');
    jarvisActiveRef.current = nextTab === 'jarvis';
    if (nextTab !== 'jarvis') deactivateJarvis();
    setWorkspaceTab(nextTab);
    // Push a real history entry so Back/Forward and sidebar deep links share
    // one URL-backed tab contract instead of competing with a local override.
    const url = nextTab === 'jarvis' ? '/jarvis' : `/jarvis?tab=${nextTab}`;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.pushState(window.history.state, '', url);
    }
    return true;
  }, [deactivateJarvis, workforceEditorOpen]);

  useEffect(() => {
    const tabFromUrl = (): WorkspaceTab => {
      if (window.location.pathname !== '/jarvis') return initialTab;
      const requested = new URLSearchParams(window.location.search).get('tab');
      return requested === 'core' || requested === 'subagent' || requested === 'skills' ? requested : 'jarvis';
    };
    const onPopState = () => {
      const nextTab = tabFromUrl();
      jarvisActiveRef.current = nextTab === 'jarvis';
      if (nextTab !== 'jarvis') deactivateJarvis();
      setWorkspaceNotice('');
      setWorkspaceTab(nextTab);
    };
    const onSidebarNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target.toLowerCase() !== '_self')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname !== '/jarvis') return;
      const requested = destination.searchParams.get('tab');
      const nextTab: WorkspaceTab = requested === 'core' || requested === 'subagent' || requested === 'skills' ? requested : 'jarvis';
      if (!selectWorkspaceTab(nextTab)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // This workspace owns its query-only tab navigation. Handling it here
      // prevents a same-route sidebar click from being discarded as a no-op.
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onSidebarNavigation, true);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onSidebarNavigation, true);
    };
  }, [deactivateJarvis, initialTab, selectWorkspaceTab]);

  const copyGeneratedContent = async (item: { label: string; content: string }) => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopyStatus(`${item.label} copied.`);
    } catch {
      setCopyStatus(`Could not copy ${item.label}. Select the text and copy it manually.`);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runCommand(input);
  };

  const clearConversation = () => {
    if (commandRunningRef.current) {
      setError('Jarvis is finishing the current command. Wait for the result before starting a new conversation.');
      return;
    }
    deactivateJarvis();
    jarvisActiveRef.current = true;
    window.speechSynthesis?.cancel();
    setMessages([{ role: 'assistant', content: 'Fresh conversation. What should we work on?' }]);
    setActivity([]);
    setGeneratedContent([]);
    setCopyStatus('');
    setError('');
    setPhase('idle');
  };

  const workspaceTabs: { id: WorkspaceTab; label: string; icon: typeof Bot }[] = [
    { id: 'jarvis', label: 'Jarvis', icon: Sparkles },
    { id: 'core', label: 'Core Agents', icon: Network },
    { id: 'subagent', label: 'Sub-agents', icon: Bot },
    { id: 'skills', label: 'Skills', icon: Library },
  ];

  return (
    <div className="space-y-4">
      <nav role="tablist" aria-label="AI workforce" className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#090a0d] p-1.5">
        {workspaceTabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            id={`workforce-tab-${id}`}
            role="tab"
            tabIndex={workspaceTab === id ? 0 : -1}
            aria-selected={workspaceTab === id}
            aria-controls={`workforce-panel-${id}`}
            disabled={commandInFlight && id !== 'jarvis'}
            onClick={() => selectWorkspaceTab(id)}
            onKeyDown={(event) => {
              let nextIndex = index;
              if (event.key === 'ArrowRight') nextIndex = (index + 1) % workspaceTabs.length;
              else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + workspaceTabs.length) % workspaceTabs.length;
              else if (event.key === 'Home') nextIndex = 0;
              else if (event.key === 'End') nextIndex = workspaceTabs.length - 1;
              else return;
              event.preventDefault();
              const nextId = workspaceTabs[nextIndex].id;
              if (selectWorkspaceTab(nextId)) window.requestAnimationFrame(() => document.getElementById(`workforce-tab-${nextId}`)?.focus());
            }}
            className={`flex min-h-11 min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 ${workspaceTab === id ? 'border-2 border-cyan-300 bg-white/[0.09] text-white shadow-sm' : 'border-2 border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>
      {workspaceNotice && <div role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{workspaceNotice}</div>}

      <section role="tabpanel" id="workforce-panel-jarvis" aria-labelledby="workforce-tab-jarvis" hidden={workspaceTab !== 'jarvis'}>
        <div className="relative min-h-[calc(100vh-12rem)] overflow-hidden rounded-3xl border border-cyan-500/15 bg-[#050b16] shadow-2xl shadow-cyan-950/30">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.06) 1px, transparent 1px)', backgroundSize: '36px 36px', maskImage: 'radial-gradient(circle at 50% 32%, black, transparent 78%)' }} />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[110px]" />

      <div className="relative z-10 grid min-h-[calc(100vh-8rem)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col border-cyan-500/10 xl:border-r">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4 sm:px-7">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Jarvis <span aria-hidden="true">🤖</span></h1>
                <span className="flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">Read-only</span>
              </div>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">Read-only business lookups and message drafting for Scale OS</p>
            </div>
            <button onClick={clearConversation} disabled={commandInFlight} className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white">New conversation</button>
          </header>

          <div className="grid flex-1 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="flex items-center justify-center border-b border-white/5 p-7 lg:border-b-0 lg:border-r">
              <div className="flex flex-col items-center text-center">
                <div className={`jarvis-core relative grid h-44 w-44 place-items-center rounded-full sm:h-52 sm:w-52 ${phase === 'listening' ? 'is-listening' : ''} ${phase === 'thinking' ? 'is-thinking' : ''} ${phase === 'speaking' ? 'is-speaking' : ''}`}>
                  <div className="absolute inset-0 animate-[spin_16s_linear_infinite] rounded-full border border-dashed border-cyan-300/25" />
                  <div className="absolute inset-4 animate-[spin_10s_linear_infinite_reverse] rounded-full border border-cyan-400/25 border-l-cyan-300/80" />
                  <div className="absolute inset-9 rounded-full border border-blue-300/20 bg-cyan-400/5 shadow-[inset_0_0_35px_rgba(34,211,238,.18),0_0_45px_rgba(34,211,238,.18)]" />
                  <div aria-hidden="true" className={`grid h-24 w-24 place-items-center rounded-full border border-cyan-200/40 bg-gradient-to-br from-cyan-300/25 via-blue-500/20 to-violet-500/20 text-5xl shadow-[0_0_35px_rgba(34,211,238,.35)] transition-transform duration-300 ${phase === 'speaking' ? 'scale-110' : ''}`}>🤖</div>
                  {phase === 'listening' && <div className="absolute inset-0 animate-ping rounded-full border border-cyan-300/30" />}
                </div>
                <div role="status" aria-live="polite" className="mt-6 font-mono text-xs uppercase tracking-[0.32em] text-cyan-300">{PHASE_LABEL[phase]}</div>
                <div className="mt-2 h-5 text-xs text-slate-400">
                  {phase === 'listening' ? `${recordingTime}s · tap stop when finished` : phase === 'thinking' ? 'Analyzing your request' : phase === 'speaking' ? 'Responding through voice' : 'Tap the microphone to begin'}
                </div>
                <div className="mt-5 flex gap-1.5" aria-hidden="true">
                  {[8, 16, 24, 12, 20, 10, 18].map((height, index) => <span key={index} className={`w-1 rounded-full bg-cyan-400/70 ${phase === 'listening' || phase === 'speaking' ? 'animate-pulse' : ''}`} style={{ height }} />)}
                </div>
              </div>
            </div>

            <div className="flex min-h-[520px] flex-col">
              <div role="log" aria-live="polite" aria-relevant="additions text" className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
                {messages.map((message, index) => (
                  <div role={message.alert ? 'alert' : 'article'} aria-label={`${message.role === 'user' ? 'You' : 'Jarvis'}${message.alert ? ' result alert' : ''} message`} key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'assistant' && <div aria-hidden="true" className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-sm">🤖</div>}
                    <div className={`min-w-0 max-w-[82%] break-words rounded-2xl px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere] ${message.role === 'user' ? 'rounded-br-md bg-blue-600 text-white shadow-lg shadow-blue-950/30' : message.alert ? 'rounded-bl-md border border-amber-300/40 bg-amber-300/[0.08] text-slate-100' : 'rounded-bl-md border border-white/8 bg-white/[0.045] text-slate-200'}`}>
                      <span className="sr-only">{message.role === 'user' ? 'You: ' : 'Jarvis: '}</span>{message.content}
                    </div>
                  </div>
                ))}
                {phase === 'thinking' && (
                  <div aria-hidden="true" className="flex items-center gap-3 text-sm text-cyan-300/80">
                    <div className="grid h-8 w-8 place-items-center rounded-full border border-cyan-400/20 bg-cyan-400/10">🤖</div>
                    <span className="flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:240ms]" /></span>
                  </div>
                )}
                <div role="status" aria-live="polite" className="sr-only">{copyStatus}</div>
                {generatedContent.map((item, index) => (
                  <section key={`${item.label}-${index}`} aria-label={item.label} className="ml-11 max-w-[82%] rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-4 text-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words text-xs font-semibold text-violet-200 [overflow-wrap:anywhere]">{item.label}</h3><button type="button" onClick={() => void copyGeneratedContent(item)} className="min-h-11 rounded-lg border border-violet-300/30 px-3 py-2 text-xs text-violet-100 hover:bg-violet-300/10">Copy draft</button></div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{item.content}</p>
                  </section>
                ))}
                <div ref={transcriptEndRef} />
              </div>

              <div className="border-t border-white/5 p-4 sm:p-5">
                {error && <div role="alert" className="mb-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</div>}
                <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-cyan-400/60 bg-black/25 p-2 shadow-[0_0_25px_rgba(34,211,238,.05)] focus-within:border-cyan-300">
                  <button
                    type="button"
                    onClick={() => phase === 'listening' ? stopListening() : void startListening()}
                    disabled={phase === 'thinking' || phase === 'speaking'}
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${phase === 'listening' ? 'bg-red-500 text-white shadow-lg shadow-red-950/40' : 'bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20'}`}
                    aria-label={phase === 'listening' ? 'Stop recording' : 'Speak to Jarvis'}
                  >
                    {phase === 'listening' ? '■' : '🎙️'}
                  </button>
                  <textarea aria-label="Command for Jarvis" value={input} disabled={phase === 'listening'} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void runCommand(input); } }} rows={1} placeholder="Ask Jarvis to look up leads, calls, contacts, or recordings…" className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-base sm:text-sm text-white outline-none placeholder:text-slate-400" />
                  <button type="submit" disabled={!input.trim() || phase === 'thinking' || phase === 'listening' || phase === 'speaking'} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400 text-lg font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Send command">↑</button>
                </form>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STARTERS.slice(0, 3).map((starter) => <button key={starter} onClick={() => void runCommand(starter)} disabled={phase === 'thinking' || phase === 'listening' || phase === 'speaking'} className="min-h-11 rounded-full border border-white/8 bg-white/[0.035] px-4 py-2 text-xs text-slate-400 transition hover:border-cyan-400/20 hover:text-cyan-200">{starter}</button>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="border-t border-cyan-500/10 bg-black/10 p-5 xl:border-t-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Completed activity</h2>
            <span className="font-mono text-[10px] text-slate-400">SYSTEM LOG</span>
          </div>
          <div role="log" aria-live="polite" aria-relevant="additions text" aria-label="Completed activity" className="mt-4 space-y-3">
            {activity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.02] p-5 text-center">
                <div aria-hidden="true" className="text-2xl opacity-50">⚡</div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">Completed searches and drafting steps appear here after each command finishes.</p>
              </div>
            ) : activity.map((item, index) => (
              <div key={`${item.tool}-${index}`} className="rounded-xl border border-white/7 bg-white/[0.035] p-3">
                <div className="flex gap-2.5">
                  <span aria-hidden="true" className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${item.ok === false ? 'bg-red-400' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.7)]'}`} />
                  <div className="min-w-0">
                    <p className="min-w-0 break-words text-xs font-medium text-slate-300 [overflow-wrap:anywhere]"><span className="sr-only">{item.ok === false ? 'Failed: ' : 'Succeeded: '}</span>{item.label}</p>
                    {item.detail && <p className="mt-1 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">{item.detail}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Supported capabilities</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {['Sales OS reads', 'Fathom reads', 'GoHighLevel reads', 'Message drafting'].map((label) => (
                <div key={label} className="rounded-xl border border-white/7 bg-white/[0.03] p-3">
                  <div className="text-[11px] text-slate-300">{label}</div>
                  <p className="mt-1 text-[9px] uppercase tracking-wider text-slate-400">Availability checked per request</p>
                </div>
              ))}
            </div>
          </div>

          {!cartesiaConfigured && (
            <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-3 text-[11px] leading-relaxed text-amber-200">
              Jarvis is usable now with browser voice. Add <code className="text-amber-200">CARTESIA_API_KEY</code> and <code className="text-amber-200">CARTESIA_VOICE_ID</code> in Vercel to activate Cartesia Ink + Sonic.
            </div>
          )}

          <div className="mt-7 rounded-2xl border border-cyan-400/10 bg-gradient-to-br from-cyan-400/[0.07] to-blue-500/[0.03] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200">Current reach</div>
            <ul className="mt-3 space-y-2 text-xs text-slate-400">
              <li>• Read leads and pipeline details</li>
              <li>• Inspect sales-call outcomes and objections</li>
              <li>• List recent Fathom recordings and links</li>
              <li>• Search GHL contacts</li>
              <li>• Draft follow-up messages</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>

        <section aria-labelledby="jarvis-chief-of-staff" className="mt-4 rounded-3xl border border-white/[0.07] bg-[#0c0d10] p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/20 to-violet-500/10 text-2xl leading-none">{JARVIS_PROFILE.emoji}</div>
            <div className="min-w-0 flex-1">
              <h2 id="jarvis-chief-of-staff" className="break-words text-lg font-semibold tracking-tight text-white [overflow-wrap:anywhere]">{JARVIS_PROFILE.name} · {JARVIS_PROFILE.role}</h2>
              <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-zinc-400 [overflow-wrap:anywhere]">{JARVIS_PROFILE.mission}</p>
              <p className="mt-2 max-w-3xl break-words text-xs leading-5 text-zinc-400 [overflow-wrap:anywhere]">{JARVIS_PROFILE.personality}</p>
              <span className="mt-3 inline-block rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2.5 py-1 text-[10px] text-amber-200">{JARVIS_PROFILE.autonomy}</span>
            </div>
          </div>

          <h3 className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Internal workers</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {JARVIS_INTERNAL_WORKERS.map((worker) => (
              <li key={worker.id} className="min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className="text-lg leading-none">{worker.emoji}</span>
                  <p className="min-w-0 break-words text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">{worker.name}</p>
                </div>
                <p className="mt-1 break-words text-xs text-zinc-400 [overflow-wrap:anywhere]">{worker.role}</p>
                <p className="mt-2.5 break-words text-xs leading-5 text-zinc-400 [overflow-wrap:anywhere]">{worker.mission}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${JARVIS_WORKER_STAGE[worker.status]}`}>{JARVIS_WORKER_STAGE_LABEL[worker.status]}</span>
                  <span className="max-w-full break-words rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[10px] text-zinc-400 [overflow-wrap:anywhere]">{worker.cadence}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-zinc-400">
            Build stages describe how far each worker is defined and built. Live run history, schedules, failures, and costs are not connected to this page yet.
          </p>
        </section>
      </section>
      <section role="tabpanel" id="workforce-panel-core" aria-labelledby="workforce-tab-core" hidden={workspaceTab !== 'core'}>
        {workspaceTab === 'core' && (workforceOwnerId
          ? <AgentWorkforceDashboard view="core" ownerId={workforceOwnerId} onEditorOpenChange={setWorkforceEditorOpen} />
          : <WorkforceLocked checked={workforceChecked} view="core" />)}
      </section>
      <section role="tabpanel" id="workforce-panel-subagent" aria-labelledby="workforce-tab-subagent" hidden={workspaceTab !== 'subagent'}>
        {workspaceTab === 'subagent' && (workforceOwnerId
          ? <AgentWorkforceDashboard view="subagent" ownerId={workforceOwnerId} onEditorOpenChange={setWorkforceEditorOpen} />
          : <WorkforceLocked checked={workforceChecked} view="subagent" />)}
      </section>
      <section role="tabpanel" id="workforce-panel-skills" aria-labelledby="workforce-tab-skills" hidden={workspaceTab !== 'skills'}>
        {workspaceTab === 'skills' && (workforceOwnerId
          ? <AgentSkillsCatalog />
          : <WorkforceLocked checked={workforceChecked} view="skills" />)}
      </section>
    </div>
  );
}
