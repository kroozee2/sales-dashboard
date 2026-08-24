"use client";

import { useEffect, useMemo, useState } from "react";
import type { MorningBrief } from "@/lib/morning-brief";
import { formatSalesCallDate, organizeMorningBrief } from "@/lib/morning-brief-view";

type BriefDocument = { version: 1; briefs: MorningBrief[] };
type SalesCall = { id: string; name: string; call_date: string; call_type?: string | null; result?: string | null; deal_amount?: number | null };
type SalesSnapshot = { upcomingCalls: SalesCall[]; recentCalls: SalesCall[] };

const EMPTY_SALES: SalesSnapshot = { upcomingCalls: [], recentCalls: [] };

function formatDate(date: string, options?: Intl.DateTimeFormatOptions) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", options ?? { weekday: "long", month: "long", day: "numeric" });
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return <>{parts.map((part, index) => part.startsWith("http") ? (
    <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="break-all text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200">{part}</a>
  ) : <span key={index}>{part.replace(/\*\*/g, "")}</span>)}</>;
}

function BriefContent({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-6 text-zinc-300">
      {content.split("\n").map((raw, index) => {
        const line = raw.trim();
        if (!line) return <div key={index} className="h-1" />;
        if (line.startsWith("## ")) return <h3 key={index} className="pt-4 first:pt-0 text-base font-bold text-white"><InlineText text={line.slice(3)} /></h3>;
        if (line.startsWith("### ")) return <h4 key={index} className="pt-3 first:pt-0 text-xs font-bold uppercase tracking-[0.14em] text-zinc-500"><InlineText text={line.slice(4)} /></h4>;
        if (/^\d+\.\s/.test(line)) return <div key={index} className="flex gap-3"><span className="font-bold text-sky-400">{line.match(/^\d+/)?.[0]}.</span><p><InlineText text={line.replace(/^\d+\.\s*/, "")} /></p></div>;
        if (/^[-*]\s/.test(line)) return <div key={index} className="flex gap-3"><span className="text-sky-400">•</span><p><InlineText text={line.replace(/^[-*]\s*/, "")} /></p></div>;
        return <p key={index}><InlineText text={line} /></p>;
      })}
    </div>
  );
}

function SectionCard({ number, eyebrow, title, description, children, accent = "sky" }: {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  accent?: "sky" | "violet" | "emerald" | "amber";
}) {
  const accents = {
    sky: "border-sky-500/25 bg-sky-500/10 text-sky-300",
    violet: "border-violet-500/25 bg-violet-500/10 text-violet-300",
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  };
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
      <div className="border-b border-zinc-800/90 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-black ${accents[accent]}`}>{number}</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">{eyebrow}</p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-white sm:text-xl">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-zinc-500">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-7 text-center text-sm text-zinc-600">{children}</div>;
}

function CallList({ calls, empty, future }: { calls: SalesCall[]; empty: string; future: boolean }) {
  if (!calls.length) return <EmptyState>{empty}</EmptyState>;
  return <div className="space-y-2">{calls.map((call) => (
    <a key={call.id} href="/calls" className="group flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3.5 transition hover:border-zinc-700 hover:bg-zinc-950">
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-zinc-100 group-hover:text-white">{call.name}</span>
        <span className="mt-1 block text-xs text-zinc-500">{formatSalesCallDate(call.call_date)}{future && call.call_type ? ` · ${call.call_type.replace(/^\S+\s*/, "")}` : ""}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${future ? "bg-violet-500/10 text-violet-300" : call.result === "✅ Sale" ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>{future ? "Upcoming" : call.result?.replace(/^\S+\s*/, "") || "Complete"}</span>
    </a>
  ))}</div>;
}

export default function MorningBriefPage() {
  const [document, setDocument] = useState<BriefDocument | null>(null);
  const [sales, setSales] = useState<SalesSnapshot>(EMPTY_SALES);
  const [salesError, setSalesError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/morning-briefs").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load morning briefs");
        return data as BriefDocument;
      }),
      fetch("/api/home?period=month")
        .then(async (response) => {
          if (!response.ok) return { snapshot: EMPTY_SALES, error: "Sales call data is unavailable right now." };
          return { snapshot: await response.json() as SalesSnapshot, error: "" };
        })
        .catch(() => ({ snapshot: EMPTY_SALES, error: "Sales call data is unavailable right now." })),
    ])
      .then(([briefs, salesResult]) => {
        setDocument(briefs);
        setSelectedId(briefs.briefs[0]?.id ?? null);
        setSales({ upcomingCalls: salesResult.snapshot.upcomingCalls ?? [], recentCalls: salesResult.snapshot.recentCalls ?? [] });
        setSalesError(salesResult.error);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load morning brief"));
  }, []);

  const selected = useMemo(() => document?.briefs.find((brief) => brief.id === selectedId) ?? document?.briefs[0] ?? null, [document, selectedId]);
  const workspace = useMemo(() => selected ? organizeMorningBrief(selected.content) : [], [selected]);
  const workspaceById = useMemo(() => new Map(workspace.map((section) => [section.id, section.content])), [workspace]);
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

  if (!document && !error) return <p className="py-20 text-center text-zinc-500 animate-pulse">Jarvis is opening your command center…</p>;

  return (
    <div className="w-full pb-12">
      <header className="mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_38%),linear-gradient(135deg,rgba(24,24,27,0.96),rgba(9,9,11,0.98))] p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-sky-400">Jarvis · Daily Command Center</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-4xl">Your Morning Brief</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">The people, calls, sales opportunities, and client moves that deserve your attention today.</p>
          </div>
          {selected && <div className="flex items-center gap-4 rounded-xl border border-zinc-700/70 bg-black/20 px-4 py-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-sm font-black text-white" style={{ background: `conic-gradient(#34d399 ${progress * 3.6}deg, #27272a 0deg)` }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-950">{progress}%</span>
            </div>
            <div>
              <p className="text-xs font-bold text-white">{doneCount} of {totalCount} wins complete</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-600">Today&apos;s execution</p>
            </div>
          </div>}
        </div>
      </header>

      {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {!selected ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-16 text-center">
          <p className="text-4xl">☀️</p>
          <h2 className="mt-3 text-lg font-bold text-white">Your first brief will appear here</h2>
          <p className="mt-1 text-sm text-zinc-500">Jarvis saves a fresh command center here each morning.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-8 xl:self-start">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Brief History</p>
            <div className="flex gap-2 overflow-x-auto pb-2 xl:block xl:space-y-2 xl:overflow-visible">
              {document?.briefs.map((brief) => {
                const done = brief.checklist.filter((item) => item.done).length;
                return <button key={brief.id} aria-pressed={brief.id === selected.id} onClick={() => setSelectedId(brief.id)} className={`min-w-40 rounded-xl border p-3 text-left transition-colors xl:w-full ${brief.id === selected.id ? "border-sky-500/50 bg-sky-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}>
                  <p className={`text-sm font-bold ${brief.id === selected.id ? "text-sky-200" : "text-zinc-200"}`}>{formatDate(brief.date, { weekday: "short", month: "short", day: "numeric" })}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{done}/{brief.checklist.length} wins</p>
                </button>;
              })}
            </div>
          </aside>

          <main className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-sky-400">{formatDate(selected.date)}</p>
              <h2 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">{selected.title}</h2>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-300">{selected.summary}</p>
            </section>

            <SectionCard number="1" eyebrow="Relationships + Revenue" title="1. Morning Setter" description="Who needs a reply, who deserves proactive outreach, and the draft Jarvis recommends sending.">
              {workspaceById.get("morning-setter") ? <BriefContent content={workspaceById.get("morning-setter")!} /> : <EmptyState>No priority replies or reach-outs were flagged in this brief.</EmptyState>}
            </SectionCard>

            <SectionCard number="2" eyebrow="Calendar" title="2. Calls Today" description="Your real calendar, with the preparation, outcome, and questions for each important call." accent="violet">
              {workspaceById.get("calls-today") ? <BriefContent content={workspaceById.get("calls-today")!} /> : <EmptyState>No calendar calls were captured in this saved brief.</EmptyState>}
            </SectionCard>

            <SectionCard number="3" eyebrow="Pipeline" title="3. Sales Calls" description="A live view of what just happened and what is coming next in the SalesOS call pipeline." accent="amber">
              {workspaceById.get("sales") && <div className="mb-6 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4"><BriefContent content={workspaceById.get("sales")!} /></div>}
              {salesError ? <div role="alert"><EmptyState>Sales call data is unavailable right now. Open Sales Calls to verify the pipeline.</EmptyState></div> : <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Future Sales Calls</h3>
                    <a href="/calls" className="text-xs text-zinc-500 hover:text-white">Open calls →</a>
                  </div>
                  <CallList calls={sales.upcomingCalls} future empty="No future sales calls are currently in SalesOS." />
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Past Sales Calls</h3>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-600">Newest first</span>
                  </div>
                  <CallList calls={sales.recentCalls} future={false} empty="No completed sales calls were found." />
                </div>
              </div>}
            </SectionCard>

            <SectionCard number="4" eyebrow="Retention + Results" title="4. Client Success" description="The client actions that protect momentum, implementation, relationships, and retention." accent="emerald">
              {workspaceById.get("clients") ? <BriefContent content={workspaceById.get("clients")!} /> : <EmptyState>No client-specific action was captured. Jarvis will call these out explicitly in future briefs.</EmptyState>}
            </SectionCard>

            <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80">
              <div className="border-b border-zinc-800 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">Execution</p>
                    <h2 className="mt-1 text-lg font-extrabold text-white">Today&apos;s Wins</h2>
                  </div>
                  <span className="text-xs text-zinc-500">{doneCount}/{totalCount}</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label="Morning brief completion" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="space-y-2 p-5 sm:p-6">
                {selected.checklist.length === 0 ? <EmptyState>No wins were included in this brief.</EmptyState> : selected.checklist.map((item) => <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${item.done ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"}`}>
                  <input type="checkbox" checked={item.done} disabled={savingItem === item.id} onChange={(event) => toggle(item.id, event.target.checked)} className="mt-0.5 h-5 w-5 rounded border-zinc-700 accent-emerald-500" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${item.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{item.title}</span>
                    <span className="mt-0.5 block text-[11px] text-zinc-600">{item.section}{item.completed_at ? ` · Checked ${new Date(item.completed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</span>
                  </span>
                </label>)}
              </div>
            </section>

            {(workspaceById.get("priorities") || workspaceById.get("details")) && <details className="group rounded-2xl border border-zinc-800 bg-zinc-900/60">
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-bold text-zinc-300 marker:hidden sm:px-6">Full executive detail <span className="ml-1 text-zinc-600 group-open:hidden">+</span><span className="ml-1 hidden text-zinc-600 group-open:inline">−</span></summary>
              <div className="border-t border-zinc-800 p-5 sm:p-6">
                <BriefContent content={[workspaceById.get("priorities"), workspaceById.get("details")].filter(Boolean).join("\n\n")} />
              </div>
            </details>}
          </main>
        </div>
      )}
    </div>
  );
}
