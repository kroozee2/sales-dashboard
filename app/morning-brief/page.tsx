"use client";

import { useEffect, useMemo, useState } from "react";
import type { MorningBrief } from "@/lib/morning-brief";

type BriefDocument = { version: 1; briefs: MorningBrief[] };

function formatDate(date: string, options?: Intl.DateTimeFormatOptions) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", options ?? { weekday: "long", month: "long", day: "numeric" });
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return <>{parts.map((part, index) => part.startsWith("http") ? (
    <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="text-blue-400 underline decoration-blue-500/40 underline-offset-2 break-all hover:text-blue-300">{part}</a>
  ) : <span key={index}>{part.replace(/\*\*/g, "")}</span>)}</>;
}

function BriefContent({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-6 text-zinc-300">
      {content.split("\n").map((raw, index) => {
        const line = raw.trim();
        if (!line) return <div key={index} className="h-1" />;
        if (line.startsWith("## ")) return <h2 key={index} className="pt-5 first:pt-0 text-lg font-bold text-white"><InlineText text={line.slice(3)} /></h2>;
        if (line.startsWith("### ")) return <h3 key={index} className="pt-3 text-sm font-bold text-zinc-100"><InlineText text={line.slice(4)} /></h3>;
        if (/^\d+\.\s/.test(line)) return <div key={index} className="flex gap-3 pl-1"><span className="font-bold text-blue-400">{line.match(/^\d+/)?.[0]}.</span><p><InlineText text={line.replace(/^\d+\.\s*/, "")} /></p></div>;
        if (/^[-*]\s/.test(line)) return <div key={index} className="flex gap-3 pl-2"><span className="text-blue-400">•</span><p><InlineText text={line.replace(/^[-*]\s*/, "")} /></p></div>;
        return <p key={index}><InlineText text={line} /></p>;
      })}
    </div>
  );
}

export default function MorningBriefPage() {
  const [document, setDocument] = useState<BriefDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/morning-briefs")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load morning briefs");
        return data as BriefDocument;
      })
      .then((data) => {
        setDocument(data);
        setSelectedId(data.briefs[0]?.id ?? null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load morning briefs"));
  }, []);

  const selected = useMemo(() => document?.briefs.find((brief) => brief.id === selectedId) ?? document?.briefs[0] ?? null, [document, selectedId]);
  const doneCount = selected?.checklist.filter((item) => item.done).length ?? 0;
  const totalCount = selected?.checklist.length ?? 0;
  const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  async function toggle(itemId: string, done: boolean) {
    if (!selected || savingItem) return;
    setSavingItem(itemId);
    setError("");
    try {
      const response = await fetch("/api/morning-briefs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief_id: selected.id, item_id: itemId, done, expected_revision: selected.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save checklist");
      setDocument((current) => current ? { ...current, briefs: current.briefs.map((brief) => brief.id === data.brief.id ? data.brief : brief) } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save checklist");
    } finally {
      setSavingItem(null);
    }
  }

  if (!document && !error) return <p className="py-20 text-center text-zinc-500 animate-pulse">Loading your morning brief…</p>;

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">Command Center</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">☀️ Morning Brief</h1>
          <p className="mt-1 text-sm text-zinc-500">Your daily priorities, preparation, follow-ups, and decisions, saved in one place.</p>
        </div>
        {selected && <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-right">
          <p className="text-2xl font-extrabold tabular-nums text-white">{progress}%</p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">{doneCount} of {totalCount} checked</p>
        </div>}
      </header>

      {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {!selected ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-16 text-center">
          <p className="text-4xl">☀️</p>
          <h2 className="mt-3 text-lg font-bold text-white">Your first brief will appear here</h2>
          <p className="mt-1 text-sm text-zinc-500">New daily briefs are saved automatically after Jarvis prepares them.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Saved Briefs</p>
            <div className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible">
              {document?.briefs.map((brief) => {
                const done = brief.checklist.filter((item) => item.done).length;
                return <button key={brief.id} onClick={() => setSelectedId(brief.id)} className={`min-w-44 rounded-xl border p-3 text-left transition-colors lg:w-full ${brief.id === selected.id ? "border-blue-500/50 bg-blue-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}>
                  <p className={`text-sm font-bold ${brief.id === selected.id ? "text-blue-200" : "text-zinc-200"}`}>{formatDate(brief.date, { weekday: "short", month: "short", day: "numeric" })}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{done}/{brief.checklist.length} complete</p>
                </button>;
              })}
            </div>
          </aside>

          <main className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 bg-gradient-to-r from-blue-500/10 to-violet-500/5 p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-blue-400">{formatDate(selected.date)}</p>
                <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-white">{selected.title}</h2>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-300">{selected.summary}</p>
              </div>

              <div className="p-4 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="font-bold text-white">✅ Today&apos;s Checklist</h3>
                  <span className="text-xs text-zinc-500">{doneCount}/{totalCount}</span>
                </div>
                <div className="mb-6 h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label="Morning brief completion" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                {selected.checklist.length === 0 ? <p className="text-sm text-zinc-500">No checklist items were included in this brief.</p> : <div className="space-y-2">
                  {selected.checklist.map((item) => <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${item.done ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"}`}>
                    <input type="checkbox" checked={item.done} disabled={savingItem === item.id} onChange={(event) => toggle(item.id, event.target.checked)} className="mt-0.5 h-5 w-5 rounded border-zinc-700 accent-emerald-500" />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${item.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{item.title}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-600">{item.section}{item.completed_at ? ` · Checked ${new Date(item.completed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</span>
                    </span>
                  </label>)}
                </div>}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-7">
              <h3 className="mb-5 text-lg font-bold text-white">Full Brief</h3>
              <BriefContent content={selected.content} />
            </section>
          </main>
        </div>
      )}
    </div>
  );
}
