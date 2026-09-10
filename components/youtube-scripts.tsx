"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  copyableAssetText,
  formatScriptDate,
  formatScriptDateTime,
  getScriptRows,
  type ScriptSourceItem,
  type YouTubeRunOfShowEntry,
  type YouTubeScriptRow,
} from "@/lib/youtube-scripts";

export default function YouTubeScripts({ items, loading, error }: {
  items: ScriptSourceItem[];
  loading?: boolean;
  error?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const selectionVersionRef = useRef(0);
  const rows = useMemo(() => getScriptRows(items), [items]);
  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter((row) => `${row.sourceTitle} ${row.title} ${row.stage} ${row.thumbnailText ?? ""}`.toLowerCase().includes(search));
  }, [query, rows]);
  const selected = selectedId ? rows.find((row) => row.id === selectedId) ?? null : null;

  function open(row: YouTubeScriptRow, opener: HTMLElement) {
    selectionVersionRef.current += 1;
    openerRef.current = opener;
    setCopyMessage(null);
    setSelectedId(row.id);
  }

  function close() {
    selectionVersionRef.current += 1;
    setSelectedId(null);
    setCopyMessage(null);
    const opener = openerRef.current;
    openerRef.current = null;
    window.setTimeout(() => opener?.focus(), 0);
  }

  useEffect(() => {
    if (!selectedId) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        selectionVersionRef.current += 1;
        setSelectedId(null);
        setCopyMessage(null);
        const opener = openerRef.current;
        openerRef.current = null;
        window.setTimeout(() => opener?.focus(), 0);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  async function copyAsset(label: string, value: string | string[] | YouTubeRunOfShowEntry[] | null | undefined) {
    if (!selected) return;
    const text = copyableAssetText(label, value);
    if (!text) return;
    const id = selected.id;
    const version = selectionVersionRef.current;
    setCopyMessage(`Copying ${label.toLowerCase()}…`);
    try {
      await navigator.clipboard.writeText(text);
      if (selectionVersionRef.current === version && selectedId === id) setCopyMessage(`${label} copied to clipboard.`);
    } catch {
      if (selectionVersionRef.current === version && selectedId === id) setCopyMessage(`Could not copy ${label.toLowerCase()}. Select the text and copy it manually.`);
    }
  }

  return (
    <section aria-labelledby="youtube-scripts-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-400">Shared Content records</p>
          <h2 id="youtube-scripts-title" className="mt-1 text-xl font-black text-white">Scripts</h2>
          <p className="mt-1 text-xs text-zinc-500">Read-only scripts and production packages linked to their original YouTube item IDs.</p>
        </div>
        <label className="min-w-0 sm:w-96">
          <span className="sr-only">Search YouTube scripts</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, stage, or thumbnail text…" className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none" />
        </label>
      </div>

      {loading ? <div className="rounded-2xl border border-zinc-800 p-8 text-center text-sm text-zinc-400">Loading scripts…</div> :
        error ? <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center text-sm text-rose-200">{error}</div> :
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <div className="overflow-x-auto" tabIndex={0} aria-label="YouTube scripts spreadsheet, horizontally scrollable">
            <table className="w-full min-w-[1120px] border-collapse text-left">
              <thead className="bg-zinc-950/95"><tr className="border-b border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                <th className="min-w-[300px] px-3 py-3">Video / title</th><th className="w-32 px-3 py-3">Stage</th><th className="w-52 px-3 py-3">Shoot date / time</th><th className="w-44 px-3 py-3">Target release</th><th className="w-48 px-3 py-3">Script readiness</th><th className="min-w-[220px] px-3 py-3">Thumbnail text / status</th><th className="w-24 px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-800/80">{filteredRows.map((row) => <tr key={row.id} className="align-middle hover:bg-red-500/[0.04]">
                <td className="px-3 py-3"><p className="text-xs font-bold text-white">{row.sourceTitle}</p>{row.title !== row.sourceTitle && <p className="mt-1 text-[10px] text-zinc-500">Recommended: {row.title}</p>}<p className="mt-1 font-mono text-[9px] text-zinc-700">{row.id}</p></td>
                <td className="px-3 py-3 text-xs capitalize text-zinc-300">{row.stage}</td>
                <td className="px-3 py-3 text-xs text-zinc-300">{formatScriptDateTime(row.shootAt)}</td>
                <td className="px-3 py-3 text-xs text-zinc-300">{formatScriptDate(row.scheduledDate)}</td>
                <td className="px-3 py-3 text-xs text-zinc-300">{row.scriptReadiness}</td>
                <td className="px-3 py-3"><p className="text-xs font-semibold text-white">{row.thumbnailText ?? "Thumbnail text unavailable"}</p><p className="mt-1 text-[10px] text-zinc-500">{row.thumbnailStatus}</p></td>
                <td className="px-3 py-3"><button type="button" onClick={(event) => open(row, event.currentTarget)} className="rounded-lg border border-zinc-700 px-3 py-2 text-[10px] font-black text-zinc-200 hover:border-red-500 hover:text-white" aria-haspopup="dialog">Open</button></td>
              </tr>)}</tbody>
            </table>
          </div>
          {filteredRows.length === 0 && <div className="p-8 text-center text-sm text-zinc-500">{rows.length === 0 ? "No saved YouTube scripts or packages yet." : "No scripts match this search."}</div>}
        </div>}

      {selected && <ScriptDrawer row={selected} closeRef={closeRef} copyMessage={copyMessage} onClose={close} onCopy={(label, value) => void copyAsset(label, value)} />}
    </section>
  );
}

function ScriptDrawer({ row, closeRef, copyMessage, onClose, onCopy }: {
  row: YouTubeScriptRow;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  copyMessage: string | null;
  onClose: () => void;
  onCopy: (label: string, value: string | string[] | YouTubeRunOfShowEntry[] | null | undefined) => void;
}) {
  const pkg = row.package;
  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="fixed inset-0 z-50 bg-black/65" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside role="dialog" aria-modal="true" aria-labelledby="script-drawer-title" onKeyDown={trapFocus} className="ml-auto flex h-full w-full max-w-3xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-zinc-800 p-4 sm:p-5">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-red-400">Read-only production package</p><h2 id="script-drawer-title" className="mt-1 truncate text-lg font-black text-white">{row.sourceTitle}</h2><p className="mt-1 font-mono text-[9px] text-zinc-600">Item ID: {row.id}</p></div>
        <button ref={closeRef} type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:text-white" aria-label={`Close script details for ${row.sourceTitle}`}>Close</button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        <section aria-labelledby="full-script-heading" className="rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="full-script-heading" className="text-sm font-black text-white">Full script</h3><button type="button" onClick={() => onCopy("Full script", row.script)} disabled={!row.script} className="rounded-lg bg-red-600 px-3 py-2 text-[10px] font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">Copy full script</button></div>
          {copyMessage && <p role="status" aria-live="polite" className="mt-2 text-xs text-zinc-300">{copyMessage}</p>}
          {row.script ? <pre className="mt-4 select-text whitespace-pre-wrap break-words font-sans text-sm leading-7 text-zinc-200">{row.script}</pre> : <Unavailable />}
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          <Asset title="Recommended title" value={pkg?.recommendedTitle} copyLabel="Copy recommended title" onCopy={onCopy} />
          <ListAsset title="Alternate titles" values={pkg?.alternateTitles} onCopy={onCopy} />
          <Asset title="Opening hook" value={pkg?.openingHook} onCopy={onCopy} />
          <Asset title="Framework" value={pkg?.framework} onCopy={onCopy} />
          <RunOfShow values={pkg?.runOfShow} onCopy={onCopy} />
          <Asset title="Thumbnail text" value={pkg?.thumbnailText} onCopy={onCopy} />
          <Asset title="Thumbnail brief" value={pkg?.thumbnailBrief} copyLabel="Copy thumbnail brief" onCopy={onCopy} />
          <Asset title="SEO description" value={pkg?.seoDescription} copyLabel="Copy SEO description" onCopy={onCopy} />
          <Asset title="Board copy" value={pkg?.boardCopy} copyLabel="Copy board copy" onCopy={onCopy} />
          <Asset title="Production notes" value={row.notes} copyLabel="Copy production notes" onCopy={onCopy} />
          <ListAsset title="Chapters" values={pkg?.chapters} onCopy={onCopy} />
          <ListAsset title="Keywords" values={pkg?.keywords} onCopy={onCopy} />
          <Asset title="Pinned comment" value={pkg?.pinnedComment} onCopy={onCopy} />
          <ListAsset title="Clip hooks" values={pkg?.clipHooks} onCopy={onCopy} />
          <ListAsset title="Recording checklist" values={pkg?.recordingChecklist} copyLabel="Copy recording checklist" onCopy={onCopy} />
        </div>
      </div>
    </aside>
  </div>;
}

type CopyAction = (label: string, value: string | string[] | YouTubeRunOfShowEntry[] | null | undefined) => void;

function CopyButton({ title, value, copyLabel, onCopy }: { title: string; value: string | string[] | YouTubeRunOfShowEntry[] | null | undefined; copyLabel?: string; onCopy: CopyAction }) {
  const copyable = copyableAssetText(title, value);
  return <button type="button" onClick={() => onCopy(title, value)} disabled={!copyable} aria-label={copyLabel ?? `Copy ${title.toLowerCase()}`} className="rounded-md border border-zinc-700 px-2 py-1 text-[9px] font-black text-zinc-400 hover:border-red-500 hover:text-white disabled:hidden">Copy</button>;
}
function Asset({ title, value, copyLabel, onCopy }: { title: string; value?: string | null; copyLabel?: string; onCopy: CopyAction }) {
  return <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{title}</h3><CopyButton title={title} value={value} copyLabel={copyLabel} onCopy={onCopy} /></div>{value ? <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300">{value}</p> : <Unavailable />}</section>;
}
function ListAsset({ title, values, copyLabel, onCopy }: { title: string; values?: string[]; copyLabel?: string; onCopy: CopyAction }) {
  return <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{title}</h3><CopyButton title={title} value={values} copyLabel={copyLabel} onCopy={onCopy} /></div>{values?.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-300">{values.map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul> : <Unavailable />}</section>;
}
function RunOfShow({ values, onCopy }: { values?: YouTubeRunOfShowEntry[]; onCopy: CopyAction }) {
  return <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:col-span-2"><div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Run of show</h3><CopyButton title="Run of show" value={values} onCopy={onCopy} /></div>{values?.length ? <ol className="mt-2 space-y-2">{values.map((entry, index) => <li key={`${index}-${entry.time}`} className="grid gap-1 text-xs sm:grid-cols-[70px_150px_1fr]"><span className="font-mono text-red-300">{entry.time}</span><span className="font-bold text-white">{entry.section}</span><span className="text-zinc-400">{entry.purpose}</span></li>)}</ol> : <Unavailable />}</section>;
}
function Unavailable() { return <p className="mt-2 text-xs italic text-zinc-600">Unavailable</p>; }
