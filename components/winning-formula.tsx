"use client";

import { useMemo, useState } from "react";
import {
  CADENCES, CADENCE_META, formulaStreak, gridRate, lastPeriods, periodLabel,
  periodProgress, periodStart, periodTitle, type Cadence, type FormulaHabit,
} from "@/lib/formula-periods";

// Offered on an empty formula, so nobody stares at a blank box wondering what
// belongs at this cadence. These are the plays Andrew actually runs.
const STARTERS: Record<Cadence, string[]> = {
  Daily: ["One reel, posted", "10 conversations", "3 call asks / doc sends", "Exercise 20 min", "Breathwork + meditation"],
  Weekly: ["Ship the YouTube video", "Work the hot list top to bottom", "One Value Bomb in the community", "Review the numbers", "Plan next week"],
  Monthly: ["Run one conversion event", "Send the monthly report", "One partnership conversation", "Refresh the offer ladder", "Take a full day off"],
};

export type FormulaHandlers = {
  onToggle: (habitId: string, period: string) => void;
  onAdd: (cadence: Cadence, name: string) => void;
  onPatch: (id: string, f: Partial<Pick<FormulaHabit, "name" | "cadence" | "emoji" | "owner">>) => void;
  onRemove: (id: string) => void;
};

/**
 * The Winning Formula board. All three cadences live behind one segmented
 * switcher so the whole thing stays compact enough to sit above the task sheet —
 * but every cadence keeps its own progress pill, so you can still read the state
 * of all three at a glance without switching.
 */
export function FormulaBoard({
  byCadence, showOwner, handlers, only,
}: {
  byCadence: Record<Cadence, FormulaHabit[]>;
  showOwner: boolean;
  handlers: FormulaHandlers;
  /** Lock the board to one cadence (hides the switcher) — used for the daily
   *  strip that sits above the task sheet. */
  only?: Cadence;
}) {
  const [picked, setCadence] = useState<Cadence>("Daily");
  const cadence = only ?? picked;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const habits = byCadence[cadence];
  const meta = CADENCE_META[cadence];
  const periods = useMemo(() => lastPeriods(cadence, meta.slots), [cadence, meta.slots]);
  const current = periodStart(cadence);
  const prog = periodProgress(habits, cadence);
  const streak = formulaStreak(habits, cadence);
  const rate = gridRate(habits, periods);
  const perfect = prog.total > 0 && prog.done === prog.total;

  function submit() {
    const t = draft.trim();
    if (!t) return;
    handlers.onAdd(cadence, t);
    setDraft("");
  }

  return (
    <div className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-colors ${perfect ? "border-amber-500/60" : "border-zinc-800"}`}>
      {/* Cadence switcher — each tab carries its own progress so all three read at once */}
      {!only && (
      <div className="flex items-stretch border-b border-zinc-800">
        {CADENCES.map((c) => {
          const p = periodProgress(byCadence[c], c);
          const s = formulaStreak(byCadence[c], c);
          const done = p.total > 0 && p.done === p.total;
          const on = c === cadence;
          return (
            <button key={c} onClick={() => { setCadence(c); setEditing(null); setDraft(""); }}
              className={`flex-1 px-3 py-2.5 text-left transition-colors border-b-2 ${on ? "bg-zinc-800/60 border-amber-500" : "border-transparent hover:bg-zinc-800/30"}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{CADENCE_META[c].emoji}</span>
                <span className={`text-xs font-bold ${on ? "text-white" : "text-zinc-400"}`}>{c}</span>
                {s > 0 && <span className="text-[10px] text-amber-400 font-bold">🔥{s}</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="h-1 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${done ? "bg-gradient-to-r from-amber-400 to-yellow-500" : "bg-blue-500"}`}
                    style={{ width: `${p.pct}%` }} />
                </div>
                <span className={`text-[10px] tabular-nums ${done ? "text-amber-400 font-bold" : "text-zinc-600"}`}>{p.done}/{p.total}</span>
              </div>
            </button>
          );
        })}
      </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="min-w-0">
            <p className="text-white font-bold text-sm flex items-center gap-2 flex-wrap">
              {only && <span>{meta.emoji}</span>}
              {meta.title}
              {only && habits.length > 0 && (
                <span className={`text-xs font-bold tabular-nums ${perfect ? "text-amber-400" : "text-zinc-500"}`}>{prog.done}/{prog.total}</span>
              )}
              {only && streak > 0 && <span className="text-xs text-amber-400 font-bold">🔥{streak}</span>}
              {perfect && (
                <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-zinc-950 text-[10px] font-bold">
                  This {meta.unit} is clear
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{meta.blurb}</p>
          </div>
          {habits.length > 0 && (
            <p className="text-[11px] text-zinc-600 whitespace-nowrap">{rate}% of the last {periods.length} {meta.unit}s hit</p>
          )}
        </div>

        {habits.length === 0 ? (
          <div className="flex gap-1.5 flex-wrap">
            {STARTERS[cadence].map((s) => (
              <button key={s} onClick={() => handlers.onAdd(cadence, s)}
                className="rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-amber-500/50 hover:text-white transition-colors">
                ＋ {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {habits.map((h) => (
              <HabitRow
                key={h.id} h={h} cadence={cadence} periods={periods} current={current} showOwner={showOwner}
                editing={editing === h.id}
                onEdit={() => setEditing(h.id)} onClose={() => setEditing(null)}
                onToggle={(p) => handlers.onToggle(h.id, p)}
                onPatch={(f) => handlers.onPatch(h.id, f)}
                onRemove={() => handlers.onRemove(h.id)}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <input
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder={cadence === "Daily" ? "Add a daily non-negotiable…" : cadence === "Weekly" ? "Add a weekly move…" : "Add a monthly big rock…"}
            aria-label={`Add to your ${cadence} Winning Formula`}
            className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
          />
          <button onClick={submit} disabled={!draft.trim()}
            className="shrink-0 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold disabled:opacity-40 transition-colors">＋ Add</button>
        </div>
      </div>
    </div>
  );
}

function HabitRow({ h, cadence, periods, current, showOwner, editing, onEdit, onClose, onToggle, onPatch, onRemove }: {
  h: FormulaHabit; cadence: Cadence; periods: string[]; current: string; showOwner: boolean;
  editing: boolean;
  onEdit: () => void; onClose: () => void;
  onToggle: (period: string) => void;
  onPatch: (f: Partial<Pick<FormulaHabit, "name" | "cadence" | "emoji" | "owner">>) => void;
  onRemove: () => void;
}) {
  const doneNow = h.done.includes(current);
  const unit = CADENCE_META[cadence].unit;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <div className="flex items-center gap-3">
        {/* the one big tick for the period you are actually in */}
        <button
          onClick={() => onToggle(current)}
          aria-pressed={doneNow}
          aria-label={doneNow ? `Undo ${h.name} for this ${unit}` : `Complete ${h.name} for this ${unit}`}
          className={`shrink-0 h-7 w-7 rounded-lg grid place-items-center text-sm font-bold border transition active:scale-90 ${
            doneNow ? "bg-gradient-to-br from-amber-400 to-yellow-500 border-amber-400 text-zinc-950" : "border-zinc-700 text-transparent hover:border-zinc-500"
          }`}
        >✓</button>

        <button onClick={onEdit} className="min-w-0 flex-1 text-left">
          <span className={`block text-sm font-medium truncate ${doneNow ? "text-zinc-600" : "text-zinc-100"}`}>{h.emoji} {h.name}</span>
          {showOwner && <span className={`block text-[11px] truncate ${h.owner === "Jameson" ? "text-violet-400" : "text-blue-400"}`}>{h.owner === "Jameson" ? "🧑 Jameson" : "🧔 Andrew"}</span>}
        </button>

        {/* the chain: one box per period, oldest on the left */}
        <span className="hidden sm:flex gap-1 shrink-0">
          {periods.map((p) => {
            const on = h.done.includes(p);
            const isNow = p === current;
            return (
              <button
                key={p} onClick={() => onToggle(p)}
                title={`${periodTitle(cadence, p)}${on ? " · done" : ""}`}
                aria-label={`${h.name}, ${periodTitle(cadence, p)}${on ? ", done" : ", not done"}`}
                className={`h-6 w-6 rounded-md grid place-items-center text-[9px] font-bold transition ${
                  on ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-zinc-950"
                    : `bg-zinc-900 text-zinc-600 border ${isNow ? "border-amber-500" : "border-zinc-800"}`
                }`}
              >{periodLabel(cadence, p)}</button>
            );
          })}
        </span>
      </div>

      {editing && (
        <div className="mt-2.5 pt-2.5 border-t border-zinc-800 space-y-2">
          <input
            defaultValue={h.name}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== h.name) onPatch({ name: v }); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            aria-label="Rename this one"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <div className="grid sm:grid-cols-3 gap-2">
            <select value={h.cadence || "Daily"} onChange={(e) => onPatch({ cadence: e.target.value })} aria-label="How often"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
              {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_META[c].emoji} {c}</option>)}
            </select>
            <select value={h.owner} onChange={(e) => onPatch({ owner: e.target.value })} aria-label="Whose habit"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500">
              <option value="Andrew">🧔 Andrew</option>
              <option value="Jameson">🧑 Jameson</option>
            </select>
            <input defaultValue={h.emoji} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== h.emoji) onPatch({ emoji: v }); }} aria-label="Emoji"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-center text-zinc-200 focus:outline-none focus:border-blue-500" />
          </div>
          {/* on a phone the chain is hidden, so give back a way to fix a missed period */}
          <div className="sm:hidden flex gap-1 flex-wrap">
            {periods.map((p) => {
              const on = h.done.includes(p);
              return (
                <button key={p} onClick={() => onToggle(p)}
                  className={`h-7 px-2 rounded-md text-[10px] font-bold transition ${
                    on ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-zinc-950" : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                  }`}>
                  {periodTitle(cadence, p).replace("Week of ", "")}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors">Done</button>
            <button onClick={onRemove} className="ml-auto px-3 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 text-xs transition-colors">Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The score ring. One number you don't want to break. */
export function Ring({ pct, size = 72 }: { pct: number; size?: number }) {
  const R = size / 2 - 6, C = 2 * Math.PI * R;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#27272a" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="url(#execRing)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100} style={{ transition: "stroke-dashoffset .6s ease" }} />
        <defs><linearGradient id="execRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient></defs>
      </svg>
      <span className="absolute inset-0 grid place-items-center text-base font-bold text-white tabular-nums">{pct}%</span>
    </div>
  );
}
