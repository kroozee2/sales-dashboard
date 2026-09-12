'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresentationRecord, PresentationSlide, PresentationsDocument, DeployedPresentationSlide } from '@/lib/presentations';
import { PresentationStage } from '@/components/presentation-stage';

type Envelope = { document: PresentationsDocument; row_updated_at: string | null };
type DraftForm = Pick<PresentationRecord, 'id' | 'slug' | 'title' | 'subtitle' | 'audience' | 'slides' | 'facilitator_notes'>;
type RecoveryEnvelope = { version: 1; owner_id: string; surface: 'presentations'; presentation_id: string; server_revision: string; form: DraftForm };
const RECOVERY_PREFIX = 'salesos:presentations:draft:';

function draftOf(record: PresentationRecord): DraftForm {
  return { id: record.id, slug: record.slug, title: record.title, subtitle: record.subtitle, audience: record.audience, slides: structuredClone(record.slides), facilitator_notes: record.facilitator_notes };
}
function audienceSlides(record: PresentationRecord): DeployedPresentationSlide[] {
  return record.slides.map(({ id, title, on_screen_copy, optional }) => ({ id, title, on_screen_copy, optional }));
}
function draftKey(ownerId: string, id: string, revision: string) { return `${RECOVERY_PREFIX}${ownerId}:${id}:${revision}`; }
function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).sort().join('|') === keys.slice().sort().join('|');
}
function boundedRecoveryText(value: unknown, max: number, required = false): value is string {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value) && (!required || Boolean(value.trim()));
}
function validRecoverySlide(value: unknown): value is PresentationSlide {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const slide = value as Record<string, unknown>;
  return hasExactKeys(slide, ['id', 'title', 'on_screen_copy', 'speaker_notes', 'visual_direction', 'exercise', 'optional'])
    && boundedRecoveryText(slide.id, 80, true) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slide.id)
    && boundedRecoveryText(slide.title, 200, true) && boundedRecoveryText(slide.on_screen_copy, 8_000)
    && boundedRecoveryText(slide.speaker_notes, 12_000) && boundedRecoveryText(slide.visual_direction, 4_000)
    && boundedRecoveryText(slide.exercise, 6_000) && typeof slide.optional === 'boolean';
}
function validRecovery(value: unknown, ownerId: string, revision: string): value is RecoveryEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!hasExactKeys(row, ['form', 'owner_id', 'presentation_id', 'server_revision', 'surface', 'version'])) return false;
  if (row.version !== 1 || row.owner_id !== ownerId || row.surface !== 'presentations' || row.server_revision !== revision) return false;
  if (!row.form || typeof row.form !== 'object' || Array.isArray(row.form)) return false;
  const form = row.form as Record<string, unknown>;
  if (!hasExactKeys(form, ['id', 'slug', 'title', 'subtitle', 'audience', 'slides', 'facilitator_notes'])) return false;
  if (!boundedRecoveryText(form.id, 80, true) || form.id !== row.presentation_id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.id)) return false;
  if (!boundedRecoveryText(form.slug, 80, true) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) return false;
  if (!boundedRecoveryText(form.title, 200, true) || !boundedRecoveryText(form.subtitle, 500) || !boundedRecoveryText(form.audience, 1_000) || !boundedRecoveryText(form.facilitator_notes, 30_000)) return false;
  if (!Array.isArray(form.slides) || form.slides.length < 1 || form.slides.length > 200 || !form.slides.every(validRecoverySlide)) return false;
  return new Set(form.slides.map((slide) => slide.id)).size === form.slides.length;
}
function errorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === 'string' && error.length <= 300 ? error : fallback;
}
function canonicalSlug(title: string) {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-+$/g, '') || 'presentation';
}

function Preview({ record, onClose, onPresent }: { record: PresentationRecord; onClose: () => void; onPresent: () => void }) {
  const first = audienceSlides(record)[0];
  return (
    <div role="dialog" aria-modal="true" aria-label={`Preview: ${record.title}`} className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/80 p-4">
      <div className="w-full max-w-4xl rounded-3xl border border-white/15 bg-[#080b12] p-5 shadow-2xl sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Audience preview</p><h2 className="break-words text-xl font-bold text-white [overflow-wrap:anywhere]">{record.title}</h2></div>
          <div className="flex gap-2"><button type="button" onClick={onPresent} className="min-h-11 rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950">Present</button><button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-xl border border-white/20 px-3 text-sm text-white">Close</button></div>
        </div>
        <section className="mt-6 min-h-72 rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-zinc-200">
          <h3 className="break-words text-3xl font-bold text-white [overflow-wrap:anywhere]">{first.title}</h3>
          <p className="mt-6 whitespace-pre-wrap break-words text-base leading-7 [overflow-wrap:anywhere]">{first.on_screen_copy.replace(/^#{1,3}\s+/gm, '').replace(/\*\*/g, '')}</p>
        </section>
        <p className="mt-4 text-sm text-zinc-400">1 / {record.slides.length} · Speaker notes and visual directions are excluded.</p>
      </div>
    </div>
  );
}

function Editor({ ownerId, documentRevision, rowUpdatedAt, record, initial, restored, onClose, onSaved }: { ownerId: string; documentRevision: string; rowUpdatedAt: string | null; record: PresentationRecord | null; initial: DraftForm; restored: boolean; onClose: () => void; onSaved: (envelope: Envelope) => void }) {
  const [form, setForm] = useState(initial);
  const [dirty, setDirty] = useState(restored);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cleanupPending, setCleanupPending] = useState(false);
  const [acknowledgedEnvelope, setAcknowledgedEnvelope] = useState<Envelope | null>(null);
  const lockRef = useRef(false);
  const key = draftKey(ownerId, form.id, documentRevision);
  const update = <K extends keyof DraftForm>(field: K, value: DraftForm[K]) => { if (saving || cleanupPending) return; setForm((current) => ({ ...current, [field]: value })); setDirty(true); };
  const updateSlide = (index: number, patch: Partial<PresentationSlide>) => update('slides', form.slides.map((slide, position) => position === index ? { ...slide, ...patch } : slide));

  useEffect(() => {
    if (!dirty) return;
    const recovery: RecoveryEnvelope = { version: 1, owner_id: ownerId, surface: 'presentations', presentation_id: form.id, server_revision: documentRevision, form };
    try { window.sessionStorage.setItem(key, JSON.stringify(recovery)); }
    catch {
      try { window.sessionStorage.removeItem(key); } catch { /* warning below remains truthful */ }
      queueMicrotask(() => setError('Draft recovery is unavailable. Keep this editor open until you save or copy your work.'));
    }
  }, [dirty, documentRevision, form, key, ownerId]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || saving || cleanupPending) event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [cleanupPending, dirty, saving]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!dirty && !saving && !cleanupPending) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!target) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setError('Close the editor before navigating. Your recovery draft is still saved in this tab.');
    };
    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [cleanupPending, dirty, saving]);

  const removeRecovery = (reason: 'save' | 'discard') => {
    try { window.sessionStorage.removeItem(key); return true; }
    catch {
      setError(reason === 'save'
        ? 'The save succeeded, but the recovery draft could not be cleared. Editing is locked until cleanup succeeds.'
        : 'The recovery draft could not be discarded. The editor remains open and locked until cleanup succeeds.');
      setCleanupPending(true);
      return false;
    }
  };
  const close = () => {
    if (saving || cleanupPending) return;
    if (dirty && !window.confirm('Discard this unsaved draft?')) return;
    if (dirty && !removeRecovery('discard')) return;
    onClose();
  };
  const save = async () => {
    if (lockRef.current || cleanupPending) return;
    lockRef.current = true; setSaving(true); setError('');
    try {
      const response = await fetch('/api/presentations', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', expected_document_revision: documentRevision, expected_row_updated_at: rowUpdatedAt, presentation: form }) });
      const body = await response.json().catch(() => null);
      if (response.status === 409) { setError('This presentation changed in another tab. Your draft is preserved. Copy it or close without discarding, then reload the latest version before reconciling.'); return; }
      if (!response.ok) { setError(errorMessage(body, 'The presentation could not be saved. Your draft is preserved.')); return; }
      const savedEnvelope = body as Envelope;
      setAcknowledgedEnvelope(savedEnvelope);
      if (!removeRecovery('save')) return;
      setDirty(false); onSaved(savedEnvelope);
    } catch { setError('The presentation could not be saved. Your draft is preserved.'); }
    finally { lockRef.current = false; setSaving(false); }
  };
  const retryCleanup = () => {
    if (!removeRecovery(acknowledgedEnvelope ? 'save' : 'discard')) return;
    setCleanupPending(false);
    setDirty(false);
    if (acknowledgedEnvelope) onSaved(acknowledgedEnvelope);
    else onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={record ? 'Edit presentation' : 'Create presentation'} onKeyDown={(event) => { if (event.key === 'Escape') close(); }} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-[#090b11] sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">{record ? 'Edit deck' : 'New deck'}</p><h2 className="text-lg font-bold text-white">Presentation editor</h2></div><button type="button" onClick={close} disabled={saving || cleanupPending} className="min-h-11 min-w-11 rounded-xl border border-white/20 text-white disabled:opacity-40" aria-label="Close editor">×</button></header>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
            {error && <div role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-zinc-300">Presentation title<input aria-label="Presentation title" value={form.title} maxLength={200} disabled={saving || cleanupPending} onChange={(event) => update('title', event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-zinc-600 bg-black/30 px-3 text-base text-white sm:text-sm" /></label>
              <label className="text-sm text-zinc-300">Stable slug<input aria-label="Stable slug" value={form.slug} maxLength={80} disabled={Boolean(record) || saving || cleanupPending} onChange={(event) => update('slug', canonicalSlug(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-zinc-600 bg-black/30 px-3 text-base text-white sm:text-sm disabled:opacity-60" /></label>
              <label className="text-sm text-zinc-300 sm:col-span-2">Subtitle<textarea aria-label="Presentation subtitle" value={form.subtitle} maxLength={500} disabled={saving || cleanupPending} onChange={(event) => update('subtitle', event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-zinc-600 bg-black/30 p-3 text-base text-white sm:text-sm" /></label>
              <label className="text-sm text-zinc-300 sm:col-span-2">Audience<textarea aria-label="Presentation audience" value={form.audience} maxLength={1000} disabled={saving || cleanupPending} onChange={(event) => update('audience', event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-zinc-600 bg-black/30 p-3 text-base text-white sm:text-sm" /></label>
            </div>
            <div className="space-y-4">{form.slides.map((slide, index) => <fieldset key={slide.id} className="min-w-0 space-y-3 rounded-2xl border border-white/15 p-4"><legend className="px-2 text-sm font-semibold text-white">Slide {index + 1}</legend><label className="block text-sm text-zinc-300">Title<input aria-label={`Slide ${index + 1} title`} value={slide.title} maxLength={200} disabled={saving || cleanupPending} onChange={(event) => updateSlide(index, { title: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-zinc-600 bg-black/30 px-3 text-base text-white sm:text-sm" /></label>{[['On-screen copy','on_screen_copy',8000],['Speaker notes','speaker_notes',12000],['Visual direction','visual_direction',4000],['Exercise or interaction','exercise',6000]].map(([label, field, max]) => <label key={String(field)} className="block text-sm text-zinc-300">{label}<textarea aria-label={`Slide ${index + 1} ${String(label).toLowerCase()}`} value={String(slide[field as keyof PresentationSlide])} maxLength={Number(max)} disabled={saving || cleanupPending} onChange={(event) => updateSlide(index, { [field]: event.target.value })} className="mt-1 min-h-28 w-full rounded-xl border border-zinc-600 bg-black/30 p-3 text-base text-white sm:text-sm" /></label>)}<label className="flex min-h-11 items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={slide.optional} disabled={saving || cleanupPending} onChange={(event) => updateSlide(index, { optional: event.target.checked })} className="h-5 w-5" />Optional slide</label></fieldset>)}</div>
            <label className="block text-sm text-zinc-300">Facilitator notes<textarea aria-label="Facilitator notes" value={form.facilitator_notes} maxLength={30000} disabled={saving || cleanupPending} onChange={(event) => update('facilitator_notes', event.target.value)} className="mt-1 min-h-40 w-full rounded-xl border border-zinc-600 bg-black/30 p-3 text-base text-white sm:text-sm" /></label>
          </div>
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">{cleanupPending ? <button type="button" onClick={retryCleanup} className="min-h-11 rounded-xl bg-amber-300 px-4 text-sm font-semibold text-slate-950">Retry draft cleanup</button> : <><button type="button" onClick={close} disabled={saving} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm text-white disabled:opacity-40">Cancel</button><button type="submit" disabled={saving || !dirty || !form.title.trim()} className="min-h-11 rounded-xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 disabled:opacity-40">{saving ? 'Saving…' : 'Save draft'}</button></>}</footer>
        </form>
      </div>
    </div>
  );
}

export function PresentationsWorkspace({ ownerId, onEditorOpenChange }: { ownerId: string; onEditorOpenChange?: (open: boolean) => void }) {
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{ record: PresentationRecord | null; form: DraftForm; restored: boolean } | null>(null);
  const [preview, setPreview] = useState<PresentationRecord | null>(null);
  const [presenting, setPresenting] = useState<PresentationRecord | null>(null);
  const mutationLock = useRef(false);
  const [mutatingId, setMutatingId] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/presentations');
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, 'Presentations could not be loaded.'));
      const next = body as Envelope;
      setEnvelope(next);
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (!key?.startsWith(`${RECOVERY_PREFIX}${ownerId}:`)) continue;
        try {
          const candidate = JSON.parse(window.sessionStorage.getItem(key) ?? 'null');
          if (validRecovery(candidate, ownerId, next.document.revision)) { setEditor({ record: next.document.presentations.find((item) => item.id === candidate.presentation_id) ?? null, form: candidate.form, restored: true }); break; }
        } catch { /* malformed recovery is ignored, never trusted */ }
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Presentations could not be loaded.'); }
  }, [ownerId]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => { onEditorOpenChange?.(Boolean(editor)); return () => onEditorOpenChange?.(false); }, [editor, onEditorOpenChange]);

  const deploy = async (record: PresentationRecord) => {
    if (!envelope || mutationLock.current) return;
    mutationLock.current = true; setMutatingId(record.id); setError('');
    try {
      const response = await fetch('/api/presentations', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'deploy', expected_document_revision: envelope.document.revision, expected_row_updated_at: envelope.row_updated_at, presentation: draftOf(record) }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, 'The presentation could not be deployed.'));
      setEnvelope(body as Envelope);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The presentation could not be deployed.'); }
    finally { mutationLock.current = false; setMutatingId(''); }
  };
  const create = () => {
    if (!envelope) return;
    const id = `presentation-${crypto.randomUUID().toLowerCase()}`.slice(0, 80).replace(/-+$/g, '');
    const used = new Set(envelope.document.presentations.map((item) => item.slug));
    let slug = 'untitled-presentation'; let number = 2;
    while (used.has(slug)) { const suffix = `-${number++}`; slug = `untitled-presentation`.slice(0, 80 - suffix.length) + suffix; }
    const slide: PresentationSlide = { id: 'slide-01', title: 'Untitled slide', on_screen_copy: '', speaker_notes: '', visual_direction: '', exercise: '', optional: false };
    setEditor({ record: null, restored: false, form: { id, slug, title: 'Untitled presentation', subtitle: '', audience: '', slides: [slide], facilitator_notes: '' } });
  };
  const presentations = envelope?.document.presentations ?? [];
  const active = presenting ?? preview;

  return (
    <section aria-labelledby="presentations-heading" className="rounded-3xl border border-white/[0.12] bg-[#07090e] p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">AI Command Center</p><h1 id="presentations-heading" className="mt-1 text-2xl font-bold text-white">Presentations</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Build owner-only decks, rehearse privately, then deploy an audience-safe snapshot.</p></div><button type="button" onClick={create} disabled={!envelope} className="min-h-11 rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40">New presentation</button></header>
      {error && <div role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error} <button type="button" onClick={() => void load()} className="ml-2 min-h-11 underline">Retry</button></div>}
      {!envelope && !error && <p role="status" className="mt-8 text-sm text-zinc-400">Loading presentations…</p>}
      {envelope && <div className="mt-6 grid gap-4 lg:grid-cols-2">{presentations.map((record) => <article key={record.id} className="min-w-0 rounded-2xl border border-white/[0.12] bg-white/[0.035] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-semibold text-white [overflow-wrap:anywhere]">{record.title}</h2><p className="mt-1 break-words text-sm text-zinc-400 [overflow-wrap:anywhere]">{record.subtitle}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${record.status === 'deployed' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>{record.status === 'deployed' ? 'Deployed' : 'Draft'}</span></div><dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400"><div><dt className="sr-only">Slide count</dt><dd>{record.slides.length} slides</dd></div><div><dt className="sr-only">Last updated</dt><dd>Updated {new Date(record.updated_at).toLocaleDateString()}</dd></div><div><dt className="sr-only">Revision</dt><dd>Revision {record.revision}</dd></div></dl><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => setEditor({ record, form: draftOf(record), restored: false })} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm text-white" aria-label={`Edit ${record.title}`}>Edit</button><button type="button" onClick={() => setPreview(record)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm text-white" aria-label={`Preview ${record.title}`}>Preview</button><button type="button" disabled={Boolean(mutatingId)} onClick={() => void deploy(record)} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-40" aria-label={`${record.deployed_snapshot ? 'Redeploy' : 'Deploy'} ${record.title}`}>{mutatingId === record.id ? 'Deploying…' : record.deployed_snapshot ? 'Redeploy' : 'Deploy'}</button>{record.deployed_snapshot && <a href={`/present/${record.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-emerald-400/30 px-4 text-sm text-emerald-200" aria-label={`Open shared presentation ${record.title}`}>Open share ↗</a>}</div></article>)}</div>}
      {editor && envelope && <Editor ownerId={ownerId} documentRevision={envelope.document.revision} rowUpdatedAt={envelope.row_updated_at} record={editor.record} initial={editor.form} restored={editor.restored} onClose={() => setEditor(null)} onSaved={(next) => { setEnvelope(next); setEditor(null); }} />}
      {preview && !presenting && <Preview record={preview} onClose={() => setPreview(null)} onPresent={() => setPresenting(preview)} />}
      {active && presenting && <PresentationStage title={active.title} subtitle={active.subtitle} slides={audienceSlides(active)} onClose={() => { setPresenting(null); setPreview(null); }} ariaLabel={`Presenting: ${active.title}`} />}
    </section>
  );
}
