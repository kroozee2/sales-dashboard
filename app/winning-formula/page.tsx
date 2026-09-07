"use client";

import { useEffect, useMemo, useState } from "react";
import { SubTabs } from "@/components/sub-tabs";
import { usePerson } from "@/lib/use-person";
import { FormulaBoard, Ring, type FormulaHandlers } from "@/components/winning-formula";
import {
  CADENCES, CADENCE_META, formulaStreak, winningScore, type Cadence, type FormulaHabit,
} from "@/lib/formula-periods";

// The full Winning Formula: all three cadences, one score, the streaks that make
// it worth keeping. (The daily strip also appears above the task sheet on Tasks.)
export default function WinningPage() {
  const [allHabits, setAllHabits] = useState<FormulaHabit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [person] = usePerson();

  useEffect(() => {
    fetch("/api/habits").then((r) => r.json()).then((d) => setAllHabits(Array.isArray(d) ? d : []));
  }, []);

  const handlers: FormulaHandlers = useMemo(() => ({
    onToggle: async (habitId, period) => {
      const flip = (hs: FormulaHabit[] | null) => hs?.map((h) => h.id !== habitId ? h
        : { ...h, done: h.done.includes(period) ? h.done.filter((d) => d !== period) : [...h.done, period] }) ?? hs;
      setAllHabits(flip);
      setErr(null);
      try {
        const r = await fetch("/api/habits/toggle", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ habit_id: habitId, day: period }),
        });
        // put the box back rather than showing a tick that was never stored
        if (!r.ok) { setAllHabits(flip); setErr("That didn't save. Try again."); }
      } catch { setAllHabits(flip); setErr("Lost connection, so that one didn't save."); }
    },
    onAdd: async (cadence, name) => {
      const owner = person === "all" ? "Andrew" : person;
      const res = await fetch("/api/habits", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, cadence, owner }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.id) setAllHabits((hs) => [...(hs ?? []), d]);
    },
    onPatch: async (id, fields) => {
      setAllHabits((hs) => hs?.map((h) => (h.id === id ? { ...h, ...fields } : h)) ?? hs);
      await fetch("/api/habits", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...fields }) });
    },
    onRemove: async (id) => {
      setAllHabits((hs) => hs?.filter((h) => h.id !== id) ?? hs);
      await fetch("/api/habits", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    },
  }), [person]);

  const habits = useMemo(
    () => (allHabits ?? []).filter((h) => person === "all" || h.owner === person),
    [allHabits, person]
  );
  const byCadence = useMemo(() => ({
    Daily: habits.filter((h) => (h.cadence || "Daily") === "Daily"),
    Weekly: habits.filter((h) => h.cadence === "Weekly"),
    Monthly: habits.filter((h) => h.cadence === "Monthly"),
  }), [habits]) as Record<Cadence, FormulaHabit[]>;

  const score = winningScore(byCadence);
  const streaks = CADENCES.map((c) => ({ c, n: formulaStreak(byCadence[c], c) })).filter((s) => s.n > 0);
  const perfect = score === 100;

  return (
    <div className="max-w-4xl mx-auto">
      <SubTabs group="tasks" />

      {/* Scoreboard */}
      <div className={`bg-zinc-900 border rounded-2xl p-4 sm:p-5 mb-4 ${perfect ? "border-amber-500/60" : "border-zinc-800"}`}>
        <div className="flex items-center gap-4 sm:gap-5 flex-wrap">
          <Ring pct={score} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {perfect ? "🏆 The whole board is clear" : score >= 50 ? "🔥 You're winning" : "🔥 Winning"}
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {perfect
                ? "Daily, weekly and monthly all done. This is the kind of day that compounds."
                : "One score across all three formulas. The daily one carries half of it, because that's the part that compounds."}
            </p>
            {streaks.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {streaks.map(({ c, n }) => (
                  <span key={c} className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
                    🔥 {n} {CADENCE_META[c].unit}{n === 1 ? "" : "s"} in a row
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {err && <p className="text-rose-400 text-xs mb-3">{err}</p>}

      {allHabits === null ? (
        <p className="text-zinc-600 text-center py-16 animate-pulse">Loading…</p>
      ) : (
        <FormulaBoard byCadence={byCadence} showOwner={person === "all"} handlers={handlers} />
      )}
    </div>
  );
}
