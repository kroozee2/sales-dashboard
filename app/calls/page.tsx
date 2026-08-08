"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SalesCall, CallResult, CallType, FollowUpStatus, ProspectQuality } from "@/lib/supabase-calls";
import type { FathomRecording } from "@/app/api/calls/route";
import { ExtendedStatsBar, ResultsChart, SuccessPie, RevenueByMonth, BookingsByMonth, ResultsByMonth } from "@/components/calls-analytics";

// ─── Date range ───────────────────────────────────────────────────────────────
type DateRange = "all" | "ytd" | "qtd" | "mtd" | "custom";

function getDateBounds(range: DateRange, customStart: string, customEnd: string): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (range === "all") return { start: null, end: null };
  if (range === "mtd") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
  if (range === "ytd") return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
  if (range === "qtd") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: new Date(now.getFullYear(), q * 3, 1), end: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59) };
  }
  if (range === "custom") {
    return {
      start: customStart ? new Date(customStart) : null,
      end: customEnd ? new Date(customEnd + "T23:59:59") : null,
    };
  }
  return { start: null, end: null };
}

function filterByDateRange(calls: SalesCall[], range: DateRange, customStart: string, customEnd: string): SalesCall[] {
  const { start, end } = getDateBounds(range, customStart, customEnd);
  if (!start && !end) return calls;
  return calls.filter((c) => {
    if (!c.call_date) return false;
    const d = new Date(c.call_date);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

function DateRangeBar({ range, onChange, customStart, customEnd, onCustomStart, onCustomEnd }: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (s: string) => void;
  onCustomEnd: (s: string) => void;
}) {
  const options: { key: DateRange; label: string }[] = [
    { key: "mtd", label: "Month to Date" },
    { key: "qtd", label: "Quarter to Date" },
    { key: "ytd", label: "Year to Date" },
    { key: "all", label: "All Time" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <div className="flex flex-wrap gap-1.5">
        {options.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              range === key
                ? "bg-blue-600 text-white border-blue-500 shadow shadow-blue-500/20"
                : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStart(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <span className="text-zinc-600 text-xs">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEnd(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      )}
    </div>
  );
}

// ─── Pipeline View ────────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: "upcoming",  label: "Upcoming",       emoji: "🔜", color: "border-blue-500/40  bg-blue-500/5",  dot: "bg-blue-400",    filter: (c: SalesCall) => c.result?.includes("Upcoming") },
  { key: "followup",  label: "Follow Up",      emoji: "📣", color: "border-amber-500/40 bg-amber-500/5", dot: "bg-amber-400",   filter: (c: SalesCall) => c.result?.includes("Follow Up") },
  { key: "noshow",    label: "No Show",        emoji: "👻", color: "border-zinc-600/40  bg-zinc-800/30", dot: "bg-zinc-500",    filter: (c: SalesCall) => c.result?.includes("No Show") },
  { key: "lost",      label: "Did Not Close",  emoji: "❌", color: "border-red-500/40   bg-red-500/5",   dot: "bg-red-400",     filter: (c: SalesCall) => c.result?.includes("Did Not Close") },
  { key: "closed",    label: "Closed",         emoji: "✅", color: "border-emerald-500/40 bg-emerald-500/5", dot: "bg-emerald-400", filter: (c: SalesCall) => c.result?.includes("Sale") },
];

function PipelineView({ calls, onSelectCall }: { calls: SalesCall[]; onSelectCall: (c: SalesCall) => void }) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {PIPELINE_STAGES.map((stage) => {
          const stageCalls = calls.filter(stage.filter);
          const stageRevenue = stageCalls.reduce((s, c) => s + (c.deal_amount ?? c.new_revenue ?? 0), 0);
          return (
            <div key={stage.key} className={`w-64 flex-shrink-0 rounded-2xl border ${stage.color} flex flex-col`}>
              {/* Column header */}
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{stage.emoji}</span>
                  <span className="text-sm font-semibold text-white">{stage.label}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">{stageCalls.length}</span>
              </div>
              {stageRevenue > 0 && (
                <p className="text-xs text-emerald-400 font-medium px-3 pb-2">${stageRevenue.toLocaleString()}</p>
              )}

              {/* Cards */}
              <div className="flex flex-col gap-2 px-2 pb-3 overflow-y-auto max-h-[60vh]">
                {stageCalls.length === 0 ? (
                  <p className="text-xs text-zinc-600 text-center py-6">No calls</p>
                ) : (
                  stageCalls.map((call) => {
                    const deal = call.deal_amount ?? call.new_revenue;
                    return (
                      <button
                        key={call.id}
                        onClick={() => onSelectCall(call)}
                        className="w-full text-left bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-6 h-6 rounded-full ${avatarBg(call.name)} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                            {initials(call.name)}
                          </div>
                          <span className="text-sm font-medium text-white truncate">{call.name}</span>
                        </div>
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <span className="text-[10px] text-zinc-500">{fmtDate(call.call_date)}</span>
                          {deal != null && (
                            <span className="text-[10px] text-emerald-400 font-semibold">${deal.toLocaleString()}</span>
                          )}
                        </div>
                        {call.offer && (
                          <p className="text-[10px] text-zinc-500 mt-1 truncate">{call.offer}</p>
                        )}
                        {call.follow_up_status && (
                          <p className="text-[10px] text-amber-400 mt-0.5">{call.follow_up_status}</p>
                        )}
                        {call.recording_url && (
                          <span className="text-[10px] text-violet-400 mt-0.5 flex items-center gap-1">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg>
                            Recording
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const RESULT_OPTIONS: CallResult[] = ["✅ Sale", "📣 Follow Up", "🔜 Upcoming", "❌ Did Not Close", "👻 No Show"];
const TYPE_OPTIONS: CallType[] = ["📞 Sales Call", "🔍 Triage Call", "🤙 Connection Call", "🧑‍💼 Client Call", "🤝 Partnership Call", "🎓 Coaching Call", "🤝 JV Call", "👥 Group Call"];
const QUALITY_OPTIONS: ProspectQuality[] = ["🔥 High", "👌 Medium", "❄️ Low"];
const FOLLOW_UP_OPTIONS: FollowUpStatus[] = ["🚀 Rebook", "💳 Payment Link Sent", "📣 Sent Message", "✅ Closed", "❌ Lost"];
const BOOKING_SOURCES = ["Instagram DM", "Facebook", "Referral", "YouTube", "Email", "Skool", "Cold Outreach", "Live Event", "Unknown"];
const OBJECTION_OPTIONS = ["💰 Money", "⏰ Time", "🤔 Skepticism", "❓ Need to Think", "👫 Spouse", "📦 Program Fit", "🔄 Tried Before", "⚡ Not Ready"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase() ?? "").join("");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function avatarBg(name: string) {
  const palette = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-cyan-500","bg-indigo-500","bg-orange-500"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

function resultChip(result: string | null) {
  if (!result) return "bg-zinc-800 text-zinc-400";
  if (result.includes("Sale")) return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
  if (result.includes("Follow Up")) return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
  if (result.includes("Upcoming")) return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
  if (result.includes("Did Not Close")) return "bg-red-500/20 text-red-400 border border-red-500/30";
  if (result.includes("No Show")) return "bg-zinc-700 text-zinc-400";
  return "bg-zinc-800 text-zinc-400";
}

function resultDot(result: string | null) {
  if (!result) return "bg-zinc-600";
  if (result.includes("Sale")) return "bg-emerald-400";
  if (result.includes("Follow Up")) return "bg-amber-400";
  if (result.includes("Upcoming")) return "bg-blue-400";
  if (result.includes("Did Not Close")) return "bg-red-400";
  return "bg-zinc-500";
}

// Color a call by its TYPE (used for upcoming calls). Past calls color by result.
const TYPE_COLORS: Record<string, { chip: string; cal: string; dot: string }> = {
  "📞 Sales Call":       { chip: "bg-blue-500/20 text-blue-400 border border-blue-500/30",       cal: "bg-blue-500/20 text-blue-300 border-blue-500/40",       dot: "bg-blue-400" },
  "🔍 Triage Call":      { chip: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",       cal: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",       dot: "bg-cyan-400" },
  "🤙 Connection Call":  { chip: "bg-violet-500/20 text-violet-400 border border-violet-500/30", cal: "bg-violet-500/20 text-violet-300 border-violet-500/40", dot: "bg-violet-400" },
  "🧑‍💼 Client Call":     { chip: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30", cal: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", dot: "bg-emerald-400" },
  "🤝 Partnership Call": { chip: "bg-amber-500/20 text-amber-400 border border-amber-500/30",     cal: "bg-amber-500/20 text-amber-300 border-amber-500/40",     dot: "bg-amber-400" },
  "🎓 Coaching Call":    { chip: "bg-pink-500/20 text-pink-400 border border-pink-500/30",        cal: "bg-pink-500/20 text-pink-300 border-pink-500/40",        dot: "bg-pink-400" },
  "🤝 JV Call":          { chip: "bg-orange-500/20 text-orange-400 border border-orange-500/30",  cal: "bg-orange-500/20 text-orange-300 border-orange-500/40",  dot: "bg-orange-400" },
  "👥 Group Call":       { chip: "bg-teal-500/20 text-teal-400 border border-teal-500/30",        cal: "bg-teal-500/20 text-teal-300 border-teal-500/40",        dot: "bg-teal-400" },
};
const typeMeta = (t: string | null) => (t ? TYPE_COLORS[t] : undefined) ?? { chip: "bg-zinc-800 text-zinc-400", cal: "bg-zinc-800/80 text-zinc-300 border-zinc-700", dot: "bg-zinc-500" };

// A call is "upcoming" until it has a real logged result.
function callUpcoming(c: SalesCall) {
  if (c.result && !c.result.includes("Upcoming")) return false;
  if (!c.call_date) return true;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return new Date(c.call_date) >= start;
}
// Upcoming → color by call type; past → color by result.
const callCalChip = (c: SalesCall) => callUpcoming(c) ? typeMeta(c.call_type).cal : calChip(c.result);
const callDotColor = (c: SalesCall) => callUpcoming(c) ? typeMeta(c.call_type).dot : resultDot(c.result);

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ calls }: { calls: SalesCall[] }) {
  const completed = calls.filter((c) => c.result && !c.result.includes("Upcoming"));
  const sales = calls.filter((c) => c.result?.includes("Sale"));
  const offerMade = calls.filter((c) => c.offer_made || c.offer);
  const closeRate = completed.length ? Math.round((sales.length / completed.length) * 100) : 0;
  const offerRate = completed.length ? Math.round((offerMade.length / completed.length) * 100) : 0;
  const totalRevenue = calls.reduce((s, c) => s + (c.deal_amount ?? c.new_revenue ?? 0), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard label="Total Calls" value={calls.length} color="text-white" />
      <StatCard label="Close Rate" value={`${closeRate}%`} color={closeRate >= 20 ? "text-emerald-400" : "text-amber-400"} sub={`${sales.length} of ${completed.length} calls`} />
      <StatCard label="Offer Made Rate" value={`${offerRate}%`} color="text-violet-400" sub={`${offerMade.length} offers`} />
      <StatCard label="Total Deal Value" value={totalRevenue ? `$${totalRevenue.toLocaleString()}` : "$0"} color="text-emerald-400" />
    </div>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-xs text-zinc-500 mb-1 font-medium">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────
type Filter = "action" | "all" | "followup" | "sale" | "upcoming" | "lost";

// A call needs action when: follow-up is due/overdue/undated, or the call happened but no outcome was logged
export function needsAction(c: SalesCall): boolean {
  const today = new Date().toISOString().split("T")[0];
  if (c.result?.includes("Follow Up") && c.follow_up_status !== "✅ Closed" && c.follow_up_status !== "❌ Lost") {
    if (!c.follow_up_date || c.follow_up_date <= today) return true;
  }
  if (c.call_date && c.call_date.split("T")[0] < today && (!c.result || c.result.includes("Upcoming"))) return true;
  return false;
}

// ─── Follow-Up Priority Queue ─────────────────────────────────────────────────
// Ranks who to follow up with next: overdue urgency + deal size + prospect heat.
function followUpScore(c: SalesCall): number {
  const today = new Date().toISOString().split("T")[0];
  let score = 0;
  if (c.follow_up_date) {
    const overdue = Math.floor((new Date(today).getTime() - new Date(c.follow_up_date).getTime()) / 86400000);
    if (overdue >= 0) score += 20 + Math.min(overdue, 14) * 8; // due today or overdue
  } else {
    score += 15; // orphaned, needs triage
  }
  score += Math.min((c.deal_amount ?? 0) / 500, 40); // up to +40 for big deals
  if (c.prospect_quality === "🔥 High") score += 25;
  else if (c.prospect_quality === "👌 Medium") score += 10;
  if (c.objections?.length) score += 8; // known objection = known play
  if (c.phone || c.ghl_contact_id) score += 5; // reachable now
  return Math.round(score);
}

function suggestedPlay(c: SalesCall): string {
  const obj = c.objections?.[0] ?? "";
  if (/spouse|partner|husband|wife/i.test(obj)) return "Partner objection → offer a quick 3-way call to answer questions together";
  if (/price|expensive|afford|money|budget/i.test(obj)) return "Price objection → reframe cost of staying stuck, offer payment plan or $47 trial";
  if (/time|busy|timing/i.test(obj)) return "Timing objection → shrink the first step, anchor to what waiting costs them";
  if (/think|decide|consider/i.test(obj)) return "'Think about it' → ask what specifically they're weighing, answer that one thing";
  if (/trust|burned|vendor|scam/i.test(obj)) return "Trust objection → lead with concrete proof and a small first win, not promises";
  if (c.follow_up_notes) return c.follow_up_notes;
  if (c.result?.includes("No Show")) return "No-show → short zero-judgment check-in + rebook link";
  if (!c.result || c.result.includes("Upcoming")) return "Call happened but outcome never logged → log it first";
  return "Warm check-in referencing what they said they want, then the next step";
}

function FollowUpQueue({ calls, onSelect, onUpdate }: {
  calls: SalesCall[];
  onSelect: (c: SalesCall) => void;
  onUpdate: (id: string, updates: Partial<SalesCall>) => void;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());

  const queue = calls
    .filter((c) => needsAction(c) && !done.has(c.id))
    .map((c) => ({ call: c, score: followUpScore(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const today = new Date().toISOString().split("T")[0];

  async function resolve(c: SalesCall, nextDays: number | null) {
    setDone((prev) => new Set(prev).add(c.id));
    const updates: Partial<SalesCall> = {
      follow_up_count: (c.follow_up_count ?? 0) + 1,
    };
    if (nextDays === null) {
      updates.follow_up_status = "❌ Lost";
    } else {
      updates.follow_up_date = new Date(Date.now() + nextDays * 86400000).toISOString().split("T")[0];
      updates.follow_up_status = "📣 Sent Message";
    }
    onUpdate(c.id, updates);
    await fetch("/api/sales-calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, ...updates }),
    });
  }

  if (queue.length === 0) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-12 text-center">
      <p className="text-3xl mb-2">🎉</p>
      <p className="text-white text-sm font-semibold">No follow-ups need you right now</p>
      <p className="text-zinc-500 text-xs mt-1">Everything with a due date is handled. Check the Calls tab for the full list.</p>
    </div>
  );

  return (
    <div className="bg-gradient-to-br from-violet-950/40 to-zinc-900 border border-violet-800/40 rounded-2xl overflow-hidden mb-6">
      <div className="px-5 py-3.5 border-b border-violet-800/30 flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-sm">🎯 Follow Up Next</p>
          <p className="text-zinc-500 text-xs mt-0.5">Ranked by urgency, deal size, and heat — work top to bottom</p>
        </div>
        <span className="text-violet-300 text-xs font-semibold bg-violet-500/20 border border-violet-500/30 rounded-full px-2.5 py-1">{queue.length} up</span>
      </div>
      <div className="divide-y divide-zinc-800/50">
        {queue.map(({ call: c, score }, i) => {
          const overdueDays = c.follow_up_date
            ? Math.floor((new Date(today).getTime() - new Date(c.follow_up_date).getTime()) / 86400000)
            : null;
          return (
            <div key={c.id} className="px-5 py-3.5 hover:bg-violet-500/5 transition-colors">
              <button onClick={() => onSelect(c)} className="w-full text-left">
                <div className="flex items-start gap-3">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-violet-500 text-white" : "bg-zinc-800 text-zinc-400"}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-semibold">{c.name}</p>
                      {(c.deal_amount ?? c.new_revenue) ? <span className="text-emerald-400 text-xs font-bold">${(c.deal_amount ?? c.new_revenue)!.toLocaleString()}</span> : null}
                      {c.prospect_quality === "🔥 High" && <span className="text-xs">🔥</span>}
                      {overdueDays !== null && overdueDays > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">{overdueDays}d OVERDUE</span>
                      )}
                      {overdueDays === 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">DUE TODAY</span>}
                      {overdueDays === null && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">NO DATE</span>}
                      <span className="ml-auto text-zinc-600 text-[10px] font-mono flex-shrink-0">{score}pts</span>
                    </div>
                    <p className="text-zinc-400 text-xs mt-1 leading-snug line-clamp-2">💡 {suggestedPlay(c)}</p>
                  </div>
                </div>
              </button>
              {/* One-tap contact + resolve */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2.5 pl-9">
                {c.ghl_url && (
                  <a href={c.ghl_url} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-300 text-xs font-medium transition-colors">⚡ GHL</a>
                )}
                {c.phone && (
                  <>
                    <a href={`sms:${c.phone}`} className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-medium transition-colors">💬 iMessage</a>
                    <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-300 text-xs font-medium transition-colors">📱 WhatsApp</a>
                    <a href={`tel:${c.phone}`} className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 text-xs font-medium transition-colors">📞</a>
                  </>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="px-2 py-1 rounded-lg bg-zinc-700/40 hover:bg-zinc-700 border border-zinc-600/40 text-zinc-300 text-xs font-medium transition-colors">✉️ Email</a>
                )}
                <div className="ml-auto flex gap-1.5">
                  <button onClick={() => void resolve(c, 3)} className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 text-xs font-semibold transition-colors">✓ Followed Up</button>
                  <button onClick={() => void resolve(c, 7)} className="px-2 py-1 rounded-lg bg-zinc-700/40 hover:bg-zinc-700 border border-zinc-600/40 text-zinc-400 text-xs transition-colors">+7d</button>
                  <button onClick={() => void resolve(c, null)} className="px-2 py-1 rounded-lg bg-rose-600/10 hover:bg-rose-600/30 border border-rose-600/20 text-rose-400 text-xs transition-colors">✕</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Monarch-style full-width call row + grouped list ─────────────────────────

// A compact inline select styled like a Monarch cell chip
function InlineSelect({ value, options, onChange, className = "", placeholder = "—" }: {
  value: string | null; options: readonly string[]; onChange: (v: string) => void; className?: string; placeholder?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
      className={`bg-transparent hover:bg-zinc-800 border border-transparent hover:border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 cursor-pointer transition-colors truncate ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function CallRow({ call, onOpen, onUpdate }: { call: SalesCall; onOpen: () => void; onUpdate: (id: string, patch: Partial<SalesCall>) => void }) {
  const deal = call.deal_amount ?? call.new_revenue;
  const d = call.call_date ? new Date(call.call_date) : null;
  return (
    <div className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-800/50 transition-colors group">
      <button onClick={onOpen} className={`w-9 h-9 rounded-full ${avatarBg(call.name)} flex items-center justify-center text-white font-semibold text-xs flex-shrink-0`}>
        {initials(call.name)}
      </button>
      {/* Name + time — click to open */}
      <button onClick={onOpen} className="min-w-0 text-left" style={{ flex: "2 1 0%" }}>
        <p className="font-medium text-white text-sm truncate">{call.name}</p>
        <p className="text-zinc-600 text-xs truncate">{d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "no date"}</p>
      </button>
      {/* Result — inline editable, color-coded */}
      <div className="hidden sm:block w-[150px] flex-shrink-0">
        <select
          value={call.result ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onUpdate(call.id, { result: (e.target.value || null) as CallResult }); }}
          className={`w-full rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-500 border ${resultChip(call.result)}`}
        >
          <option value="">No result</option>
          {RESULT_OPTIONS.map((o) => <option key={o} value={o} className="bg-zinc-900 text-zinc-200">{o}</option>)}
        </select>
      </div>
      {/* Type — inline editable */}
      <div className="hidden xl:block w-[140px] flex-shrink-0">
        <InlineSelect value={call.call_type} options={TYPE_OPTIONS} onChange={(v) => onUpdate(call.id, { call_type: (v || null) as CallType })} placeholder="Type" className="w-full" />
      </div>
      {/* Offer — fills space, click to open */}
      <button onClick={onOpen} className="hidden lg:block text-left min-w-0 text-zinc-500 text-xs truncate" style={{ flex: "1.5 1 0%" }}>
        {call.offer || <span className="text-zinc-700">—</span>}
      </button>
      {/* Call date — inline editable */}
      <div className="hidden xl:block w-[150px] flex-shrink-0">
        <input
          type="date"
          value={call.call_date ? call.call_date.split("T")[0] : ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            const v = e.target.value;
            // keep the original time-of-day if we had one, else noon
            const time = call.call_date ? call.call_date.split("T")[1] : null;
            onUpdate(call.id, { call_date: v ? (time ? `${v}T${time}` : new Date(v + "T12:00").toISOString()) : null });
          }}
          className="w-full bg-transparent hover:bg-zinc-800 border border-transparent hover:border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 cursor-pointer transition-colors"
        />
      </div>
      {/* Amount + rec — click to open */}
      <button onClick={onOpen} className="w-[100px] flex-shrink-0 text-right">
        {deal != null ? <p className="text-emerald-400 font-bold text-sm">${deal.toLocaleString()}</p> : <p className="text-zinc-700 text-sm">—</p>}
        {call.recording_url && <p className="text-violet-400/70 text-[10px]">Rec</p>}
      </button>
      <button onClick={onOpen} className="flex-shrink-0">
        <svg className="w-4 h-4 text-zinc-700 group-hover:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );
}

function GroupedCallList({ calls, onSelect, onUpdate }: { calls: SalesCall[]; onSelect: (c: SalesCall) => void; onUpdate: (id: string, patch: Partial<SalesCall>) => void }) {
  // Group by calendar date (most recent first), preserving the incoming sort within a day
  const groups: { key: string; label: string; items: SalesCall[]; total: number }[] = [];
  const byKey = new Map<string, SalesCall[]>();
  for (const c of calls) {
    const key = c.call_date ? c.call_date.split("T")[0] : "no-date";
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(c);
  }
  for (const [key, items] of byKey) {
    const label = key === "no-date"
      ? "No date"
      : new Date(key + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
    const total = items.reduce((s, c) => s + (c.deal_amount ?? c.new_revenue ?? 0), 0);
    groups.push({ key, label, items, total });
  }

  // Order the day-groups by date: upcoming (today or later) soonest-first,
  // then past days most-recent-first, then any without a date.
  const today = new Date().toISOString().split("T")[0];
  groups.sort((a, b) => {
    if (a.key === "no-date") return 1;
    if (b.key === "no-date") return -1;
    const aUp = a.key >= today;
    const bUp = b.key >= today;
    if (aUp !== bUp) return aUp ? -1 : 1;       // upcoming block first
    return aUp ? a.key.localeCompare(b.key)     // upcoming: ascending (soonest first)
               : b.key.localeCompare(a.key);    // past: descending (most recent first)
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Column header (Monarch-style) */}
      <div className="hidden sm:flex items-center gap-2 px-4 py-2 border-b border-zinc-800 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
        <span className="w-9 flex-shrink-0" />
        <span style={{ flex: "2 1 0%" }}>Prospect</span>
        <span className="w-[150px] flex-shrink-0">Result</span>
        <span className="hidden xl:block w-[140px] flex-shrink-0">Type</span>
        <span className="hidden lg:block" style={{ flex: "1.5 1 0%" }}>Offer</span>
        <span className="hidden xl:block w-[150px] flex-shrink-0">Date</span>
        <span className="w-[100px] flex-shrink-0 text-right">Amount</span>
        <span className="w-4 flex-shrink-0" />
      </div>
      {groups.map((g) => (
        <div key={g.key}>
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/40 border-y border-zinc-800/60">
            <span className="text-xs font-semibold text-zinc-400">{g.label}</span>
            <span className="text-xs text-zinc-600">{g.items.length} call{g.items.length === 1 ? "" : "s"}{g.total > 0 ? ` · $${g.total.toLocaleString()}` : ""}</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {g.items.map((c) => <CallRow key={c.id} call={c} onOpen={() => onSelect(c)} onUpdate={onUpdate} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Calendar View — drag-to-reschedule month board ───────────────────────────
function fmtCallTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  // Skip midnight (dateless) times to avoid a misleading "12:00 AM"
  if (d.getHours() === 0 && d.getMinutes() === 0) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
}

// Chip color by result — matches the list/pipeline palette
function calChip(result: string | null) {
  if (!result) return "bg-zinc-800/80 text-zinc-300 border-zinc-700";
  if (result.includes("Sale")) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (result.includes("Follow Up")) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  if (result.includes("Upcoming")) return "bg-blue-500/20 text-blue-300 border-blue-500/40";
  if (result.includes("Did Not Close")) return "bg-red-500/20 text-red-300 border-red-500/40";
  if (result.includes("No Show")) return "bg-zinc-700/60 text-zinc-400 border-zinc-600";
  return "bg-zinc-800/80 text-zinc-300 border-zinc-700";
}

function CalendarView({ calls, onSelectCall, onReschedule }: {
  calls: SalesCall[];
  onSelectCall: (c: SalesCall) => void;
  onReschedule?: (id: string, patch: Partial<SalesCall>) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [drag, setDrag] = useState<{ id: string; name: string; result: string | null; chip: string; x: number; y: number; moved: boolean } | null>(null);
  const [overDay, setOverDay] = useState<number | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDate()); // mobile day view
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();

  const callsByDay: Record<number, SalesCall[]> = {};
  calls.forEach((c) => {
    if (!c.call_date) return;
    const d = new Date(c.call_date);
    if (d.getFullYear() === year && d.getMonth() === mon) {
      const day = d.getDate();
      (callsByDay[day] ??= []).push(c);
    }
  });
  // Within a day, order by time
  Object.values(callsByDay).forEach((arr) =>
    arr.sort((a, b) => (a.call_date ?? "").localeCompare(b.call_date ?? ""))
  );

  const prev = () => { setMonth(new Date(year, mon - 1, 1)); setExpandedDay(null); setSelectedDay(null); };
  const next = () => { setMonth(new Date(year, mon + 1, 1)); setExpandedDay(null); setSelectedDay(null); };
  const goToday = () => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setExpandedDay(null); setSelectedDay(d.getDate()); };

  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Build a full grid (leading + trailing blanks) so weeks line up cleanly
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Month summary
  const monthCalls = Object.values(callsByDay).flat();
  const sales = monthCalls.filter((c) => c.result?.includes("Sale")).length;
  const upcoming = monthCalls.filter((c) => c.result?.includes("Upcoming")).length;
  const followups = monthCalls.filter((c) => c.result?.includes("Follow Up")).length;

  // Which day cell is under this screen point? (reads data-cal-day on the cell)
  function dayUnderPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el?.closest("[data-cal-day]") as HTMLElement | null;
    const d = cell?.getAttribute("data-cal-day");
    return d ? parseInt(d, 10) : null;
  }

  function commitDrop(day: number, id: string) {
    if (!onReschedule) return;
    const c = calls.find((x) => x.id === id);
    if (!c) return;
    const orig = c.call_date ? new Date(c.call_date) : null;
    if (orig && orig.getFullYear() === year && orig.getMonth() === mon && orig.getDate() === day) return; // no-op
    const hh = orig ? orig.getHours() : 12;
    const mm = orig ? orig.getMinutes() : 0;
    const nd = new Date(year, mon, day, hh, mm);
    onReschedule(id, { call_date: nd.toISOString() });
  }

  // Pointer-based drag: robust, works on mouse + touch, distinguishes click from drag
  function Chip({ c }: { c: SalesCall }) {
    const time = fmtCallTime(c.call_date);
    const isDragging = drag?.id === c.id && drag.moved;
    return (
      <div
        draggable={false}
        onPointerDown={onReschedule ? (e) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
          startRef.current = { x: e.clientX, y: e.clientY };
          setDrag({ id: c.id, name: c.name, result: c.result, chip: callCalChip(c), x: e.clientX, y: e.clientY, moved: false });
        } : undefined}
        onPointerMove={onReschedule ? (e) => {
          if (!drag || drag.id !== c.id || !startRef.current) return;
          const moved = drag.moved || Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y) > 5;
          if (moved) {
            const day = dayUnderPoint(e.clientX, e.clientY);
            if (day !== overDay) setOverDay(day);
          }
          setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
        } : undefined}
        onPointerUp={onReschedule ? (e) => {
          if (!drag || drag.id !== c.id) return;
          const wasMoved = drag.moved;
          const day = dayUnderPoint(e.clientX, e.clientY);
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
          setDrag(null); setOverDay(null); startRef.current = null;
          if (!wasMoved) onSelectCall(c);
          else if (day != null) commitDrop(day, c.id);
        } : undefined}
        onClick={onReschedule ? undefined : () => onSelectCall(c)}
        title={`${c.name}${c.result ? ` · ${c.result}` : ""}${time ? ` · ${time}` : ""}`}
        style={onReschedule ? { touchAction: "none" } : undefined}
        className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] leading-tight cursor-pointer select-none hover:brightness-125 transition-all ${callCalChip(c)} ${isDragging ? "opacity-30" : ""}`}
      >
        {time && <span className="font-semibold tabular-nums opacity-80 flex-shrink-0">{time}</span>}
        <span className="truncate font-medium">{c.name}</span>
        {(c.deal_amount ?? c.new_revenue) ? (
          <span className="ml-auto font-bold flex-shrink-0">${((c.deal_amount ?? c.new_revenue)! / 1000).toFixed(0)}k</span>
        ) : null}
      </div>
    );
  }

  const todayObj = new Date();

  return (
    <div className={`relative bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 ${drag?.moved ? "select-none" : ""}`}>
      {/* Floating drag ghost */}
      {drag?.moved && (
        <div className="fixed z-[60] pointer-events-none" style={{ left: drag.x + 10, top: drag.y + 6 }}>
          <div className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-medium shadow-2xl ${drag.chip}`}>
            <span className="truncate max-w-[140px]">{drag.name}</span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-base font-bold text-white min-w-[150px] text-center">{monthLabel}</span>
          <button onClick={next} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <button onClick={goToday} className="ml-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors">Today</button>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-zinc-500">🔜 <span className="text-blue-400 font-semibold">{upcoming}</span> upcoming</span>
          <span className="text-zinc-500">📣 <span className="text-amber-400 font-semibold">{followups}</span> follow-up</span>
          <span className="text-zinc-500">✅ <span className="text-emerald-400 font-semibold">{sales}</span> sales</span>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((d) => (
          <div key={d} className="text-center text-[11px] text-zinc-600 font-semibold uppercase tracking-wide py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="rounded-xl bg-zinc-950/40 min-h-[104px]" />;
          const dayCalls = callsByDay[day] ?? [];
          const isToday = todayObj.getFullYear() === year && todayObj.getMonth() === mon && todayObj.getDate() === day;
          const dow = (firstDay + day - 1) % 7;
          const isWeekend = dow === 0 || dow === 6;
          const isOver = overDay === day;
          const shown = dayCalls.slice(0, 3);
          const extra = dayCalls.length - shown.length;

          const isSelected = selectedDay === day;
          return (
            <div
              key={day}
              data-cal-day={day}
              onClick={() => setSelectedDay(day)}
              className={`relative min-h-[52px] sm:min-h-[104px] rounded-xl p-1 sm:p-1.5 border transition-colors cursor-pointer ${
                isOver ? "border-violet-500 bg-violet-600/15 ring-1 ring-violet-500/50"
                : isSelected ? "border-violet-500/60 bg-violet-600/15 sm:border-violet-500/40 sm:bg-violet-600/[0.07]"
                : isToday ? "border-violet-500/40 bg-violet-600/[0.07]"
                : isWeekend ? "border-transparent bg-zinc-950/30 hover:bg-zinc-800/40"
                : "border-transparent hover:bg-zinc-800/40"
              }`}
            >
              <div className="flex items-center justify-between sm:mb-1">
                <span className={`text-xs font-semibold ${isToday ? "text-violet-300" : "text-zinc-500"}`}>
                  {isToday ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-600 text-white text-[11px]">{day}</span> : day}
                </span>
                {dayCalls.length > 0 && <span className="hidden sm:inline text-[10px] text-zinc-600 font-medium">{dayCalls.length}</span>}
              </div>
              {/* Desktop: chips */}
              <div className="hidden sm:block space-y-1">
                {shown.map((c) => <Chip key={c.id} c={c} />)}
                {extra > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedDay(expandedDay === day ? null : day); }}
                    className="w-full text-left text-[11px] text-zinc-500 hover:text-white font-medium pl-1 transition-colors"
                  >
                    +{extra} more
                  </button>
                )}
              </div>
              {/* Mobile: colored dots */}
              {dayCalls.length > 0 && (
                <div className="sm:hidden flex flex-wrap gap-0.5 mt-0.5 justify-center">
                  {dayCalls.slice(0, 4).map((c) => <span key={c.id} className={`w-1.5 h-1.5 rounded-full ${callDotColor(c)}`} />)}
                  {dayCalls.length > 4 && <span className="text-[8px] text-zinc-500 leading-none">+{dayCalls.length - 4}</span>}
                </div>
              )}

              {/* Expanded day popover (desktop) */}
              {expandedDay === day && (
                <>
                  <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setExpandedDay(null); }} />
                  <div className="absolute z-40 top-8 left-1/2 -translate-x-1/2 w-56 max-h-72 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-2 space-y-1">
                    <p className="text-[11px] text-zinc-500 font-semibold px-1 pb-1">
                      {month.toLocaleDateString("en-US", { month: "short" })} {day} · {dayCalls.length} calls
                    </p>
                    {dayCalls.map((c) => <Chip key={c.id} c={c} />)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: selected-day agenda */}
      <div className="sm:hidden mt-3">
        {(() => {
          const dc = selectedDay ? (callsByDay[selectedDay] ?? []) : [];
          const label = selectedDay ? new Date(year, mon, selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "";
          return (
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{selectedDay ? label : "Tap a day"}</span>
                <span className="text-xs text-zinc-500">{dc.length} call{dc.length === 1 ? "" : "s"}</span>
              </div>
              {dc.length === 0 ? (
                <div className="px-4 py-6 text-center text-zinc-600 text-sm">No calls this day.</div>
              ) : (
                <div className="divide-y divide-zinc-800/60">
                  {dc.map((c) => (
                    <button key={c.id} onClick={() => onSelectCall(c)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors">
                      <span className="text-[11px] text-zinc-500 w-14 flex-shrink-0 tabular-nums">{fmtCallTime(c.call_date) || "—"}</span>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${callDotColor(c)}`} />
                      <span className="text-sm text-white truncate flex-1">{c.name}</span>
                      {callUpcoming(c)
                  ? (c.call_type && <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${typeMeta(c.call_type).chip}`}>{c.call_type}</span>)
                  : (c.result && <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${resultChip(c.result)}`}>{c.result}</span>)}
                      {((c.deal_amount ?? c.new_revenue) ?? 0) > 0 && <span className="text-xs text-emerald-400 font-semibold flex-shrink-0">${((c.deal_amount ?? c.new_revenue) ?? 0).toLocaleString()}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Legend + hint */}
      <div className="hidden sm:flex items-center justify-between gap-4 mt-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { c: "bg-emerald-400", label: "Sale" },
            { c: "bg-amber-400", label: "Follow Up" },
            { c: "bg-blue-400", label: "Upcoming" },
            { c: "bg-red-400", label: "Did Not Close" },
            { c: "bg-zinc-500", label: "No Show" },
          ].map(({ c, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${c}`} />
              <span className="text-[11px] text-zinc-500">{label}</span>
            </div>
          ))}
        </div>
        {onReschedule && <span className="text-[11px] text-zinc-600">Drag a call to another day to reschedule</span>}
      </div>
    </div>
  );
}

// ─── Call Agenda — compact list beside the calendar ──────────────────────────
function CallAgenda({ calls, onSelect }: { calls: SalesCall[]; onSelect: (c: SalesCall) => void }) {
  // Group by day, upcoming (today+future) soonest-first, then past most-recent-first
  const byDay = new Map<string, SalesCall[]>();
  for (const c of calls) {
    const key = c.call_date ? c.call_date.split("T")[0] : "no-date";
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(c);
  }
  const today = new Date().toISOString().split("T")[0];
  const groups = [...byDay.entries()]
    .map(([key, items]) => ({
      key,
      items: items.slice().sort((a, b) => (a.call_date ?? "").localeCompare(b.call_date ?? "")),
    }))
    .sort((a, b) => {
      if (a.key === "no-date") return 1;
      if (b.key === "no-date") return -1;
      const aUp = a.key >= today, bUp = b.key >= today;
      if (aUp !== bUp) return aUp ? -1 : 1;
      return aUp ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key);
    });

  const label = (key: string) =>
    key === "no-date" ? "No date"
      : key === today ? "Today"
      : new Date(key + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="text-white font-semibold text-sm">🗓️ Agenda</p>
        <p className="text-zinc-600 text-xs mt-0.5">Upcoming first, then most recent</p>
      </div>
      <div className="max-h-[70vh] overflow-y-auto divide-y divide-zinc-800/60">
        {groups.map((g) => (
          <div key={g.key}>
            <div className={`px-4 py-1.5 text-[11px] font-semibold sticky top-0 backdrop-blur ${g.key === today ? "text-blue-300 bg-blue-950/30" : "text-zinc-500 bg-zinc-900/90"}`}>
              {label(g.key)} · {g.items.length}
            </div>
            {g.items.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-zinc-800/50 transition-colors text-left"
              >
                <span className="text-[11px] text-zinc-500 w-12 flex-shrink-0 tabular-nums">{fmtCallTime(c.call_date) || "—"}</span>
                <span className={`w-6 h-6 rounded-full ${avatarBg(c.name ?? "")} flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0`}>{initials(c.name ?? "?")}</span>
                <span className="text-sm text-white truncate flex-1 min-w-0">{c.name ?? "—"}</span>
                {callUpcoming(c)
                  ? (c.call_type && <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${typeMeta(c.call_type).chip}`}>{c.call_type}</span>)
                  : (c.result && <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${resultChip(c.result)}`}>{c.result}</span>)}
                {((c.deal_amount ?? c.new_revenue) ?? 0) > 0 && <span className="text-xs text-emerald-400 font-semibold flex-shrink-0">${((c.deal_amount ?? c.new_revenue) ?? 0).toLocaleString()}</span>}
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && <div className="px-4 py-8 text-center text-zinc-600 text-sm">No calls yet</div>}
      </div>
    </div>
  );
}

// ─── Outreach Buttons ─────────────────────────────────────────────────────────
function OutreachBar({ call }: { call: SalesCall }) {
  const phone = call.phone?.replace(/\D/g, "");

  return (
    <div className="flex gap-2 flex-wrap">
      {phone && (
        <>
          <a
            href={`imessage://${phone}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-500/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
            </svg>
            iMessage
          </a>
          <a
            href={`https://wa.me/${phone}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.528 5.847L0 24l6.335-1.528A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.872 0-3.629-.49-5.153-1.349l-.369-.215-3.763.908.923-3.672-.237-.385A9.96 9.96 0 012 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z" />
            </svg>
            WhatsApp
          </a>
        </>
      )}
      {call.email && (
        <a
          href={`mailto:${call.email}?from=andrew@reprogrammingproject.com`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-medium hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Gmail
        </a>
      )}
      {call.phone && (
        <GhlSmsButton call={call} />
      )}
      {call.ghl_url && (
        <a
          href={call.ghl_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-medium hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          GHL
        </a>
      )}
    </div>
  );
}

function GhlSmsButton({ call }: { call: SalesCall }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!msg.trim() || !call.ghl_contact_id) return;
    setSending(true);
    try {
      await fetch("/api/ghl/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: call.ghl_contact_id, message: msg }),
      });
      setMsg("");
      setOpen(false);
    } finally {
      setSending(false);
    }
  }

  if (!call.ghl_contact_id && !call.phone) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 text-xs font-medium hover:bg-violet-500/20 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
        </svg>
        GHL SMS
      </button>
      {open && (
        <div className="absolute top-full mt-2 left-0 z-20 bg-zinc-900 border border-zinc-700 rounded-xl p-3 w-72 shadow-2xl">
          <textarea
            rows={3}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder={`Message to ${call.name}...`}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none mb-2"
          />
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 transition-colors">Cancel</button>
            <button onClick={send} disabled={sending || !msg.trim()} className="flex-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-500 disabled:opacity-50 transition-colors">
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
type DetailTab = "details" | "intel" | "objections" | "offer" | "followup" | "script" | "coach" | "messages";

// ─── Personalize script body ──────────────────────────────────────────────────
function personalizeScript(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? `{{${key.trim()}}}`);
}

interface ScriptSection { id: string; order_index: number; emoji: string; title: string; transition_text: string | null; questions: string[] }
interface SectionNote { section_id: string; notes: string | null; fathom_excerpt: string | null }
interface CoachReport { overall_score: number; overall_summary: string; key_wins: string[]; key_improvements: string[]; section_scores: { section_id: string; title: string; score: number; went_well: string; improve: string; suggested_language: string }[] }

// ─── Fathom types ─────────────────────────────────────────────────────────────
type FathomMeeting = {
  recording_id: number;
  call_id: string | null;
  title: string;
  date: string | null;
  duration_min: number | null;
  attendees: string | null;
  blurb: string | null;
  share_url: string | null;
};

type FathomExtracted = {
  result?: string | null;
  showed?: boolean;
  offer_made?: boolean;
  offer?: string | null;
  offer_brief_id?: string | null;
  success?: boolean;
  deal_amount?: number | null;
  cc_upfront?: number | null;
  monthly_revenue?: number | null;
  enrollment_date?: string | null;
  follow_up_date?: string | null;
  objections?: string[];
  objections_notes?: string | null;
  call_notes?: string | null;
  follow_up_notes?: string | null;
  ai_summary?: string | null;
};

type FathomState =
  | { stage: "list"; meetings: FathomMeeting[] }
  | { stage: "preview"; meeting: FathomMeeting; extracted: FathomExtracted }
  | { stage: "error"; message: string };

// Searchable offer picker — type to filter the offer list, or enter a custom name.
function OfferCombo({ value, offers, onChange }: {
  value: string;
  offers: { id: string; name: string; pif_price: number | null }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const shown = ql ? offers.filter((o) => o.name.toLowerCase().includes(ql)) : offers;
  const exact = offers.some((o) => o.name.toLowerCase() === ql);
  return (
    <div className="relative">
      <input
        value={open ? q : value}
        onFocus={() => { setQ(value || ""); setOpen(true); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search offers (e.g. 6-month, $1,000)…"
        className={inputCls}
      />
      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl">
          {ql && !exact && (
            <button onMouseDown={(e) => { e.preventDefault(); onChange(q.trim()); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-violet-300 hover:bg-zinc-800 border-b border-zinc-800">
              Use &ldquo;{q.trim()}&rdquo;
            </button>
          )}
          {shown.slice(0, 60).map((o) => (
            <button key={o.id} onMouseDown={(e) => { e.preventDefault(); onChange(o.name); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 flex items-center justify-between gap-2">
              <span className="truncate">{o.name}</span>
              {o.pif_price != null && <span className="text-zinc-500 text-xs flex-shrink-0">${o.pif_price.toLocaleString()}</span>}
            </button>
          ))}
          {shown.length === 0 && <div className="px-3 py-3 text-xs text-zinc-500">No matching offers — type to add a custom one.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Prospect Intel — live web + CRM research on the person ───────────────────
function IntelPanel({ call }: { call: SalesCall }) {
  type Social = { platform?: string; url?: string; handle?: string };
  type Intel = {
    summary?: string; business?: string; sells?: string; revenue_estimate?: string;
    socials?: Social[]; pain_points?: string[]; goals?: string[]; trajectory?: string;
    best_fit_offer?: string; talking_points?: string[]; confidence?: string; sources?: string[];
  };
  const [intel, setIntel] = useState<Intel | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIntel(null); setGeneratedAt(null); setErr(null);
    fetch(`/api/calls/${call.id}/intel`).then((r) => r.json()).then((d) => { if (alive) { setIntel(d.intel ?? null); setGeneratedAt(d.generated_at ?? null); } }).catch(() => {});
    return () => { alive = false; };
  }, [call.id]);

  async function research() {
    setLoading(true); setErr(null);
    try {
      const d = await (await fetch(`/api/calls/${call.id}/intel`, { method: "POST" })).json();
      if (d.error) setErr(d.error);
      else { setIntel(d.intel ?? null); setGeneratedAt(d.generated_at ?? null); }
    } catch { setErr("Research failed. Try again."); }
    finally { setLoading(false); }
  }

  const when = generatedAt ? new Date(generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const List = ({ items }: { items?: string[] }) => (
    <ul className="space-y-1.5">{(items ?? []).map((x, i) => <li key={i} className="text-sm text-zinc-200 flex gap-2"><span className="text-zinc-600 flex-shrink-0">•</span><span>{x}</span></li>)}</ul>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold mb-2">{title}</p>
      {children}
    </div>
  );

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin text-3xl mb-3">🔎</div>
        <p className="text-white font-semibold">Researching {call.name || "this prospect"}…</p>
        <p className="text-zinc-500 text-sm mt-1">Searching the web + your CRM. This takes ~20-30 seconds.</p>
      </div>
    );
  }

  if (!intel) {
    return (
      <div className="text-center py-14 border border-dashed border-zinc-800 rounded-2xl">
        <p className="text-4xl mb-2">🔎</p>
        <p className="text-white font-semibold">Prospect Intel</p>
        <p className="text-zinc-500 text-sm mt-1 max-w-sm mx-auto">Pull live info on {call.name || "this person"} — their socials, business, what they sell, pains, goals, and how our offer fits.</p>
        <button onClick={research} className="mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white text-sm font-semibold hover:brightness-110 transition-all">🔎 Research this prospect</button>
        {err && <p className="text-red-400 text-xs mt-3">{err}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {intel.confidence && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${intel.confidence === "high" ? "bg-emerald-500/20 text-emerald-300" : intel.confidence === "medium" ? "bg-amber-500/20 text-amber-300" : "bg-zinc-700 text-zinc-300"}`}>{intel.confidence} confidence</span>}
          {when && <span className="text-[11px] text-zinc-600">Updated {when}</span>}
        </div>
        <button onClick={research} className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold">🔄 Refresh</button>
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}

      {intel.summary && <Section title="Who they are"><p className="text-sm text-zinc-200 leading-relaxed">{intel.summary}</p></Section>}
      {(intel.socials?.length ?? 0) > 0 && (
        <Section title="Social profiles">
          <div className="flex flex-wrap gap-2">
            {intel.socials!.map((s, i) => s.url && (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-blue-600/20 border border-zinc-700 hover:border-blue-500/40 text-zinc-200 text-xs font-medium transition-colors">
                {s.platform ?? "Link"}{s.handle ? ` · ${s.handle}` : ""} <span className="opacity-40">↗</span>
              </a>
            ))}
          </div>
        </Section>
      )}
      {intel.business && <Section title="Their business"><p className="text-sm text-zinc-200 leading-relaxed">{intel.business}</p></Section>}
      {intel.sells && <Section title="What they sell"><p className="text-sm text-zinc-200 leading-relaxed">{intel.sells}</p>{intel.revenue_estimate && intel.revenue_estimate !== "unknown" && <p className="text-xs text-emerald-400 mt-1.5">💵 {intel.revenue_estimate}</p>}</Section>}
      {(intel.pain_points?.length ?? 0) > 0 && <Section title="😖 Likely pain points"><List items={intel.pain_points} /></Section>}
      {((intel.goals?.length ?? 0) > 0 || intel.trajectory) && (
        <Section title="🎯 Goals & where they want to go">
          <List items={intel.goals} />
          {intel.trajectory && <p className="text-sm text-zinc-400 mt-2 leading-relaxed italic">{intel.trajectory}</p>}
        </Section>
      )}
      {intel.best_fit_offer && <Section title="🤝 How our offer fits"><p className="text-sm text-zinc-200 leading-relaxed">{intel.best_fit_offer}</p></Section>}
      {(intel.talking_points?.length ?? 0) > 0 && <Section title="💬 Bring this up on the call"><List items={intel.talking_points} /></Section>}
      {(intel.sources?.length ?? 0) > 0 && (
        <Section title="Sources">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {intel.sources!.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400/80 hover:text-blue-300 truncate max-w-[220px]">{u.replace(/^https?:\/\//, "")}</a>)}
          </div>
        </Section>
      )}
    </div>
  );
}

function DetailPanel({
  call,
  onClose,
  onSave,
  onDelete,
}: {
  call: SalesCall;
  onClose: () => void;
  onSave: (updated: Partial<SalesCall>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [tab, setTab] = useState<DetailTab>("details");
  const [form, setForm] = useState<Partial<SalesCall>>({ ...call });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Add-to-Leads (Hot Prospect) state
  const [leadState, setLeadState] = useState<"idle" | "adding" | "added" | "exists" | "error">("idle");
  async function handleAddLead() {
    setLeadState("adding");
    try {
      const r = await (await fetch("/api/calls/add-lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: call.name, email: call.email, phone: call.phone, ghl_contact_id: call.ghl_contact_id,
          call_type: call.call_type, call_date: call.call_date, call_notes: call.call_notes,
          ai_summary: call.ai_summary, objections_notes: call.objections_notes,
        }),
      })).json();
      setLeadState(r.error ? "error" : r.created ? "added" : "exists");
    } catch { setLeadState("error"); }
  }
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<"found" | "not_found" | null>(null);
  const [fathomLoading, setFathomLoading] = useState(false);
  const [fathomState, setFathomState] = useState<FathomState | null>(null);
  const [offersList, setOffersList] = useState<{ id: string; name: string; pif_price: number | null; pp_link: string | null; pif_link: string | null; payment_link: string | null }[]>([]);
  const [briefs, setBriefs] = useState<{ id: string; name: string; emoji: string; payment_link: string | null }[]>([]);
  const [allScripts, setAllScripts] = useState<{ id: string; category: string; channel: string; title: string; subject: string | null; body: string }[]>([]);
  const [msgCategory, setMsgCategory] = useState("pre_call");
  const [msgChannel, setMsgChannel] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [sendingMsgId, setSendingMsgId] = useState<string | null>(null);
  const [scriptSections, setScriptSections] = useState<ScriptSection[]>([]);
  const [sectionNotes, setSectionNotes] = useState<Record<string, SectionNote>>({});
  const [coachReport, setCoachReport] = useState<CoachReport | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [fillLoading, setFillLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState<string | null>(null);

  // ── Follow-Up generation state ─────────────────────────────────────────────
  type FollowUpPromises = {
    intros_to_make: string[];
    intros_to_receive: string[];
    promised_links: { label: string; url: string }[];
  };
  type FollowUpDraft = {
    key_moments: { label: string; value: string }[];
    promises: FollowUpPromises;
    text: string;
    email_subject: string;
    email_body: string;
    firstName: string;
    outcome: string;
    isEnrolled: boolean;
  };
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState<FollowUpDraft | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpSubject, setFollowUpSubject] = useState("");
  const [followUpEmailBody, setFollowUpEmailBody] = useState("");
  const [keyMomentsOpen, setKeyMomentsOpen] = useState(true);
  const [promisesOpen, setPromisesOpen] = useState(true);
  const [sendingChannel, setSendingChannel] = useState<string | null>(null);
  const [sentChannel, setSentChannel] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [isListening, setIsListening] = useState(false);
  const followUpGeneratedForRef = useRef<string | null>(null);

  // ── Send Promise state ─────────────────────────────────────────────────────
  const [promiseModal, setPromiseModal] = useState(false);
  const [promiseSending, setPromiseSending] = useState(false);
  const [promiseLink, setPromiseLink] = useState<string | null>(null);
  const [promiseSentChannel, setPromiseSentChannel] = useState<string | null>(null);

  async function handleSendPromise() {
    if (!call.email || !call.name) return;
    setPromiseSending(true);
    setPromiseLink(null);
    try {
      const res = await fetch("/api/pandadoc/send-promise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: call.name, email: call.email, phone: call.phone }),
      });
      const data = await res.json();
      if (data.signingLink) setPromiseLink(data.signingLink);
    } finally {
      setPromiseSending(false);
    }
  }

  async function sendPromiseViaSms(link: string) {
    setSendingChannel("promise-sms");
    const message = `Hi ${call.name?.split(" ")[0]}, so excited to have you in the 7-Figure CEO family! Please sign your Promise doc here: ${link} — once you're done it'll take you straight to your onboarding form 🎉`;
    await fetch("/api/ghl/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: call.ghl_contact_id, phone: call.phone, message }),
    });
    setPromiseSentChannel("sms");
    setSendingChannel(null);
  }

  // Auto-generate when Follow-Up tab opens for a call that has data
  useEffect(() => {
    if (tab !== "followup") return;
    const callId = call.id;
    if (followUpGeneratedForRef.current === callId) return;
    const hasData = !!(call.ai_summary || call.call_notes || call.follow_up_notes);
    if (!hasData) return;
    followUpGeneratedForRef.current = callId;
    handleGenerateFollowUp("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, call.id]);

  function startListening() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setCustomInstructions((prev) => (prev ? prev + " " + transcript : transcript));
    };
    recognition.start();
  }

  async function handleGenerateFollowUp(instructions?: string) {
    setFollowUpLoading(true);
    setFollowUpDraft(null);
    try {
      const res = await fetch("/api/followup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name ?? call.name,
          result: form.result ?? call.result,
          call_notes: form.call_notes ?? call.call_notes,
          ai_summary: form.ai_summary ?? call.ai_summary,
          follow_up_notes: form.follow_up_notes ?? call.follow_up_notes,
          objections: form.objections ?? call.objections,
          objections_notes: form.objections_notes ?? call.objections_notes,
          offer: form.offer ?? call.offer,
          deal_amount: form.deal_amount ?? call.deal_amount,
          showed: form.showed ?? call.showed,
          success: form.success ?? call.success,
          call_type: form.call_type ?? call.call_type,
          call_date: form.call_date ?? call.call_date,
          fathom_url: (form.recording_url ?? call.recording_url) ?? null,
          custom_instructions: instructions ?? customInstructions,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFollowUpDraft(data);
      setFollowUpText(data.text ?? "");
      setFollowUpSubject(data.email_subject ?? "");
      setFollowUpEmailBody(data.email_body ?? "");
    } catch (err) {
      console.error("Follow-up generation failed:", err);
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function sendFollowUpSms(message: string) {
    if (!call.ghl_contact_id && !call.phone) return;
    setSendingChannel("sms");
    try {
      await fetch("/api/ghl/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: call.ghl_contact_id, phone: call.phone, message }),
      });
      setSentChannel("sms");
      setTimeout(() => setSentChannel(null), 3000);
    } finally {
      setSendingChannel(null);
    }
  }

  useEffect(() => {
    fetch("/api/playbook/scripts")
      .then((r) => r.json())
      .then((d: { scripts?: typeof allScripts }) => setAllScripts(d.scripts ?? []))
      .catch(() => {});
    fetch("/api/script/sections")
      .then((r) => r.json())
      .then((d: { sections?: ScriptSection[] }) => setScriptSections(d.sections ?? []))
      .catch(() => {});
    fetch(`/api/calls/${call.id}/script-notes`)
      .then((r) => r.json())
      .then((d: { notes?: SectionNote[] }) => {
        const map: Record<string, SectionNote> = {};
        for (const n of d.notes ?? []) map[n.section_id] = n;
        setSectionNotes(map);
      })
      .catch(() => {});
    fetch(`/api/calls/${call.id}/coach`)
      .then((r) => r.json())
      .then((d: { report?: CoachReport }) => { if (d.report) setCoachReport(d.report); })
      .catch(() => {});
  }, [call.id]);

  async function handleSaveNote(section_id: string, notes: string) {
    setNotesSaving(section_id);
    setSectionNotes((prev) => ({ ...prev, [section_id]: { ...prev[section_id], section_id, notes } }));
    await fetch(`/api/calls/${call.id}/script-notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id, notes }),
    });
    setNotesSaving(null);
  }

  async function handleFillScript(text: string) {
    if (!text.trim()) return;
    setFillLoading(true);
    try {
      await fetch(`/api/calls/${call.id}/fill-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const res = await fetch(`/api/calls/${call.id}/script-notes`);
      const data = await res.json() as { notes?: SectionNote[] };
      const map: Record<string, SectionNote> = {};
      for (const n of data.notes ?? []) map[n.section_id] = n;
      setSectionNotes(map);
    } finally {
      setFillLoading(false);
    }
  }

  async function handleRunCoach() {
    setCoachLoading(true);
    try {
      const res = await fetch(`/api/calls/${call.id}/coach`, { method: "POST" });
      const data = await res.json() as { report?: CoachReport };
      if (data.report) setCoachReport(data.report);
    } finally {
      setCoachLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/offers')
      .then((r) => r.json())
      .then((d: { offers?: { id: string; name: string | null; pif_price: number | null; pp_link: string | null; pif_link: string | null; payment_link: string | null }[] }) => {
        setOffersList((d.offers ?? []).filter((o) => o.name).map((o) => ({ ...o, name: o.name! })));
      })
      .catch(() => {});
    fetch('/api/offer-briefs')
      .then((r) => r.json())
      .then((d) => setBriefs(Array.isArray(d) ? d.map((o: { id: string; name: string; emoji: string; payment_link: string | null }) => ({ id: o.id, name: o.name, emoji: o.emoji, payment_link: o.payment_link })) : []))
      .catch(() => {});
  }, []);

  const selectedOffer = offersList.find((o) => o.name === form.offer);
  const selectedBrief = briefs.find((b) => b.id === form.offer_brief_id);

  const missingContact = !form.phone || !form.email;

  async function handleEnrichFromGHL() {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const params = new URLSearchParams();
      if (form.email) params.set("email", form.email);
      if (form.name) params.set("name", form.name);
      const res = await fetch(`/api/ghl/contact-lookup?${params}`);
      const data = await res.json();
      if (data.contact) {
        const updates: Partial<SalesCall> = {};
        if (!form.phone && data.contact.phone) updates.phone = data.contact.phone;
        if (!form.email && data.contact.email) updates.email = data.contact.email;
        if (!form.ghl_contact_id && data.contact.id) updates.ghl_contact_id = data.contact.id;
        if (Object.keys(updates).length > 0) {
          const newForm = { ...form, ...updates };
          setForm(newForm);
          await onSave(newForm);
        }
        setEnrichResult("found");
      } else {
        setEnrichResult("not_found");
      }
    } finally {
      setEnriching(false);
      setTimeout(() => setEnrichResult(null), 4000);
    }
  }

  async function handleFathomSync() {
    setFathomLoading(true);
    setFathomState(null);
    try {
      const res = await fetch("/api/fathom/list");
      const data = await res.json();
      if (!res.ok || data.error) {
        setFathomState({ stage: "error", message: data.error ?? "Could not load Fathom recordings" });
      } else {
        setFathomState({ stage: "list", meetings: data.list ?? [] });
      }
    } catch (err: unknown) {
      setFathomState({ stage: "error", message: String(err) });
    } finally {
      setFathomLoading(false);
    }
  }

  async function selectFathomRecording(item: FathomMeeting) {
    setFathomLoading(true);
    setFathomState(null);
    try {
      const res = await fetch("/api/fathom/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recording_id: item.recording_id,
          call_id: item.call_id,
          title: item.title,
          date: item.date,
          share_url: item.share_url,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setFathomState({ stage: "error", message: data.error ?? "Unknown error" });
      } else {
        setFathomState({ stage: "preview", meeting: item, extracted: data.extracted });
      }
    } catch (err: unknown) {
      setFathomState({ stage: "error", message: String(err) });
    } finally {
      setFathomLoading(false);
    }
  }

  async function applyFathomExtraction(extracted: FathomExtracted, meetingUrl?: string | null) {
    const updates: Partial<SalesCall> = {};
    if (extracted.result) updates.result = extracted.result as CallResult;
    if (typeof extracted.showed === "boolean") updates.showed = extracted.showed;
    if (typeof extracted.offer_made === "boolean") updates.offer_made = extracted.offer_made;
    if (extracted.offer) updates.offer = extracted.offer;
    if (typeof extracted.success === "boolean") updates.success = extracted.success;
    if (extracted.deal_amount) updates.deal_amount = extracted.deal_amount;
    if (extracted.cc_upfront) updates.cc_upfront = extracted.cc_upfront;
    if (extracted.monthly_revenue) updates.monthly_revenue = extracted.monthly_revenue;
    if (extracted.enrollment_date) updates.enrollment_date = extracted.enrollment_date;
    if (extracted.follow_up_date) updates.follow_up_date = extracted.follow_up_date;
    if (extracted.objections && extracted.objections.length > 0) updates.objections = extracted.objections;
    if (extracted.objections_notes) updates.objections_notes = extracted.objections_notes;
    if (extracted.call_notes) updates.call_notes = extracted.call_notes;
    if (extracted.follow_up_notes) updates.follow_up_notes = extracted.follow_up_notes;
    if (extracted.ai_summary) updates.ai_summary = extracted.ai_summary;
    if (meetingUrl && !form.recording_url) updates.recording_url = meetingUrl;
    const newForm = { ...form, ...updates };
    setForm(newForm);
    await onSave(newForm);
    setFathomState(null);
    // Auto-fill script notes from summary/notes, then run coaching
    const textForFill = [extracted.ai_summary, extracted.call_notes].filter(Boolean).join("\n\n");
    if (textForFill) {
      void handleFillScript(textForFill).then(() => handleRunCoach());
    }
  }

  function set<K extends keyof SalesCall>(key: K, value: SalesCall[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Add this prospect to the Helm app as a new client.
  const [helmBusy, setHelmBusy] = useState(false);
  const [helmMsg, setHelmMsg] = useState<string | null>(null);
  async function addToHelm() {
    setHelmBusy(true); setHelmMsg(null);
    try {
      const r = await fetch("/api/calls/helm-add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone }) }).then((x) => x.json());
      setHelmMsg(r.ok ? "✓ Added to Helm" : (r.error || "Failed"));
    } catch { setHelmMsg("Failed to reach Helm"); } finally { setHelmBusy(false); }
  }

  // Push this enrollment to the Partnership app (referrer sees the update).
  const [partnerBusy, setPartnerBusy] = useState(false);
  const [partnerMsg, setPartnerMsg] = useState<string | null>(null);
  async function updatePartnership() {
    setPartnerBusy(true); setPartnerMsg(null);
    try {
      const r = await fetch("/api/partnership/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, email: form.email, offer: form.offer, amount: form.new_revenue ?? form.deal_amount }) }).then((x) => x.json());
      if (r.ok) setPartnerMsg(`✓ ${r.memberName} marked enrolled${r.referrerName ? ` — ${r.referrerName} will see it` : ""}`);
      else if (r.notFound) setPartnerMsg("Not found in the Partnership app");
      else setPartnerMsg(r.error || "Failed");
    } catch { setPartnerMsg("Failed to reach Partnership app"); } finally { setPartnerBusy(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
      savedFormRef.current = JSON.stringify(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  // ── Auto-save (mobile + desktop) ──────────────────────────────────────────
  const savedFormRef = useRef<string>(JSON.stringify(call));
  // When a different call opens, load its data and reset the save baseline.
  useEffect(() => {
    setForm({ ...call });
    savedFormRef.current = JSON.stringify({ ...call });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id]);
  // Persist any change automatically, shortly after the user stops editing.
  useEffect(() => {
    const cur = JSON.stringify(form);
    if (cur === savedFormRef.current) return;
    const t = setTimeout(() => {
      savedFormRef.current = cur;
      setSaving(true);
      Promise.resolve(onSave(form)).then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500); }).finally(() => setSaving(false));
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  async function handleDelete() {
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  }

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "details", label: "📋 Details" },
    { key: "intel", label: "🔎 Intel" },
    { key: "script", label: "📜 Script" },
    { key: "messages", label: "💬 Messages" },
    { key: "coach", label: coachReport ? `🎓 Coach ${coachReport.overall_score}/10` : "🎓 Coach" },
    { key: "followup", label: "📣 Follow-Up" },
  ];

  const deal = call.deal_amount ?? call.new_revenue;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />
      <div
        className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <div className={`w-10 h-10 rounded-full ${avatarBg(call.name)} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}>
            {initials(call.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-semibold text-[15px] leading-tight truncate">{call.name}</h2>
            <p className="text-zinc-500 text-xs">{fmtDate(call.call_date)} {call.call_type ? `· ${call.call_type}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {deal != null && (
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">${deal.toLocaleString()}</span>
            )}
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${resultChip(call.result)}`}>
              {call.result ?? "—"}
            </span>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors ml-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Outreach bar */}
        <div className="px-5 py-3 border-b border-zinc-800 flex-shrink-0">
          <OutreachBar call={call} />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 flex-shrink-0 overflow-x-auto no-scrollbar">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                tab === key ? "text-violet-400 border-violet-500" : "text-zinc-500 border-transparent hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── INTEL ────────────────────────────────────────────── */}
          {tab === "intel" && <IntelPanel call={call} />}

          {/* ── MESSAGES ─────────────────────────────────────────── */}
          {tab === "messages" && (() => {
            const MSG_CATS = [
              { key: "pre_call",          label: "Pre-Call",    emoji: "🔜" },
              { key: "post_call_followup",label: "Follow-Up",   emoji: "📣" },
              { key: "no_show",           label: "No-Show",     emoji: "👻" },
              { key: "objection_followup",label: "Objection",   emoji: "💰" },
              { key: "nurture",           label: "Nurture",     emoji: "🌱" },
              { key: "enrolled",          label: "Enrolled",    emoji: "✅" },
            ];
            const MSG_CHS = [
              { key: "dm", label: "DM", color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
              { key: "email", label: "Email", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
              { key: "sms", label: "SMS", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
              { key: "whatsapp", label: "WhatsApp", color: "bg-green-500/20 text-green-300 border-green-500/30" },
            ];
            const firstName = call.name.split(" ")[0] ?? call.name;
            const vars: Record<string, string> = {
              first_name: firstName,
              full_name: call.name,
              offer: call.offer ?? "[OFFER]",
              your_goal: "[THEIR GOAL]",
              call_date: call.call_date ? new Date(call.call_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "[DATE]",
              call_time: call.call_date ? new Date(call.call_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "[TIME]",
              current_revenue: "[CURRENT REVENUE]",
              your_name: "Andrew",
            };
            const filtered = allScripts.filter(
              (s) => s.category === msgCategory && (!msgChannel || s.channel === msgChannel)
            );

            async function sendSms(body: string) {
              if (!call.ghl_contact_id && !call.phone) return;
              setSendingMsgId(body.slice(0, 10));
              try {
                await fetch("/api/ghl/sms", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contactId: call.ghl_contact_id, phone: call.phone, message: body }),
                });
              } finally {
                setSendingMsgId(null);
              }
            }

            return (
              <div className="space-y-4">
                {/* Category tabs */}
                <div className="flex flex-wrap gap-1">
                  {MSG_CATS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setMsgCategory(c.key)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        msgCategory === c.key ? "bg-violet-600/30 text-violet-300 border-violet-500/40" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
                      }`}
                    >
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>

                {/* Channel filters */}
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setMsgChannel(null)} className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${!msgChannel ? "bg-zinc-700 text-white border-zinc-600" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}>All</button>
                  {MSG_CHS.map((c) => (
                    <button key={c.key} onClick={() => setMsgChannel(msgChannel === c.key ? null : c.key)} className={`px-2.5 py-1 rounded-lg text-xs border font-medium transition-colors ${msgChannel === c.key ? c.color : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}>{c.label}</button>
                  ))}
                </div>

                {/* Personalization vars hint */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[11px] text-zinc-500">
                  Personalized for <span className="text-white font-semibold">{call.name}</span>
                  {call.offer && <> · Offer: <span className="text-violet-300">{call.offer}</span></>}
                </div>

                {/* Scripts */}
                {filtered.length === 0 ? (
                  <p className="text-sm text-zinc-600 text-center py-8">No scripts for this category. <a href="/playbook" className="text-violet-400 hover:underline">Add scripts in Playbook →</a></p>
                ) : filtered.map((script) => {
                  const personalized = personalizeScript(script.body, vars);
                  const isKey = script.id;
                  const ch = MSG_CHS.find((c) => c.key === script.channel);
                  return (
                    <div key={script.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                        <div className="flex items-center gap-2">
                          {ch && <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ch.color}`}>{ch.label}</span>}
                          <span className="text-sm font-semibold text-white">{script.title}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(personalized);
                              setCopiedMsgId(isKey);
                              setTimeout(() => setCopiedMsgId(null), 2000);
                            }}
                            className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                          >
                            {copiedMsgId === isKey ? "✓ Copied" : "Copy"}
                          </button>
                          {(script.channel === "sms" || script.channel === "dm") && call.ghl_contact_id && (
                            <button
                              onClick={() => sendSms(personalized)}
                              disabled={sendingMsgId !== null}
                              className="text-xs px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 transition-colors disabled:opacity-50"
                            >
                              {sendingMsgId ? "Sending…" : "Send SMS"}
                            </button>
                          )}
                          {script.channel === "email" && call.email && (
                            <a
                              href={`mailto:${call.email}?subject=${encodeURIComponent(script.subject ? personalizeScript(script.subject, vars) : "")}&body=${encodeURIComponent(personalized)}`}
                              className="text-xs px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-300 transition-colors"
                            >
                              Open Email
                            </a>
                          )}
                        </div>
                      </div>
                      {script.subject && (
                        <div className="px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
                          <span className="text-[10px] text-zinc-500">Subject: </span>
                          <span className="text-[10px] text-zinc-300">{personalizeScript(script.subject, vars)}</span>
                        </div>
                      )}
                      <pre className="px-4 py-3 text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans max-h-48 overflow-y-auto">{personalized}</pre>
                    </div>
                  );
                })}

                <a href="/playbook" className="block text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-2">
                  Manage scripts in Playbook →
                </a>
              </div>
            );
          })()}

          {/* ── SCRIPT ───────────────────────────────────────────── */}
          {tab === "script" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">Notes auto-save as you type. Sync Fathom to auto-fill from transcript.</p>
                <button
                  onClick={() => { const t = [form.ai_summary, form.call_notes].filter(Boolean).join("\n\n"); if (t) handleFillScript(t); }}
                  disabled={fillLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-300 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {fillLoading ? (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                  ) : "✦"}
                  {fillLoading ? "Filling…" : "Auto-Fill"}
                </button>
              </div>
              {scriptSections.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-8">No script sections yet. <a href="/script" className="text-violet-400 hover:underline">Set up your script →</a></p>
              ) : scriptSections.map((s) => {
                const note = sectionNotes[s.id];
                return (
                  <ScriptSectionCard
                    key={s.id}
                    section={s}
                    note={note}
                    saving={notesSaving === s.id}
                    onSave={(notes) => handleSaveNote(s.id, notes)}
                  />
                );
              })}
            </div>
          )}

          {/* ── COACH ─────────────────────────────────────────────── */}
          {tab === "coach" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">AI coaching analysis based on your script notes and Fathom data.</p>
                  {coachReport && <p className="text-[11px] text-zinc-600 mt-0.5">Last analyzed: recent</p>}
                </div>
                <button
                  onClick={handleRunCoach}
                  disabled={coachLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {coachLoading ? (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                  ) : "🎯"}
                  {coachLoading ? "Analyzing…" : coachReport ? "Re-analyze" : "Analyze Call"}
                </button>
              </div>

              {coachLoading && !coachReport && (
                <div className="flex items-center gap-3 p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                  <span className="text-sm text-zinc-400">Claude is reviewing the call…</span>
                </div>
              )}

              {!coachReport && !coachLoading && (
                <div className="text-center py-10 text-zinc-600">
                  <p className="text-3xl mb-2">🎯</p>
                  <p className="text-sm">Click &ldquo;Analyze Call&rdquo; to get coaching feedback.</p>
                  <p className="text-xs mt-1">Add script notes first for the best analysis.</p>
                </div>
              )}

              {coachReport && (
                <>
                  {/* Overall score */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                    <div className="flex items-center gap-4 mb-3">
                      <div className={`text-4xl font-black ${coachReport.overall_score >= 8 ? "text-emerald-400" : coachReport.overall_score >= 6 ? "text-amber-400" : "text-red-400"}`}>
                        {coachReport.overall_score}<span className="text-xl text-zinc-500">/10</span>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed flex-1">{coachReport.overall_summary}</p>
                    </div>
                    {coachReport.key_wins?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Key Wins</p>
                        {coachReport.key_wins.map((w, i) => (
                          <p key={i} className="text-xs text-zinc-300 flex items-start gap-1.5 mb-0.5"><span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>{w}</p>
                        ))}
                      </div>
                    )}
                    {coachReport.key_improvements?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">Key Improvements</p>
                        {coachReport.key_improvements.map((w, i) => (
                          <p key={i} className="text-xs text-zinc-300 flex items-start gap-1.5 mb-0.5"><span className="text-amber-400 flex-shrink-0 mt-0.5">→</span>{w}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Per-section scores */}
                  {coachReport.section_scores?.map((sec) => (
                    <div key={sec.section_id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-white">{sec.title}</span>
                        <div className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${
                          sec.score >= 8 ? "bg-emerald-500/20 text-emerald-400" :
                          sec.score >= 6 ? "bg-amber-500/20 text-amber-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>{sec.score}/10</div>
                      </div>
                      {sec.went_well && (
                        <div className="mb-2">
                          <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Went Well</p>
                          <p className="text-xs text-zinc-300 leading-relaxed">{sec.went_well}</p>
                        </div>
                      )}
                      {sec.improve && (
                        <div className="mb-2">
                          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">Improve</p>
                          <p className="text-xs text-zinc-300 leading-relaxed">{sec.improve}</p>
                        </div>
                      )}
                      {sec.suggested_language && (
                        <div className="bg-zinc-800/60 rounded-xl p-3 mt-1">
                          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Try This Instead</p>
                          <p className="text-xs text-zinc-200 leading-relaxed italic">&ldquo;{sec.suggested_language}&rdquo;</p>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── DETAILS ──────────────────────────────────────────── */}
          {tab === "details" && (
            <>
              {/* Name + Date — front and center */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 space-y-2.5">
                <div>
                  <label className="text-[11px] text-zinc-500 font-medium">Name</label>
                  <input
                    value={form.name ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Prospect name"
                    className={`${inputCls} text-base font-semibold mt-1`}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 font-medium">Call Date</label>
                  <input
                    type="datetime-local"
                    value={form.call_date ? form.call_date.slice(0, 16) : ""}
                    onChange={(e) => set("call_date", e.target.value ? new Date(e.target.value).toISOString() : null)}
                    className={`${inputCls} mt-1`}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 font-medium">Call Type</label>
                  <div className="mt-1">
                    <Select value={form.call_type ?? ""} onChange={(v) => set("call_type", v as CallType)} options={["", ...TYPE_OPTIONS]} />
                  </div>
                </div>
              </div>

              {/* Quick toggles row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <span className="text-sm text-zinc-300 font-medium">Showed Up?</span>
                  <button
                    onClick={() => set("showed", !form.showed)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${form.showed ? "bg-blue-600" : "bg-zinc-700"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.showed ? "left-6" : "left-1"}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <span className="text-sm text-zinc-300 font-medium">Success?</span>
                  <button
                    onClick={() => set("success", !form.success)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${form.success ? "bg-emerald-600" : "bg-zinc-700"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.success ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              </div>
              <Field label="Result">
                <Select value={form.result ?? ""} onChange={(v) => set("result", v as CallResult)} options={["", ...RESULT_OPTIONS]} />
              </Field>
              {/* Send Promise — only shown for sales */}
              {form.result === "✅ Sale" && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-emerald-300">7-Figure CEO Promise</p>
                      <p className="text-[11px] text-emerald-400/60 mt-0.5">Send the signed agreement to this client</p>
                    </div>
                    {!promiseLink && (
                      <button
                        onClick={handleSendPromise}
                        disabled={promiseSending || !call.email}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-900 text-xs font-bold transition-colors"
                      >
                        {promiseSending ? "Creating…" : "Send Promise"}
                      </button>
                    )}
                  </div>
                  {!call.email && (
                    <p className="text-[11px] text-amber-400">⚠ Add an email first so PandaDoc can send the doc.</p>
                  )}
                  {promiseLink && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-emerald-400">✓ Doc created &amp; emailed. Share via:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {/* iMessage */}
                        {call.phone && (
                          <a
                            href={`sms:${call.phone.replace(/\D/g, "")}&body=${encodeURIComponent(`Hi ${call.name?.split(" ")[0]}, so excited to have you in the 7-Figure CEO family! Please sign your Promise doc here: ${promiseLink} — once you're done it'll take you straight to your onboarding form 🎉`)}`}
                            onClick={() => setPromiseSentChannel("imessage")}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-medium hover:bg-blue-500/20 transition-colors"
                          >
                            💬 iMessage
                          </a>
                        )}
                        {/* WhatsApp */}
                        {call.phone && (
                          <a
                            href={`https://wa.me/${call.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${call.name?.split(" ")[0]}, so excited to have you in the 7-Figure CEO family! Please sign your Promise doc here: ${promiseLink} — once you're done it'll take you straight to your onboarding form 🎉`)}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setPromiseSentChannel("whatsapp")}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors"
                          >
                            📱 WhatsApp
                          </a>
                        )}
                        {/* GHL SMS */}
                        {(call.ghl_contact_id || call.phone) && (
                          <button
                            onClick={() => sendPromiseViaSms(promiseLink)}
                            disabled={sendingChannel === "promise-sms"}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[11px] font-medium hover:bg-violet-500/20 disabled:opacity-50 transition-colors"
                          >
                            {promiseSentChannel === "sms" ? "✓ Sent" : sendingChannel === "promise-sms" ? "Sending…" : "GHL SMS"}
                          </button>
                        )}
                        {/* Copy link */}
                        <button
                          onClick={() => { navigator.clipboard.writeText(promiseLink); setPromiseSentChannel("copy"); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 text-[11px] font-medium hover:bg-zinc-700 transition-colors"
                        >
                          {promiseSentChannel === "copy" ? "✓ Copied" : "Copy Link"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Offer ─────────────────────────────────────────────── */}
              <div className="pt-1">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">💵 Offer</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                    <span className="text-sm text-zinc-300 font-medium">Offer Made?</span>
                    <button onClick={() => set("offer_made", !form.offer_made)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${form.offer_made ? "bg-violet-600" : "bg-zinc-700"}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.offer_made ? "left-6" : "left-1"}`} />
                    </button>
                  </div>
                  <Field label="🎯 Offer pitched">
                    <select value={form.offer_brief_id ?? ""} onChange={(e) => set("offer_brief_id", e.target.value || null)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
                      <option value="">Which offer are we pitching?</option>
                      {briefs.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
                    </select>
                    {selectedBrief?.payment_link && (
                      <a href={selectedBrief.payment_link} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 transition-colors">💳 Payment Link ↗</a>
                    )}
                  </Field>
                  <Field label="Offer (legacy)">
                    <OfferCombo value={form.offer ?? ""} offers={offersList} onChange={(v) => set("offer", v || null)} />
                    {selectedOffer && (selectedOffer.pif_link || selectedOffer.pp_link || selectedOffer.payment_link) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedOffer.pif_link && <a href={selectedOffer.pif_link} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 transition-colors">💳 PIF Link ↗</a>}
                        {selectedOffer.pp_link && <a href={selectedOffer.pp_link} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-300 transition-colors">📅 Payment Plan ↗</a>}
                        {selectedOffer.payment_link && <a href={selectedOffer.payment_link} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 transition-colors">🔗 Payment Link ↗</a>}
                      </div>
                    )}
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="New Revenue ($)">
                      <input type="number" inputMode="numeric" value={form.new_revenue ?? ""} onChange={(e) => set("new_revenue", e.target.value ? Number(e.target.value) : null)} placeholder="15000" className={inputCls} />
                    </Field>
                    <Field label="Cash Collected ($)">
                      <input type="number" inputMode="numeric" value={form.cc_upfront ?? ""} onChange={(e) => set("cc_upfront", e.target.value ? Number(e.target.value) : null)} placeholder="5000" className={inputCls} />
                    </Field>
                    <Field label="Enrollment Date">
                      <input type="date" value={form.enrollment_date ?? ""} onChange={(e) => set("enrollment_date", e.target.value || null)} className={inputCls} />
                    </Field>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                    <span className="text-sm text-zinc-300 font-medium">Enrolled / Success?</span>
                    <button onClick={() => set("success", !form.success)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${form.success ? "bg-emerald-600" : "bg-zinc-700"}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.success ? "left-6" : "left-1"}`} />
                    </button>
                  </div>

                  {/* One-tap: push this client to the other apps */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button onClick={addToHelm} disabled={helmBusy || !form.name}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-300 text-xs font-semibold transition-colors disabled:opacity-50">
                      {helmBusy ? "Adding…" : "⚓ Add to Helm"}
                    </button>
                    <button onClick={updatePartnership} disabled={partnerBusy || (!form.name && !form.email)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-cyan-600/15 hover:bg-cyan-600/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-colors disabled:opacity-50">
                      {partnerBusy ? "Updating…" : "🤝 Update Partnership App"}
                    </button>
                  </div>
                  {helmMsg && <p className={`text-xs ${helmMsg.startsWith("✓") ? "text-emerald-400" : "text-amber-400"}`}>{helmMsg}</p>}
                  {partnerMsg && <p className={`text-xs ${partnerMsg.startsWith("✓") ? "text-emerald-400" : "text-amber-400"}`}>{partnerMsg}</p>}
                </div>
              </div>

              <Field label="Booking Source">
                <Select value={form.booking_source ?? ""} onChange={(v) => set("booking_source", v)} options={["", ...BOOKING_SOURCES]} />
              </Field>
              <Field label="Prospect Quality">
                <Select value={form.prospect_quality ?? ""} onChange={(v) => set("prospect_quality", v as ProspectQuality)} options={["", ...QUALITY_OPTIONS]} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} placeholder="+1 555 000 0000" className={inputCls} />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value || null)} placeholder="prospect@email.com" className={inputCls} />
              </Field>
              {missingContact && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-300">Missing contact info</p>
                    <p className="text-[11px] text-amber-400/70 mt-0.5">Pull phone &amp; email directly from GoHighLevel</p>
                  </div>
                  <button
                    onClick={handleEnrichFromGHL}
                    disabled={enriching}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-900 text-xs font-bold transition-colors"
                  >
                    {enriching ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" /></svg>
                    )}
                    {enriching ? "Searching…" : "Find in GHL"}
                  </button>
                  {enrichResult === "found" && (
                    <span className="text-xs text-emerald-400 font-semibold">✓ Found &amp; saved</span>
                  )}
                  {enrichResult === "not_found" && (
                    <span className="text-xs text-zinc-500">Not found in GHL</span>
                  )}
                </div>
              )}
              <Field label="Call Notes">
                <textarea rows={4} value={form.call_notes ?? ""} onChange={(e) => set("call_notes", e.target.value || null)} placeholder="Notes from the call..." className={`${inputCls} resize-none`} />
              </Field>
              <Field label="Recording URL">
                <input type="url" value={form.recording_url ?? ""} onChange={(e) => set("recording_url", e.target.value || null)} placeholder="https://fathom.video/..." className={inputCls} />
              </Field>
              {form.recording_url && (
                <a href={form.recording_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg>
                  View Recording →
                </a>
              )}
            </>
          )}

          {/* ── OBJECTIONS ───────────────────────────────────────── */}
          {tab === "followup" && (
            <>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">🛡️ Objections</p>
              <Field label="Objections Raised">
                <div className="flex flex-wrap gap-2">
                  {OBJECTION_OPTIONS.map((obj) => {
                    const active = (form.objections ?? []).includes(obj);
                    return (
                      <button
                        key={obj}
                        onClick={() => {
                          const cur = form.objections ?? [];
                          set("objections", active ? cur.filter((o) => o !== obj) : [...cur, obj]);
                        }}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                          active
                            ? "bg-red-500/20 text-red-400 border-red-500/40"
                            : "bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-600 hover:text-zinc-300"
                        }`}
                      >
                        {obj}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="How did you overcome the objection(s)?">
                <textarea
                  rows={5}
                  value={form.objections_notes ?? ""}
                  onChange={(e) => set("objections_notes", e.target.value || null)}
                  placeholder="Cash timing — front-loading inventory..."
                  className={`${inputCls} resize-none`}
                />
              </Field>

              {/* AI Summary — reference, at the bottom */}
              {call.ai_summary && (
                <details className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3">
                  <summary className="text-xs text-zinc-500 font-medium cursor-pointer select-none">🤖 AI Call Summary</summary>
                  <p className="text-sm text-zinc-300 leading-relaxed mt-2">{call.ai_summary}</p>
                </details>
              )}
            </>
          )}

          {/* ── OFFER ────────────────────────────────────────────── */}
          {/* ── FOLLOW-UP ─────────────────────────────────────────── */}
          {tab === "followup" && (
            <>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider pt-2 mt-2 border-t border-zinc-800">📣 Follow-Up</p>
              <Field label="Follow Up Status">
                <Select value={form.follow_up_status ?? ""} onChange={(v) => set("follow_up_status", v as FollowUpStatus)} options={["", ...FOLLOW_UP_OPTIONS]} />
              </Field>
              <Field label="Follow Up Date">
                <input type="date" value={form.follow_up_date ?? ""} onChange={(e) => set("follow_up_date", e.target.value || null)} className={inputCls} />
              </Field>
              <Field label="Follow Up Notes">
                <textarea
                  rows={3}
                  value={form.follow_up_notes ?? ""}
                  onChange={(e) => set("follow_up_notes", e.target.value || null)}
                  placeholder="Chad is warm and genuinely interested — cash timing is the only blocker..."
                  className={`${inputCls} resize-none`}
                />
              </Field>

              {/* ── Custom Instructions ────────────────────────────── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Follow-Up Instructions</label>
                  <button
                    onClick={startListening}
                    disabled={isListening}
                    title="Speak instructions"
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${isListening ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse" : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"}`}
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h-3v2h8v-2h-3v-2.06A9 9 0 0 0 21 12v-2h-2z"/></svg>
                    {isListening ? "Listening…" : "Speak"}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Make sure to mention the $47 trial and include the link to the DM sales training…"
                  className={`${inputCls} resize-none`}
                />
              </div>

              {/* ── Regenerate Button ──────────────────────────────── */}
              <button
                onClick={() => { followUpGeneratedForRef.current = null; handleGenerateFollowUp(customInstructions); }}
                disabled={followUpLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-purple-500 disabled:opacity-60 transition-all shadow-lg shadow-violet-500/20"
              >
                {followUpLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                    Crafting messages…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    {followUpDraft ? "Regenerate" : "Generate Follow-Up"}
                  </>
                )}
              </button>

              {/* ── Generated Draft ────────────────────────────────── */}
              {followUpDraft && (
                <div className="space-y-4 mt-1">

                  {/* Key Moments */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setKeyMomentsOpen(!keyMomentsOpen)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 text-left"
                    >
                      <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                        Key Moments
                      </span>
                      <svg className={`w-4 h-4 text-zinc-600 transition-transform ${keyMomentsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {keyMomentsOpen && (
                      <div className="divide-y divide-zinc-800/60">
                        {followUpDraft.key_moments.filter(m => m.value && m.value !== "N/A" && m.value !== "—").map((m) => (
                          <div key={m.label} className="px-4 py-2.5">
                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">{m.label}</p>
                            <p className="text-xs text-zinc-300 leading-relaxed">{m.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Promises */}
                  {followUpDraft.promises && (
                    (followUpDraft.promises.intros_to_make?.length > 0 ||
                     followUpDraft.promises.intros_to_receive?.length > 0 ||
                     followUpDraft.promises.promised_links?.length > 0) && (
                    <div className="border border-emerald-800/40 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setPromisesOpen(!promisesOpen)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-emerald-950/40 text-left"
                      >
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                          Promises Made
                        </span>
                        <svg className={`w-4 h-4 text-zinc-600 transition-transform ${promisesOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {promisesOpen && (
                        <div className="divide-y divide-emerald-900/30 bg-emerald-950/20">
                          {followUpDraft.promises.intros_to_make?.length > 0 && (
                            <div className="px-4 py-3">
                              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider mb-1.5">Intros Andrew Is Making</p>
                              <ul className="space-y-1">
                                {followUpDraft.promises.intros_to_make.map((item, i) => (
                                  <li key={i} className="text-xs text-zinc-300 flex items-start gap-1.5"><span className="text-emerald-500 mt-0.5">•</span>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {followUpDraft.promises.intros_to_receive?.length > 0 && (
                            <div className="px-4 py-3">
                              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider mb-1.5">Intros Andrew Is Receiving</p>
                              <ul className="space-y-1">
                                {followUpDraft.promises.intros_to_receive.map((item, i) => (
                                  <li key={i} className="text-xs text-zinc-300 flex items-start gap-1.5"><span className="text-emerald-500 mt-0.5">•</span>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {followUpDraft.promises.promised_links?.length > 0 && (
                            <div className="px-4 py-3">
                              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider mb-1.5">Links Promised</p>
                              <ul className="space-y-1.5">
                                {followUpDraft.promises.promised_links.map((link, i) => (
                                  <li key={i} className="text-xs flex items-start gap-1.5">
                                    <span className="text-emerald-500 mt-0.5">•</span>
                                    <span>
                                      <span className="text-zinc-300">{link.label}: </span>
                                      <a href={link.url} target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-300 break-all">{link.url}</a>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Text Message */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800">
                      <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" /></svg>
                        Text Message
                      </span>
                      <span className="text-[10px] text-zinc-600">{followUpText.length} chars</span>
                    </div>
                    <div className="p-3 space-y-2.5">
                      <textarea
                        rows={4}
                        value={followUpText}
                        onChange={(e) => setFollowUpText(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none leading-relaxed"
                      />
                      <div className="flex gap-1.5 flex-wrap">
                        {/* iMessage */}
                        {call.phone && (
                          <a
                            href={`sms:${call.phone?.replace(/\D/g, "")}&body=${encodeURIComponent(followUpText)}`}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-medium hover:bg-blue-500/20 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" /><path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" /></svg>
                            iMessage
                          </a>
                        )}
                        {/* WhatsApp */}
                        {call.phone && (
                          <a
                            href={`https://wa.me/${call.phone?.replace(/\D/g, "")}?text=${encodeURIComponent(followUpText)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /></svg>
                            WhatsApp
                          </a>
                        )}
                        {/* GHL SMS */}
                        {(call.ghl_contact_id || call.phone) && (
                          <button
                            onClick={() => sendFollowUpSms(followUpText)}
                            disabled={sendingChannel === "sms"}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[11px] font-medium hover:bg-violet-500/20 disabled:opacity-50 transition-colors"
                          >
                            {sentChannel === "sms" ? "✓ Sent" : sendingChannel === "sms" ? "Sending…" : "GHL SMS"}
                          </button>
                        )}
                        {/* Copy */}
                        <button
                          onClick={() => { navigator.clipboard.writeText(followUpText); setSentChannel("copy"); setTimeout(() => setSentChannel(null), 2000); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 text-[11px] font-medium hover:bg-zinc-700 transition-colors"
                        >
                          {sentChannel === "copy" ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800">
                      <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        Email
                      </span>
                    </div>
                    <div className="p-3 space-y-2">
                      <input
                        type="text"
                        value={followUpSubject}
                        onChange={(e) => setFollowUpSubject(e.target.value)}
                        placeholder="Subject line…"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
                      />
                      <textarea
                        rows={7}
                        value={followUpEmailBody}
                        onChange={(e) => setFollowUpEmailBody(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none leading-relaxed"
                      />
                      <div className="flex gap-1.5 flex-wrap">
                        {call.email && (
                          <a
                            href={`mailto:${call.email}?subject=${encodeURIComponent(followUpSubject)}&body=${encodeURIComponent(followUpEmailBody)}`}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 text-[11px] font-medium hover:bg-zinc-700 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            Open in Gmail
                          </a>
                        )}
                        <button
                          onClick={() => { navigator.clipboard.writeText(`Subject: ${followUpSubject}\n\n${followUpEmailBody}`); setSentChannel("email-copy"); setTimeout(() => setSentChannel(null), 2000); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 text-[11px] font-medium hover:bg-zinc-700 transition-colors"
                        >
                          {sentChannel === "email-copy" ? "✓ Copied" : "Copy Email"}
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}
        </div>

        {/* Fathom panel */}
        {fathomState !== null && (
          <div className="border-t border-zinc-800 px-4 pt-3 pb-3 flex-shrink-0 max-h-80 overflow-y-auto">
            {fathomState.stage === "error" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <span className="text-xs text-red-400 flex-1">{fathomState.message}</span>
                <button onClick={() => setFathomState(null)} className="text-zinc-500 hover:text-white text-xs">✕</button>
              </div>
            )}

            {fathomState.stage === "list" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-zinc-400">Select a recording</p>
                  <button onClick={() => setFathomState(null)} className="text-zinc-600 hover:text-white text-xs">✕</button>
                </div>
                {fathomState.meetings.length === 0 ? (
                  <p className="text-xs text-zinc-500">No recent recordings found in Fathom.</p>
                ) : fathomState.meetings.map((item) => (
                  <button
                    key={item.recording_id}
                    onClick={() => selectFathomRecording(item)}
                    className="w-full text-left p-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all group"
                  >
                    <p className="text-xs font-semibold text-white group-hover:text-violet-300">{item.title}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {item.date ? new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                      {item.duration_min ? ` · ${item.duration_min}m` : ""}
                    </p>
                    {item.attendees && (
                      <p className="text-[11px] text-violet-400/70 mt-0.5 truncate">{item.attendees}</p>
                    )}
                    {item.blurb && (
                      <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed line-clamp-2">{item.blurb}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {fathomState.stage === "preview" && (
              <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-emerald-300 truncate">🎙 {fathomState.meeting.title}</p>
                    <p className="text-[11px] text-emerald-400/70 mt-0.5">
                      {fathomState.meeting.date ? new Date(fathomState.meeting.date).toLocaleString() : ""}
                      {fathomState.extracted.result ? ` · ${fathomState.extracted.result}` : ""}
                      {fathomState.extracted.deal_amount ? ` · $${fathomState.extracted.deal_amount.toLocaleString()}` : ""}
                    </p>
                    {fathomState.extracted.ai_summary && (
                      <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{fathomState.extracted.ai_summary}</p>
                    )}
                  </div>
                  <button onClick={() => setFathomState(null)} className="text-zinc-500 hover:text-white text-xs flex-shrink-0">✕</button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => applyFathomExtraction(fathomState.extracted, fathomState.meeting.share_url)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                  >
                    ✓ Apply All Fields
                  </button>
                  <button
                    onClick={() => setFathomState({ stage: "list", meetings: [] })}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs transition-colors"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add to Leads as Hot Prospect — one tap to push this prospect into Leads */}
        <div className="border-t border-zinc-800 px-4 pt-4 flex-shrink-0">
          {leadState === "added" || leadState === "exists" ? (
            <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-semibold">
              ✅ {call.name?.split(" ")[0] || "They"} {leadState === "added" ? "added to Leads as 🔥 Hot Prospect" : "updated to 🔥 Hot Prospect in Leads"}
            </div>
          ) : (
            <button
              onClick={handleAddLead}
              disabled={leadState === "adding" || !call.name}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all shadow-lg shadow-orange-600/20"
            >
              {leadState === "adding" ? "Adding…" : leadState === "error" ? "⚠️ Couldn't add — try again" : "🔥 Add to Leads as Hot Prospect"}
            </button>
          )}
          <p className="text-[10px] text-zinc-600 text-center mt-1.5">Saves name, phone, email &amp; call notes to Leads under 🔥 Hot Prospect.</p>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 p-4 flex-shrink-0 flex items-center gap-2">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-red-400 text-xs font-medium hover:bg-red-500/10 hover:border-red-500/30 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs hover:bg-zinc-800 transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors shadow-lg shadow-red-500/20">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                {deleting ? "Deleting…" : "Yes, Delete Permanently"}
              </button>
            </div>
          )}
          <button
            onClick={handleFathomSync}
            disabled={fathomLoading}
            title="Sync from Fathom recording"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 text-violet-400 hover:bg-violet-500/10 hover:border-violet-500/30 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {fathomLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 transition-colors shadow-lg shadow-violet-500/20"
          >
            {saving ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : saved ? "✓ Saved" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Script Section Card ──────────────────────────────────────────────────────
function ScriptSectionCard({
  section,
  note,
  saving,
  onSave,
}: {
  section: ScriptSection;
  note: SectionNote | undefined;
  saving: boolean;
  onSave: (notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [text, setText] = useState(note?.notes ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if parent note changes (e.g. auto-fill)
  useEffect(() => {
    if (note?.notes !== undefined && note.notes !== text) setText(note.notes ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.notes]);

  function handleChange(val: string) {
    setText(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSave(val), 800);
  }

  const hasContent = !!text.trim() || !!note?.fathom_excerpt;

  return (
    <div className={`border rounded-2xl transition-all ${hasContent ? "border-zinc-700 bg-zinc-900" : "border-zinc-800 bg-zinc-900/50"}`}>
      {/* Section header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-lg leading-none flex-shrink-0">{section.emoji}</span>
        <span className={`text-sm font-semibold flex-1 ${hasContent ? "text-white" : "text-zinc-400"}`}>{section.title}</span>
        {hasContent && <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" title="Has notes" />}
        {saving && <span className="text-[10px] text-zinc-500 flex-shrink-0">saving…</span>}
        <svg
          className={`w-4 h-4 text-zinc-600 transition-transform flex-shrink-0 ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Transition text */}
          {section.transition_text && (
            <div className="bg-zinc-800/50 rounded-xl px-3 py-2 border border-zinc-700/50">
              <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Transition</p>
              <p className="text-xs text-zinc-300 leading-relaxed italic">&ldquo;{section.transition_text}&rdquo;</p>
            </div>
          )}

          {/* Questions */}
          {section.questions.length > 0 && (
            <div className="space-y-1">
              {section.questions.map((q, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-zinc-600 text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                  <p className="text-xs text-zinc-400 leading-relaxed">{q}</p>
                </div>
              ))}
            </div>
          )}

          {/* Fathom excerpt */}
          {note?.fathom_excerpt && (
            <div className="bg-violet-500/8 rounded-xl px-3 py-2 border border-violet-500/20">
              <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-1">From Recording</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{note.fathom_excerpt}</p>
            </div>
          )}

          {/* Notes textarea */}
          <textarea
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Your notes for this section..."
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
          />
        </div>
      )}
    </div>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────
const inputCls = "w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => <option key={o} value={o}>{o || "— None —"}</option>)}
    </select>
  );
}

// ─── Add Call Modal ───────────────────────────────────────────────────────────
interface GhlContact { id: string; name: string; email: string | null; phone: string | null; ghlUrl: string }
interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees: { email: string; name: string }[];
  description?: string;
  location?: string;
  isOneOnOne: boolean;
}

function CalEventCard({ ev, onSelect }: { ev: CalEvent; onSelect: () => void }) {
  const d = new Date(ev.start);
  const dayLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endD = ev.end ? new Date(ev.end) : null;
  const durationMin = endD ? Math.round((endD.getTime() - d.getTime()) / 60000) : null;
  const primaryName = ev.isOneOnOne ? (ev.attendees[0]?.name || ev.attendees[0]?.email || "") : `${ev.attendees.length} people`;

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-violet-500/50 hover:bg-zinc-800/60 transition-all group"
    >
      <div className="flex items-start gap-3">
        {/* Date column */}
        <div className="flex-shrink-0 text-center w-10">
          <p className="text-[10px] text-zinc-500 uppercase">{d.toLocaleDateString("en-US", { weekday: "short" })}</p>
          <p className="text-lg font-bold text-white leading-tight">{d.getDate()}</p>
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate group-hover:text-violet-300 transition-colors">{ev.summary}</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {timeLabel}{durationMin ? ` · ${durationMin}m` : ""}
          </p>
          {ev.isOneOnOne ? (
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className={`w-5 h-5 rounded-full ${avatarBg(primaryName)} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
                {initials(primaryName)}
              </div>
              <span className="text-xs text-zinc-300">{primaryName}</span>
              <span className="text-[10px] text-zinc-600">· {ev.attendees[0]?.email}</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {ev.attendees.slice(0, 3).map((a) => (
                <span key={a.email} className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded-full">{a.name || a.email.split("@")[0]}</span>
              ))}
              {ev.attendees.length > 3 && (
                <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full">+{ev.attendees.length - 3} more</span>
              )}
            </div>
          )}
          {ev.location && (
            <p className="text-[10px] text-zinc-600 mt-1 truncate">📍 {ev.location}</p>
          )}
        </div>
        {/* Badge */}
        <div className="flex-shrink-0">
          {ev.isOneOnOne ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25 font-medium">1:1</span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">{ev.attendees.length} ppl</span>
          )}
        </div>
      </div>
    </button>
  );
}

function AddCallModal({ onClose, onAdd }: { onClose: () => void; onAdd: (call: Partial<SalesCall>) => Promise<void> }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [callType, setCallType] = useState<CallType>("📞 Sales Call");
  const [ghlResults, setGhlResults] = useState<GhlContact[]>([]);
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [calConfigured, setCalConfigured] = useState<boolean | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingCal, setLoadingCal] = useState(false);
  const [fathomResults, setFathomResults] = useState<FathomRecording[]>([]);
  const [selected, setSelected] = useState<Partial<SalesCall>>({});
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"manual" | "calendar">("manual");
  const [calFilter, setCalFilter] = useState<"all" | "1on1">("1on1");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // GHL search
  useEffect(() => {
    if (name.length < 2) { setGhlResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/leads/add?q=${encodeURIComponent(name)}`);
        const data = await res.json();
        setGhlResults(data.contacts ?? []);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [name]);

  async function loadCalendar() {
    setLoadingCal(true);
    setCalError(null);
    try {
      const res = await fetch("/api/calendar/events");
      const data = await res.json();
      setCalEvents(data.events ?? []);
      setCalConfigured(data.configured ?? false);
      if (data.error) setCalError(data.error);
    } finally {
      setLoadingCal(false);
    }
  }

  function openCalendarMode() {
    setMode("calendar");
    if (calEvents.length === 0 && calConfigured === null) loadCalendar();
  }

  function selectGhl(contact: GhlContact) {
    setName(contact.name);
    setSelected((prev) => ({
      ...prev,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      ghl_contact_id: contact.id,
      ghl_url: contact.ghlUrl,
    }));
    setGhlResults([]);
  }

  function selectCalEvent(ev: CalEvent) {
    const primary = ev.attendees[0];
    const personName = ev.isOneOnOne
      ? (primary?.name || ev.summary.replace(/\s*\|.*$/,"").replace(/call with andrew.*/i,"").trim())
      : ev.summary;
    const personEmail = primary?.email ?? null;

    setName(personName);
    setDate(new Date(ev.start).toISOString().slice(0, 16));
    setSelected((prev) => ({
      ...prev,
      name: personName,
      email: personEmail,
      call_date: new Date(ev.start).toISOString(),
    }));
    setMode("manual");
  }

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        ...selected,
        name: name.trim(),
        call_date: date ? new Date(date).toISOString() : null,
        call_type: callType,
        result: "🔜 Upcoming",
        objections: [],
        offer_made: false,
        set_by: "Andrew Kroeze",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const visibleEvents = calFilter === "1on1" ? calEvents.filter((e) => e.isOneOnOne) : calEvents;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            {mode === "calendar" && (
              <button onClick={() => setMode("manual")} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <h3 className="text-white font-semibold">{mode === "calendar" ? "Import from Google Calendar" : "Add New Call"}</h3>
          </div>
          <div className="flex items-center gap-2">
            {mode === "manual" && (
              <button
                onClick={openCalendarMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700 transition-colors border border-zinc-700"
              >
                <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Google Calendar
              </button>
            )}
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Calendar mode */}
        {mode === "calendar" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {loadingCal ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-zinc-500">Fetching your next 21 days…</p>
              </div>
            ) : !calConfigured ? (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                  <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <p className="text-sm text-amber-300 font-medium">Google Calendar not configured</p>
                </div>
                <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">
                  <p className="font-medium text-white">To connect Google Calendar:</p>
                  <ol className="space-y-2 pl-4">
                    <li className="list-decimal">Open <span className="text-violet-400">calendar.google.com</span> → Settings (⚙️)</li>
                    <li className="list-decimal">Click your calendar name on the left</li>
                    <li className="list-decimal">Scroll to <span className="font-medium text-white">"Secret address in iCal format"</span></li>
                    <li className="list-decimal">Copy the URL and add to <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">.env.local</code>:</li>
                  </ol>
                  <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 font-mono text-xs text-zinc-300">
                    GOOGLE_CALENDAR_ICAL_URL=https://calendar.google.com/calendar/ical/...
                  </div>
                  <p className="text-xs text-zinc-500">Restart the dev server after adding the env var. On Vercel, add it to your project environment variables.</p>
                </div>
                <button onClick={loadCalendar} className="w-full py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors border border-zinc-700">
                  Retry
                </button>
              </div>
            ) : calError ? (
              <div className="p-6 space-y-4">
                <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-xl">
                  <p className="text-sm text-red-400">{calError}</p>
                </div>
                <button onClick={loadCalendar} className="w-full py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors border border-zinc-700">
                  Retry
                </button>
              </div>
            ) : (
              <>
                {/* Filter tabs + refresh */}
                <div className="px-4 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
                  <div className="flex gap-1.5">
                    {([["1on1", "1-on-1 only"], ["all", "All meetings"]] as const).map(([k, label]) => (
                      <button
                        key={k}
                        onClick={() => setCalFilter(k)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${calFilter === k ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
                      >
                        {label}
                        <span className="ml-1.5 text-[10px] opacity-70">
                          {k === "1on1" ? calEvents.filter((e) => e.isOneOnOne).length : calEvents.length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button onClick={loadCalendar} className="text-zinc-500 hover:text-white transition-colors p-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                </div>
                <p className="px-4 pb-2 text-[11px] text-zinc-600 flex-shrink-0">Next 21 days · click to add as Upcoming call</p>

                {/* Event list */}
                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
                  {visibleEvents.length === 0 ? (
                    <p className="text-center text-zinc-600 text-sm py-10">
                      {calFilter === "1on1" ? "No 1-on-1 calls in the next 21 days" : "No meetings found"}
                    </p>
                  ) : (
                    visibleEvents.map((ev) => (
                      <CalEventCard key={ev.id} ev={ev} onSelect={() => selectCalEvent(ev)} />
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Manual mode */}
        {mode === "manual" && (
          <>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Name with GHL search */}
              <div className="space-y-1.5 relative">
                <label className="text-xs font-medium text-zinc-500">Prospect Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Start typing to search GHL..."
                  className={inputCls}
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-3 top-8 w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                )}
                {ghlResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl mt-1 overflow-hidden">
                    {ghlResults.map((c) => (
                      <button key={c.id} onClick={() => selectGhl(c)} className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0">
                        <p className="text-sm text-white font-medium">{c.name}</p>
                        <p className="text-xs text-zinc-500">{c.phone ?? c.email ?? "No contact info"}</p>
                      </button>
                    ))}
                  </div>
                )}
                {selected.ghl_contact_id && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    GHL contact linked — phone, email, and GHL URL auto-filled
                  </p>
                )}
                {selected.email && !selected.ghl_contact_id && (
                  <p className="text-xs text-blue-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                    Imported from Google Calendar — email pre-filled
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500">Call Date & Time</label>
                <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500">Call Type</label>
                <Select value={callType} onChange={(v) => setCallType(v as CallType)} options={TYPE_OPTIONS} />
              </div>

              {fathomResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 font-medium">Fathom recordings found:</p>
                  {fathomResults.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelected((prev) => ({ ...prev, recording_url: r.fathomShareUrl, ai_summary: r.summaryText, fathom_call_id: r.id }))}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${selected.fathom_call_id === r.id ? "bg-violet-500/10 border-violet-500/40 text-violet-300" : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"} text-xs`}
                    >
                      <p className="font-medium">{r.title}</p>
                      <p className="text-zinc-500 mt-0.5">{fmtShortDate(r.scheduledAt)} · {r.durationMinutes}m</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 flex-shrink-0">
              <button
                onClick={handleAdd}
                disabled={saving || !name.trim()}
                className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-500 disabled:opacity-40 transition-colors shadow-lg shadow-violet-500/20"
              >
                {saving ? "Adding..." : "Add Call"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Fathom Recordings Section ────────────────────────────────────────────────
function FathomSection({ recordings }: { recordings: FathomRecording[] }) {
  const [selected, setSelected] = useState<FathomRecording | null>(null);
  if (recordings.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-semibold text-white">Recent Recordings</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">Fathom · not in Airtable</span>
      </div>
      <div className="space-y-3">
        {recordings.map((rec) => (
          <button
            key={rec.id}
            onClick={() => setSelected(rec)}
            className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all"
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-full ${avatarBg(rec.contactName ?? rec.title)} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}>
                {rec.contactName ? initials(rec.contactName) : "🎙"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-semibold text-white text-[15px]">{rec.contactName ?? rec.title}</span>
                  <span className="text-xs text-zinc-500 flex-shrink-0">{fmtDate(rec.scheduledAt)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">{rec.callType}</span>
                  <span className="text-xs text-zinc-500">{rec.durationMinutes}m</span>
                  {rec.budget && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{rec.budget}</span>}
                  <span className="text-xs text-violet-400">🎙 Recording</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" />
          <div className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800">
              <div className={`w-10 h-10 rounded-full ${avatarBg(selected.contactName ?? selected.title)} flex items-center justify-center text-white font-semibold text-sm`}>
                {selected.contactName ? initials(selected.contactName) : "🎙"}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-white font-semibold text-[15px]">{selected.contactName ?? selected.title}</h2>
                <p className="text-zinc-500 text-xs">{fmtDate(selected.scheduledAt)} · {selected.durationMinutes}m</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 p-5 space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-500">Summary</p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-sm text-zinc-300 leading-relaxed">{selected.summaryText}</p>
                </div>
              </div>
              {selected.nextSteps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-500">Next Steps</p>
                  <div className="space-y-2">
                    {selected.nextSteps.map((step, i) => (
                      <div key={i} className="flex gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                        <span className="text-violet-500 flex-shrink-0">→</span>
                        <p className="text-sm text-zinc-300">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(selected.contactEmail || selected.contactPhone) && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-500">Contact</p>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
                    {selected.contactPhone && <div className="flex justify-between"><span className="text-xs text-zinc-500">Phone</span><a href={`tel:${selected.contactPhone}`} className="text-sm text-white hover:text-violet-400">{selected.contactPhone}</a></div>}
                    {selected.contactEmail && <div className="flex justify-between"><span className="text-xs text-zinc-500">Email</span><a href={`mailto:${selected.contactEmail}`} className="text-sm text-white hover:text-violet-400">{selected.contactEmail}</a></div>}
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-zinc-800 p-4 flex gap-3">
              <a href={selected.fathomShareUrl} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-colors">
                View Recording
              </a>
              <a href={selected.fathomUrl} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors">
                Full Transcript →
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type ViewMode = "list" | "calendar" | "pipeline";

export default function CallsPage() {
  const [calls, setCalls] = useState<SalesCall[]>([]);
  const [recordings, setRecordings] = useState<FathomRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [mainTab, setMainTab] = useState<"calls" | "calendar" | "data">("calendar");
  const [selected, setSelected] = useState<SalesCall | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>("mtd");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [typeFilter, setTypeFilter] = useState<CallType | "all">("all");
  const [searchQ, setSearchQ] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [callsRes, fathomRes] = await Promise.all([
        fetch("/api/sales-calls"),
        fetch("/api/calls"),
      ]);
      const [callsData, fathomData] = await Promise.all([callsRes.json(), fathomRes.json()]);
      if (callsData.error) setError(callsData.error);
      else { setCalls(callsData.calls ?? []); setError(null); }
      setRecordings(fathomData.recordings ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Pull the latest booked 1-on-1 sales calls from the calendar (GoHighLevel) on
  // open, and keep pulling every 5 min while the page is up, so newly-booked
  // calls show up automatically.
  useEffect(() => {
    let alive = true;
    const sync = () => fetch("/api/calendar/sync-calls", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { if (alive && d?.synced) fetchData(); })
      .catch(() => {});
    sync();
    const id = setInterval(sync, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [fetchData]);

  // Sort: upcoming (future) first by date asc, then past calls by date desc
  const sortedCalls = [...calls].sort((a, b) => {
    const now = new Date();
    const da = a.call_date ? new Date(a.call_date) : null;
    const db_ = b.call_date ? new Date(b.call_date) : null;
    const aFuture = da && da >= now;
    const bFuture = db_ && db_ >= now;
    if (aFuture && bFuture) return da!.getTime() - db_!.getTime(); // soonest first
    if (aFuture) return -1; // upcoming always above past
    if (bFuture) return 1;
    if (!da && !db_) return 0;
    if (!da) return 1;
    if (!db_) return -1;
    return db_!.getTime() - da.getTime(); // most recent past first
  });

  // The Calls work queue always shows everything; the date range only scopes the Data tab
  const dateFilteredCalls = mainTab === "data" ? filterByDateRange(sortedCalls, dateRange, customStart, customEnd) : sortedCalls;

  const filteredCalls = dateFilteredCalls.filter((c) => {
    if (filter === "action" && !needsAction(c)) return false;
    if (filter === "followup" && !c.result?.includes("Follow Up")) return false;
    if (filter === "sale" && !c.result?.includes("Sale")) return false;
    if (filter === "upcoming" && !c.result?.includes("Upcoming")) return false;
    if (filter === "lost" && !c.result?.includes("Did Not Close") && !c.result?.includes("No Show")) return false;
    if (typeFilter !== "all" && c.call_type !== typeFilter) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      if (
        !c.name?.toLowerCase().includes(q) &&
        !c.email?.toLowerCase().includes(q) &&
        !c.phone?.toLowerCase().includes(q) &&
        !c.call_notes?.toLowerCase().includes(q) &&
        !c.offer?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  async function handleSave(updated: Partial<SalesCall>) {
    if (!selected) return;
    const res = await fetch("/api/sales-calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, ...updated }),
    });
    const data = await res.json();
    if (data.call) {
      setCalls((prev) => prev.map((c) => (c.id === selected.id ? data.call : c)));
      setSelected(data.call);
    }
  }

  // Inline edit straight from the grid row (optimistic)
  async function handleInlineUpdate(id: string, patch: Partial<SalesCall>) {
    setCalls((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch("/api/sales-calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function handleDelete() {
    if (!selected) return;
    await fetch("/api/sales-calls", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id }),
    });
    setCalls((prev) => prev.filter((c) => c.id !== selected.id));
    setSelected(null);
  }

  async function handleAdd(call: Partial<SalesCall>) {
    const res = await fetch("/api/sales-calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(call),
    });
    const data = await res.json();
    if (data.call) setCalls((prev) => [data.call, ...prev]);
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans">
      <div className="w-full py-4">
        {/* Page header */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Sales Calls</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Powered by Supabase · live data</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => setView("list")}
                title="List"
                className={`p-1.5 rounded-lg transition-colors ${view === "list" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white"}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              </button>
              <button
                onClick={() => setView("pipeline")}
                title="Pipeline"
                className={`p-1.5 rounded-lg transition-colors ${view === "pipeline" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white"}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
              </button>
            </div>
            <button onClick={fetchData} className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-colors shadow-lg shadow-violet-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Call
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm mb-5">
                {error}
              </div>
            )}

            {/* Main tab switch: follow-up next · calls · data */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1 mb-6">
              {([
                ["calls", "📞 Calls"],
                ["calendar", "📅 Calendar"],
                ["data", "📊 Dashboard"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMainTab(key)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${mainTab === key ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "text-zinc-400 hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mainTab === "calendar" && (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
                <div className="min-w-0">
                  <CalendarView
                    calls={sortedCalls}
                    onSelectCall={setSelected}
                    onReschedule={handleInlineUpdate}
                  />
                </div>
                <div className="min-w-0 xl:sticky xl:top-4">
                  <CallAgenda calls={sortedCalls} onSelect={setSelected} />
                </div>
              </div>
            )}

            {mainTab === "data" && (
              <>
                <DateRangeBar
                  range={dateRange}
                  onChange={setDateRange}
                  customStart={customStart}
                  customEnd={customEnd}
                  onCustomStart={setCustomStart}
                  onCustomEnd={setCustomEnd}
                />

                <ExtendedStatsBar calls={filterByDateRange(sortedCalls, dateRange, customStart, customEnd)} />

                {/* Analytics charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  <ResultsChart calls={filterByDateRange(sortedCalls, dateRange, customStart, customEnd)} />
                  <SuccessPie calls={filterByDateRange(sortedCalls, dateRange, customStart, customEnd)} />
                  <RevenueByMonth calls={filterByDateRange(sortedCalls, dateRange, customStart, customEnd)} />
                  <BookingsByMonth calls={filterByDateRange(sortedCalls, dateRange, customStart, customEnd)} />
                  <ResultsByMonth calls={filterByDateRange(sortedCalls, dateRange, customStart, customEnd)} />
                </div>
              </>
            )}

            {mainTab === "calls" && view === "list" && (
              <>
                {/* Compact toolbar — status + type dropdowns + search (Monarch-style) */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as Filter)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 font-medium focus:outline-none focus:border-violet-500 cursor-pointer"
                  >
                    <option value="all">📋 All Calls ({dateFilteredCalls.length})</option>
                    <option value="action">🎯 Needs Action ({dateFilteredCalls.filter(needsAction).length})</option>
                    <option value="upcoming">🔜 Upcoming ({dateFilteredCalls.filter((c) => c.result?.includes("Upcoming")).length})</option>
                    <option value="followup">📣 Follow Up ({dateFilteredCalls.filter((c) => c.result?.includes("Follow Up")).length})</option>
                    <option value="sale">✅ Closed ({dateFilteredCalls.filter((c) => c.result?.includes("Sale")).length})</option>
                    <option value="lost">❌ Lost ({dateFilteredCalls.filter((c) => c.result?.includes("Did Not Close") || c.result?.includes("No Show")).length})</option>
                  </select>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 font-medium focus:outline-none focus:border-violet-500 cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="relative flex-1 min-w-[180px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
                    <input
                      type="text"
                      placeholder="Search by name, email, notes, offer…"
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-10 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                    {searchQ && (
                      <button onClick={() => setSearchQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors">✕</button>
                    )}
                  </div>
                </div>
                {filteredCalls.length === 0 ? (
                  <div className="text-center py-16 text-zinc-600">
                    <p className="text-lg mb-2">No calls yet</p>
                    <p className="text-sm">Click &ldquo;Add Call&rdquo; to get started</p>
                  </div>
                ) : (
                  <GroupedCallList calls={filteredCalls} onSelect={setSelected} onUpdate={handleInlineUpdate} />
                )}
              </>
            )}

            {mainTab === "calls" && view === "pipeline" && (
              <PipelineView calls={dateFilteredCalls} onSelectCall={setSelected} />
            )}

            {mainTab === "calls" && <FathomSection recordings={recordings} />}
          </>
        )}
      </div>

      {selected && (
        <DetailPanel
          call={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      {showAdd && (
        <AddCallModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}
