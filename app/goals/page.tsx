"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Goal {
  id: string;
  name: string;
  emoji: string;
  goal_type: "cash" | "count";
  category: string; // revenue | signups | tickets | other
  target_amount: number;
  current_amount: number; // manual tally / adjustment
  period: string; // monthly | quarterly | annual | weekly | one_time
  target_date: string | null;
  source: string | null; // null=manual, or cash_mtd|cash_wtd|cash_qtd|cash_ytd|cash_alltime
  color: string;
  notes: string | null;
  sort_order: number;
  archived: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

type NewGoal = Omit<Goal, "id" | "created_at" | "updated_at" | "archived" | "sort_order" | "featured">;

// ─── Constants ──────────────────────────────────────────────────────────────

const SOURCE_PERIOD: Record<string, string> = {
  cash_mtd: "mtd",
  cash_wtd: "wtd",
  cash_qtd: "qtd",
  cash_ytd: "ytd",
  cash_alltime: "alltime",
};

const SOURCE_LABEL: Record<string, string> = {
  cash_mtd: "Live · Stripe this month",
  cash_wtd: "Live · Stripe this week",
  cash_qtd: "Live · Stripe this quarter",
  cash_ytd: "Live · Stripe this year",
  cash_alltime: "Live · Stripe all time",
};

const PERIODS = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
  { key: "weekly", label: "Weekly" },
  { key: "one_time", label: "One-time" },
];

const CATEGORIES = [
  { key: "revenue", label: "Revenue", emoji: "💰" },
  { key: "signups", label: "Sign-ups", emoji: "✍️" },
  { key: "tickets", label: "Tickets", emoji: "🎟️" },
  { key: "other", label: "Other", emoji: "🏁" },
];

const COLOR_CHOICES = ["emerald", "blue", "violet", "amber", "rose", "cyan"] as const;

type ColorSpec = { bar: string; text: string; ring: string; dot: string };
const COLORS: Record<string, ColorSpec> = {
  emerald: { bar: "from-emerald-500 to-emerald-400", text: "text-emerald-400", ring: "bg-emerald-500/15", dot: "bg-emerald-400" },
  blue: { bar: "from-blue-500 to-blue-400", text: "text-blue-400", ring: "bg-blue-500/15", dot: "bg-blue-400" },
  violet: { bar: "from-violet-500 to-violet-400", text: "text-violet-400", ring: "bg-violet-500/15", dot: "bg-violet-400" },
  amber: { bar: "from-amber-500 to-amber-400", text: "text-amber-400", ring: "bg-amber-500/15", dot: "bg-amber-400" },
  rose: { bar: "from-rose-500 to-rose-400", text: "text-rose-400", ring: "bg-rose-500/15", dot: "bg-rose-400" },
  cyan: { bar: "from-cyan-500 to-cyan-400", text: "text-cyan-400", ring: "bg-cyan-500/15", dot: "bg-cyan-400" },
};

// Status colors mirror Monarch: green on-track, amber at-risk, rose behind, emerald achieved.
const STATUS: Record<string, { label: string; badge: string; bar: string }> = {
  achieved: { label: "Achieved", badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", bar: "from-emerald-500 to-emerald-400" },
  ontrack: { label: "On track", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25", bar: "from-emerald-500 to-emerald-400" },
  atrisk: { label: "At risk", badge: "bg-amber-500/20 text-amber-300 border-amber-500/30", bar: "from-amber-500 to-yellow-400" },
  behind: { label: "Behind", badge: "bg-rose-500/20 text-rose-300 border-rose-500/30", bar: "from-rose-500 to-rose-400" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtCash(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtCashExact(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtVal(g: Goal, n: number) {
  return g.goal_type === "cash" ? fmtCashExact(n) : Math.round(n).toLocaleString();
}
function fmtValShort(g: Goal, n: number) {
  return g.goal_type === "cash" ? fmtCash(n) : Math.round(n).toLocaleString();
}

function countNoun(g: Goal) {
  if (g.goal_type !== "count") return "";
  if (g.category === "tickets") return "tickets";
  if (g.category === "signups") return "sign-ups";
  return "";
}

// Fraction of the current period that has elapsed (0..1), for pace/status.
function elapsedFraction(g: Goal): number | null {
  const now = new Date();
  let start: Date, end: Date;
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  switch (g.period) {
    case "monthly":
      start = new Date(y, m, 1); end = new Date(y, m + 1, 1); break;
    case "quarterly": {
      const q = Math.floor(m / 3);
      start = new Date(y, q * 3, 1); end = new Date(y, q * 3 + 3, 1); break;
    }
    case "annual":
      start = new Date(y, 0, 1); end = new Date(y + 1, 0, 1); break;
    case "weekly": {
      const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon-based
      start = new Date(y, m, d - dow); end = new Date(start.getTime() + 7 * 86400000); break;
    }
    case "one_time":
      if (!g.target_date) return null;
      start = new Date(g.created_at);
      end = new Date(g.target_date + "T23:59:59");
      break;
    default:
      return null;
  }
  const total = end.getTime() - start.getTime();
  if (total <= 0) return null;
  return Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / total));
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T12:00:00"); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function periodDateLabel(g: Goal): string {
  const now = new Date();
  const mo = now.toLocaleDateString("en-US", { month: "long" });
  const yr = now.getFullYear();
  if (g.target_date) {
    const dt = new Date(g.target_date + "T12:00:00");
    const dLabel = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const d = daysUntil(g.target_date);
    if (d < 0) return `${dLabel} · ${Math.abs(d)}d ago`;
    if (d === 0) return `${dLabel} · today`;
    return `${dLabel} · ${d}d left`;
  }
  switch (g.period) {
    case "monthly": return `${mo} ${yr}`;
    case "quarterly": return `Q${Math.floor(now.getMonth() / 3) + 1} ${yr}`;
    case "annual": return `${yr}`;
    case "weekly": return "This week";
    default: return "";
  }
}

// Live + manual current value for a goal
function currentValue(g: Goal, live: Record<string, number>): number {
  const base = g.source && live[g.source] != null ? live[g.source] : 0;
  return base + (g.current_amount ?? 0);
}

function computeStatus(g: Goal, current: number): keyof typeof STATUS {
  const target = g.target_amount || 0;
  const progress = target > 0 ? current / target : 0;
  if (progress >= 1) return "achieved";
  const ef = elapsedFraction(g);
  if (ef == null) return "ontrack";
  // Overdue with target date and not achieved
  if (g.target_date && daysUntil(g.target_date) < 0) return "behind";
  const expected = ef;
  if (progress >= expected) return "ontrack";
  if (progress >= expected * 0.85) return "atrisk";
  return "behind";
}

// Projected end-of-period value at current pace
function projected(g: Goal, current: number): number | null {
  const ef = elapsedFraction(g);
  if (ef == null || ef <= 0.02) return null;
  return current / ef;
}

// ─── Add / Edit Modal ───────────────────────────────────────────────────────

function GoalModal({ initial, onClose, onSave, onDelete }: {
  initial: Goal | null;
  onClose: () => void;
  onSave: (g: NewGoal, id?: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🎯");
  const [goalType, setGoalType] = useState<"cash" | "count">(initial?.goal_type ?? "cash");
  const [category, setCategory] = useState(initial?.category ?? "revenue");
  const [target, setTarget] = useState(initial ? String(initial.target_amount) : "");
  const [current, setCurrent] = useState(initial ? String(initial.current_amount) : "0");
  const [period, setPeriod] = useState(initial?.period ?? "monthly");
  const [targetDate, setTargetDate] = useState(initial?.target_date ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [color, setColor] = useState(initial?.color ?? "blue");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const isCash = goalType === "cash";

  async function handleSave() {
    if (!name.trim() || !target) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      emoji: emoji || "🎯",
      goal_type: goalType,
      category,
      target_amount: parseFloat(target) || 0,
      current_amount: parseFloat(current) || 0,
      period,
      target_date: targetDate || null,
      source: isCash && source ? source : null,
      color,
      notes: notes.trim() || null,
    }, initial?.id);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 sticky top-0 bg-zinc-900 z-10">
          <h3 className="text-white font-bold text-base">{initial ? "Edit Goal" : "🏁 New Goal"}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2 bg-zinc-800 rounded-xl p-1">
            {([["cash", "💵 Cash"], ["count", "🔢 Count"]] as const).map(([t, lbl]) => (
              <button key={t} onClick={() => setGoalType(t as "cash" | "count")}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${goalType === t ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Name + emoji */}
          <div className="flex gap-2">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2}
              className="w-14 text-center bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-2.5 text-lg focus:outline-none focus:border-blue-500" />
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Goal name"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500" />
          </div>

          {/* Category */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Category</label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${category === c.key ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}>
                  <div className="text-base leading-none mb-0.5">{c.emoji}</div>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target + Current */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Target *</label>
              <div className="relative">
                {isCash && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>}
                <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0"
                  className={`w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pr-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 ${isCash ? "pl-7" : "pl-3"}`} />
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">
                {source ? "Manual add" : "Current"}
              </label>
              <div className="relative">
                {isCash && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>}
                <input type="number" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0"
                  className={`w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pr-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 ${isCash ? "pl-7" : "pl-3"}`} />
              </div>
            </div>
          </div>

          {/* Period + target date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Track over</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
                {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Target date <span className="text-zinc-600 normal-case font-normal">(opt)</span></label>
              <input type="date" value={targetDate ?? ""} onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          {/* Auto-track source (cash only) */}
          {isCash && (
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">
                Auto-track from Stripe <span className="text-zinc-600 normal-case font-normal">(optional — pulls live cash collected)</span>
              </label>
              <select value={source} onChange={(e) => setSource(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">Manual only</option>
                <option value="cash_wtd">Cash collected — this week</option>
                <option value="cash_mtd">Cash collected — this month</option>
                <option value="cash_qtd">Cash collected — this quarter</option>
                <option value="cash_ytd">Cash collected — this year</option>
                <option value="cash_alltime">Cash collected — all time</option>
              </select>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Color</label>
            <div className="flex gap-2">
              {COLOR_CHOICES.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${COLORS[c].bar} transition-transform ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110" : "opacity-70 hover:opacity-100"}`} />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Notes <span className="text-zinc-600 normal-case font-normal">(opt)</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Context…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          {initial && onDelete && (
            <button onClick={() => { if (confirm("Delete this goal?")) void onDelete(initial.id); }}
              className="px-4 py-3 border border-rose-800/50 rounded-xl text-rose-400 text-sm font-medium hover:bg-rose-950/40 transition-colors">
              Delete
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-3 border border-zinc-700 rounded-xl text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-colors">Cancel</button>
          <button onClick={() => void handleSave()} disabled={saving || !name.trim() || !target}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl text-white text-sm font-bold transition-colors">
            {saving ? "Saving…" : initial ? "Save" : "Create Goal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Goal Detail Drawer ─────────────────────────────────────────────────────

function GoalDrawer({ goal, live, liveLoading, onClose, onEdit, onPatch }: {
  goal: Goal;
  live: Record<string, number>;
  liveLoading: boolean;
  onClose: () => void;
  onEdit: () => void;
  onPatch: (id: string, patch: Partial<Goal>) => Promise<void>;
}) {
  const current = currentValue(goal, live);
  const target = goal.target_amount || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  const status = computeStatus(goal, current);
  const st = STATUS[status];
  const proj = projected(goal, current);
  const noun = countNoun(goal);
  const [step, setStep] = useState(goal.goal_type === "cash" ? "100" : "1");

  const bump = (delta: number) => void onPatch(goal.id, { current_amount: (goal.current_amount ?? 0) + delta });

  return (
    <div className="fixed inset-0 z-[60] flex" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />
      <div className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Hero */}
        <div className={`relative px-5 pt-5 pb-6 bg-gradient-to-br ${COLORS[goal.color]?.bar ?? COLORS.blue.bar}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-black/25 backdrop-blur flex items-center justify-center text-2xl">{goal.emoji}</div>
              <div>
                <h2 className="text-white font-bold text-lg leading-tight drop-shadow">{goal.name}</h2>
                <p className="text-white/80 text-xs mt-0.5">{periodDateLabel(goal)}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="mt-5">
            <div className="flex items-end justify-between">
              <span className="text-white font-extrabold text-3xl drop-shadow">{fmtVal(goal, current)}</span>
              <span className="text-white/85 text-sm font-medium">{pct.toFixed(0)}% of {fmtVal(goal, target)}</span>
            </div>
            <div className="mt-2 h-2.5 w-full rounded-full bg-black/25 overflow-hidden">
              <div className="h-full rounded-full bg-white/90 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Status + edit */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-zinc-800">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${st.badge}`}>{st.label}</span>
          <button onClick={onEdit} className="text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors">✏️ Edit goal</button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          {[
            { label: goal.goal_type === "cash" ? "Collected" : "Current", val: fmtVal(goal, current), cls: COLORS[goal.color]?.text ?? "text-blue-400" },
            { label: "Target", val: fmtVal(goal, target), cls: "text-zinc-200" },
            { label: "Remaining", val: fmtVal(goal, remaining), cls: "text-zinc-200" },
            { label: "On pace for", val: proj != null ? fmtValShort(goal, proj) : "—", cls: proj != null && proj >= target ? "text-emerald-400" : "text-amber-400" },
          ].map((t) => (
            <div key={t.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3">
              <p className={`font-bold text-lg ${t.cls}`}>{t.val}</p>
              <p className="text-zinc-500 text-[11px] uppercase tracking-wide mt-0.5">{t.label}</p>
            </div>
          ))}
        </div>

        {/* Update progress */}
        <div className="px-5 py-4 border-t border-zinc-800">
          <p className="text-zinc-400 text-xs uppercase tracking-wide mb-2">Log progress</p>
          {goal.source && (
            <p className="text-zinc-500 text-xs mb-3">
              {liveLoading ? "Syncing live Stripe total…" : SOURCE_LABEL[goal.source]}
              {goal.source && live[goal.source] != null && !liveLoading && (
                <> · <span className="text-zinc-300">{fmtCashExact(live[goal.source])}</span> auto-tracked</>
              )}
              {(goal.current_amount ?? 0) !== 0 && <> · <span className="text-zinc-300">{fmtCashExact(goal.current_amount)}</span> manual</>}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => bump(-(parseFloat(step) || 0))}
              className="w-11 h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-lg font-bold transition-colors">−</button>
            <input type="number" value={step} onChange={(e) => setStep(e.target.value)}
              className="flex-1 text-center bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
            <button onClick={() => bump(parseFloat(step) || 0)}
              className="w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-lg font-bold transition-colors">+</button>
          </div>
          <p className="text-zinc-600 text-[11px] mt-2">
            {goal.source ? "Adjusts the manual add on top of the live Stripe number." : `Adds to the current ${goal.goal_type === "cash" ? "cash" : noun || "count"} tally.`}
          </p>
        </div>

        {goal.notes && (
          <div className="px-5 py-4 border-t border-zinc-800">
            <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1.5">Notes</p>
            <p className="text-zinc-300 text-sm whitespace-pre-wrap">{goal.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Goal Card ──────────────────────────────────────────────────────────────

function GoalCard({ goal, live, onOpen, onPatch, onToggleFeature }: { goal: Goal; live: Record<string, number>; onOpen: () => void; onPatch: (id: string, patch: Partial<Goal>) => Promise<void>; onToggleFeature: (id: string, on: boolean) => void }) {
  const current = currentValue(goal, live);
  const target = goal.target_amount || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const status = computeStatus(goal, current);
  const st = STATUS[status];

  const liveBase = goal.source && live[goal.source] != null ? live[goal.source] : 0;
  const step = goal.goal_type === "cash" ? 100 : 1;
  const stepLabel = goal.goal_type === "cash" ? fmtCash(step) : String(step);
  // The field shows the actual number; editing sets it directly, +/− nudge it by one step.
  const [draft, setDraft] = useState<string | null>(null);
  const cancelRef = useRef(false); // set on Escape so the blur that follows won't commit
  const shownVal = draft ?? String(Math.round(current));
  const setActual = (n: number) => void onPatch(goal.id, { current_amount: Math.round((isNaN(n) ? current : n) - liveBase) });
  const commitDraft = () => {
    if (cancelRef.current) { cancelRef.current = false; setDraft(null); return; }
    if (draft != null) { const n = parseFloat(draft); if (!isNaN(n)) setActual(n); setDraft(null); }
  };

  return (
    <div className="relative bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 transition-colors">
      {/* Star — feature this goal at the top */}
      <button onClick={(e) => { e.stopPropagation(); onToggleFeature(goal.id, !goal.featured); }}
        title={goal.featured ? "Featured at the top — click to unstar" : "Star to feature at the top"}
        className={`absolute top-3 right-3 z-10 text-lg leading-none transition-colors ${goal.featured ? "text-amber-400" : "text-zinc-600 hover:text-amber-300"}`}>
        {goal.featured ? "★" : "☆"}
      </button>
      {/* Clickable info area — opens the drawer */}
      <button onClick={onOpen} className="w-full text-left">
        <div className="flex items-start gap-3.5">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${COLORS[goal.color]?.ring ?? COLORS.blue.ring}`}>
            {goal.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 pr-6">
              <p className="text-white font-semibold text-sm truncate">{goal.name}</p>
              <p className="text-white font-bold text-sm flex-shrink-0">{fmtValShort(goal, current)}</p>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${st.badge}`}>{st.label}</span>
                <span className="text-zinc-500 text-xs truncate">{periodDateLabel(goal)}</span>
              </div>
              <span className="text-zinc-500 text-xs flex-shrink-0">{pct.toFixed(0)}% of {fmtValShort(goal, target)}</span>
            </div>
            <div className="mt-2.5 h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r ${st.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </button>

      {/* Quick actual editor — shows the real number; type to set it, ± to nudge */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800/70">
        <span className="text-zinc-600 text-[11px] uppercase tracking-wide flex-shrink-0">Actual</span>
        <button onClick={() => setActual(current - step)} title={`Subtract ${stepLabel}`}
          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-base font-bold transition-colors flex-shrink-0">−</button>
        <div className="relative flex-1 min-w-0">
          {goal.goal_type === "cash" && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>}
          <input
            type="text"
            inputMode="decimal"
            value={shownVal}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
            onFocus={(e) => { setDraft(String(Math.round(current))); const el = e.currentTarget; requestAnimationFrame(() => el.select()); }}
            onBlur={commitDraft}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { cancelRef.current = true; e.currentTarget.blur(); } }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full text-center bg-zinc-950 border border-zinc-700 rounded-lg py-1.5 text-white text-sm font-semibold focus:outline-none focus:border-blue-500 ${goal.goal_type === "cash" ? "pl-5" : ""}`}
          />
        </div>
        <button onClick={() => setActual(current + step)} title={`Add ${stepLabel}`}
          className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors flex-shrink-0 flex items-center gap-1">+ {stepLabel}</button>
      </div>
    </div>
  );
}

// ─── Featured (starred) top tracker ──────────────────────────────────────────

function FeaturedHero({ goal, live, summary, liveLoading, onOpen }: {
  goal: Goal; live: Record<string, number>; summary: { achieved: number; onTrack: number; atRisk: number };
  liveLoading: boolean; onOpen: () => void;
}) {
  const current = currentValue(goal, live);
  const target = goal.target_amount || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const status = computeStatus(goal, current);
  const st = STATUS[status];
  return (
    <button onClick={onOpen} className="block w-full text-left bg-gradient-to-br from-zinc-900 to-zinc-900/40 border border-zinc-800 hover:border-zinc-700 rounded-3xl p-5 sm:p-6 transition-colors">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-zinc-500 text-xs uppercase tracking-wide flex items-center gap-1.5"><span className="text-amber-400">★</span> {goal.emoji} {goal.name}</p>
          <p className="text-white font-extrabold text-3xl sm:text-4xl tracking-tight mt-1">
            {fmtVal(goal, current)}
            <span className="text-zinc-600 font-semibold text-lg sm:text-xl"> / {fmtVal(goal, target)}</span>
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.badge}`}>{st.label}</span>
            <span className="text-zinc-500 text-xs">{periodDateLabel(goal)} · {pct.toFixed(0)}%</span>
          </div>
        </div>
        <div className="flex gap-2.5">
          {[
            { n: summary.achieved, label: "Achieved", cls: "text-emerald-400" },
            { n: summary.onTrack, label: "On track", cls: "text-blue-400" },
            { n: summary.atRisk, label: "At risk", cls: "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-2.5 text-center min-w-[84px]">
              <p className={`font-bold text-xl ${s.cls}`}>{s.n}</p>
              <p className="text-zinc-500 text-[10px] uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${st.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      {liveLoading && goal.source && <p className="text-zinc-600 text-xs mt-2">Syncing live Stripe total…</p>}
    </button>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<Record<string, number>>({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState<"new" | Goal | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    const res = await fetch("/api/goals");
    const data = await res.json();
    setGoals(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { void loadGoals(); }, [loadGoals]);

  // The distinct set of live sources in use — a stable string so the Stripe
  // fetch below only re-runs when the sources change, NOT on every number edit.
  const sourceKey = useMemo(
    () => Array.from(new Set(goals.map((g) => g.source).filter(Boolean))).sort().join(","),
    [goals]
  );

  // Pull live Stripe cash totals for any auto-tracked sources in use.
  useEffect(() => {
    const sources = sourceKey ? sourceKey.split(",") : [];
    const periods = Array.from(new Set(sources.map((s) => SOURCE_PERIOD[s]).filter(Boolean)));
    if (periods.length === 0) return;
    let cancelled = false;
    setLiveLoading(true);
    (async () => {
      const entries = await Promise.all(periods.map(async (p) => {
        try {
          const r = await fetch(`/api/stripe/revenue?period=${p}`);
          const d = await r.json();
          return [p, Number(d?.summary?.total) || 0] as const;
        } catch { return [p, 0] as const; }
      }));
      if (cancelled) return;
      const byPeriod = Object.fromEntries(entries);
      const bySource: Record<string, number> = {};
      for (const s of sources) bySource[s] = byPeriod[SOURCE_PERIOD[s]] ?? 0;
      setLive(bySource);
      setLiveLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sourceKey]);

  const patchGoal = useCallback(async (id: string, patch: Partial<Goal>) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    await fetch("/api/goals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
  }, []);

  // Star a goal to feature it at the top (only one at a time); unstar leaves none.
  const toggleFeature = useCallback(async (id: string, on: boolean) => {
    setGoals((prev) => prev.map((g) => ({ ...g, featured: on ? g.id === id : (g.id === id ? false : g.featured) })));
    await fetch("/api/goals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, featured: on }) });
  }, []);

  const saveGoal = useCallback(async (g: NewGoal, id?: string) => {
    if (id) {
      await fetch("/api/goals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...g }) });
    } else {
      await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(g) });
    }
    setModal(null);
    await loadGoals();
  }, [loadGoals]);

  const deleteGoal = useCallback(async (id: string) => {
    await fetch("/api/goals", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setModal(null);
    setOpenId(null);
    await loadGoals();
  }, [loadGoals]);

  // Categories present, for filter chips
  const presentCats = useMemo(() => {
    const set = new Set(goals.map((g) => g.category));
    return CATEGORIES.filter((c) => set.has(c.key));
  }, [goals]);

  const visible = useMemo(
    () => (filter === "all" ? goals : goals.filter((g) => g.category === filter)),
    [goals, filter]
  );

  // Summary across cash goals
  const summary = useMemo(() => {
    const cashGoals = goals.filter((g) => g.goal_type === "cash");
    const collected = cashGoals.reduce((s, g) => s + currentValue(g, live), 0);
    const target = cashGoals.reduce((s, g) => s + (g.target_amount || 0), 0);
    let onTrack = 0, atRisk = 0, achieved = 0;
    for (const g of goals) {
      const s = computeStatus(g, currentValue(g, live));
      if (s === "achieved") achieved++;
      else if (s === "ontrack") onTrack++;
      else atRisk++;
    }
    return { collected, target, onTrack, atRisk, achieved, pct: target > 0 ? Math.min(100, (collected / target) * 100) : 0 };
  }, [goals, live]);

  const openGoal = goals.find((g) => g.id === openId) ?? null;
  const featured = goals.find((g) => g.featured) ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Goals</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Targets for cash, sign-ups, tickets & more — tracked live.</p>
        </div>
        <button onClick={() => setModal("new")}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0">
          <span className="text-base leading-none">+</span> Add goal
        </button>
      </div>

      {/* Top tracker — the starred goal (falls back to the cash-toward-goals summary) */}
      {featured ? (
        <FeaturedHero goal={featured} live={live} summary={summary} liveLoading={liveLoading} onOpen={() => setOpenId(featured.id)} />
      ) : (
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-900/40 border border-zinc-800 rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wide">Cash toward goals</p>
              <p className="text-white font-extrabold text-3xl sm:text-4xl tracking-tight mt-1">
                {fmtCashExact(summary.collected)}
                <span className="text-zinc-600 font-semibold text-lg sm:text-xl"> / {fmtCash(summary.target)}</span>
              </p>
            </div>
            <div className="flex gap-2.5">
              {[
                { n: summary.achieved, label: "Achieved", cls: "text-emerald-400" },
                { n: summary.onTrack, label: "On track", cls: "text-blue-400" },
                { n: summary.atRisk, label: "At risk", cls: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-2.5 text-center min-w-[84px]">
                  <p className={`font-bold text-xl ${s.cls}`}>{s.n}</p>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500" style={{ width: `${summary.pct}%` }} />
          </div>
          {liveLoading && <p className="text-zinc-600 text-xs mt-2">Syncing live Stripe totals…</p>}
        </div>
      )}

      {/* Filter chips */}
      {presentCats.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {[{ key: "all", label: "All", emoji: "🏁" }, ...presentCats].map((c) => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${filter === c.key ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}>
              <span className="mr-1">{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>
      )}

      {/* Goal cards */}
      {loading ? (
        <div className="text-zinc-600 text-sm py-12 text-center">Loading goals…</div>
      ) : visible.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-3xl py-16 text-center">
          <p className="text-4xl mb-3">🏁</p>
          <p className="text-zinc-300 font-medium">No goals yet</p>
          <p className="text-zinc-600 text-sm mt-1">Add ticket sales, sign-ups, monthly or annual cash targets.</p>
          <button onClick={() => setModal("new")} className="mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors">+ Add your first goal</button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((g) => (
            <GoalCard key={g.id} goal={g} live={live} onOpen={() => setOpenId(g.id)} onPatch={patchGoal} onToggleFeature={toggleFeature} />
          ))}
        </div>
      )}

      {/* Drawer */}
      {openGoal && (
        <GoalDrawer
          goal={openGoal}
          live={live}
          liveLoading={liveLoading}
          onClose={() => setOpenId(null)}
          onEdit={() => { setModal(openGoal); setOpenId(null); }}
          onPatch={patchGoal}
        />
      )}

      {/* Modal */}
      {modal && (
        <GoalModal
          initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={saveGoal}
          onDelete={deleteGoal}
        />
      )}
    </div>
  );
}
