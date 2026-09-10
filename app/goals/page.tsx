"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PersonSelect } from "@/components/sub-tabs";
import { usePerson } from "@/lib/use-person";
import {
  AUTO_SOURCES, autoValue, buildGoalBoard, daysUntil, goalStatus, isAutoSource, mergeLiveYears,
  isoDaysFromNow, projectedTotal, sectionProgress,
  type GoalSection, type GoalSource, type GoalStatus, type LiveMonthly,
} from "@/lib/goal-board";

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
  owner: Owner;
  /** Does the number pile up through the period, or is it a level you hold? */
  track_mode: "accumulates" | "level";
  created_at: string;
  updated_at: string;
}

type NewGoal = Omit<Goal, "id" | "created_at" | "updated_at" | "archived" | "sort_order" | "featured">;

// Who's accountable. Same two people, same colours as Projects and Tasks, so a
// blue chip means Andrew everywhere in the app.
type Owner = "Andrew" | "Jameson";
const OWNERS: Owner[] = ["Andrew", "Jameson"];
const ownerEmoji = (o: string) => (o === "Jameson" ? "🧑" : "🧔");
const OWNER_STYLE: Record<Owner, { chip: string; dot: string }> = {
  Andrew: { chip: "bg-blue-500/15 text-blue-300 border-blue-500/30", dot: "bg-blue-400" },
  Jameson: { chip: "bg-violet-500/15 text-violet-300 border-violet-500/30", dot: "bg-violet-400" },
};

// ─── Constants ──────────────────────────────────────────────────────────────

const SOURCE_PERIOD: Record<string, string> = {
  cash_mtd: "mtd",
  cash_wtd: "wtd",
  cash_qtd: "qtd",
  cash_ytd: "ytd",
  cash_alltime: "alltime",
};

const SOURCE_LABEL: Record<string, string> = {
  stripe_cash: "Auto · cash collected in this goal's window",
  booked_calls: "Auto · sales calls booked in this goal's window",
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
  { key: "sales", label: "Sales", emoji: "🤝" },
  { key: "leads", label: "Leads", emoji: "🎯" },
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

/**
 * What the goal currently reads.
 *
 * `live` is keyed by goal id, not by source: each automated goal is resolved
 * once against its own window, so a reader here is a plain lookup and August's
 * goal and September's can both track "cash collected" without colliding.
 * A manual adjustment on top still counts, for money that never touched Stripe.
 */
function currentValue(g: Goal, live: Record<string, number>): number {
  return (live[g.id] ?? 0) + (g.current_amount ?? 0);
}

const computeStatus = (g: Goal, current: number): GoalStatus => goalStatus(g, current);
const projected = (g: Goal, current: number) => projectedTotal(g, current);

// ─── Shared controls ────────────────────────────────────────────────────────

/** Who's accountable — the same control the Projects board uses. */
function OwnerSelect({ value, onChange, className = "" }: { value: Owner; onChange: (v: Owner) => void; className?: string }) {
  const style = OWNER_STYLE[value] ?? OWNER_STYLE.Andrew;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Owner)}
      onClick={(e) => e.stopPropagation()}
      title="Who's responsible"
      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold focus:outline-none ${style.chip} ${className}`}
    >
      {OWNERS.map((o) => (
        <option key={o} value={o} className="bg-zinc-900 text-white">{ownerEmoji(o)} {o}</option>
      ))}
    </select>
  );
}

/** Where this goal's number comes from. Changing it is the whole automation UI. */
function SourceSelect({ value, onChange, className = "" }: { value: string | null; onChange: (v: GoalSource) => void; className?: string }) {
  const key: GoalSource = AUTO_SOURCES.some((s) => s.key === value) ? (value as GoalSource) : "manual";
  const auto = key !== "manual";
  return (
    <select
      value={key}
      onChange={(e) => onChange(e.target.value as GoalSource)}
      onClick={(e) => e.stopPropagation()}
      title={AUTO_SOURCES.find((s) => s.key === key)?.hint}
      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold focus:outline-none ${
        auto ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 bg-zinc-800/60 text-zinc-400"
      } ${className}`}
    >
      {AUTO_SOURCES.map((s) => (
        <option key={s.key} value={s.key} className="bg-zinc-900 text-white">{s.emoji} {s.label}</option>
      ))}
    </select>
  );
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
  const [owner, setOwner] = useState<Owner>(initial?.owner ?? "Andrew");
  const [trackMode, setTrackMode] = useState<"accumulates" | "level">(initial?.track_mode ?? "accumulates");

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
      source: source || null,
      color,
      notes: notes.trim() || null,
      owner,
      track_mode: trackMode,
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

          {/* Responsible */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Responsible</label>
            <div className="grid grid-cols-2 gap-2">
              {OWNERS.map((o) => (
                <button key={o} onClick={() => setOwner(o)}
                  className={`py-2 rounded-xl text-sm font-medium border transition-colors ${owner === o ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}>
                  {ownerEmoji(o)} {o}
                </button>
              ))}
            </div>
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

          {/* How the number behaves — this is what makes "on pace" meaningful */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">How it moves</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["accumulates", "📈 Adds up", "Cash collected, tickets sold"],
                ["level", "📊 A level", "Active MRR, headcount"],
              ] as const).map(([mode, label, hint]) => (
                <button key={mode} onClick={() => setTrackMode(mode)}
                  className={`rounded-xl border px-2 py-2 text-left transition-colors ${trackMode === mode ? "bg-blue-600/20 border-blue-500/40" : "bg-zinc-800 border-zinc-700 hover:border-zinc-600"}`}>
                  <span className={`block text-xs font-semibold ${trackMode === mode ? "text-blue-200" : "text-zinc-300"}`}>{label}</span>
                  <span className="block text-[10px] text-zinc-500 mt-0.5">{hint}</span>
                </button>
              ))}
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

          {/* Where the number comes from. An automated goal reads the window
              it is already set to — no second period to keep in sync. */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Tracking</label>
            <div className="grid grid-cols-3 gap-2">
              {AUTO_SOURCES.map((opt) => (
                <button key={opt.key} onClick={() => setSource(opt.key === "manual" ? "" : opt.key)}
                  className={`rounded-xl border px-2 py-2 text-left transition-colors ${
                    (source || "manual") === opt.key ? "bg-blue-600/20 border-blue-500/40" : "bg-zinc-800 border-zinc-700 hover:border-zinc-600"
                  }`}>
                  <span className={`block text-xs font-semibold ${(source || "manual") === opt.key ? "text-blue-200" : "text-zinc-300"}`}>
                    {opt.emoji} {opt.label}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-600">
              {AUTO_SOURCES.find((o) => o.key === (source || "manual"))?.hint}
            </p>
          </div>

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
              {liveLoading ? "Syncing live totals…" : SOURCE_LABEL[goal.source] ?? "Auto-tracked"}
              {live[goal.id] != null && !liveLoading && (
                <> · <span className="text-zinc-300">{fmtVal(goal, live[goal.id])}</span> auto-tracked</>
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

function GoalCard({ goal, live, onOpen, onPatch, onSetClosed }: { goal: Goal; live: Record<string, number>; onOpen: () => void; onPatch: (id: string, patch: Partial<Goal>) => Promise<void>; onSetClosed: (id: string, closed: boolean) => void }) {
  const current = currentValue(goal, live);
  const target = goal.target_amount || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const status = computeStatus(goal, current);
  const st = STATUS[status];

  const liveBase = live[goal.id] ?? 0;
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
    <div className="relative min-w-0 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 transition-colors">
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

      {/* Responsible + where this lands at today's rate */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <OwnerSelect value={goal.owner ?? "Andrew"} onChange={(v) => void onPatch(goal.id, { owner: v })} />
        <PaceNote goal={goal} current={current} />
        <button onClick={() => onSetClosed(goal.id, !goal.archived)}
          title={goal.archived ? "Put this back in play" : "Close it out — drops off the board, keeps the record"}
          className="ml-auto flex-shrink-0 rounded-lg border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200">
          {goal.archived ? "↩ Reopen" : "📦 Close out"}
        </button>
      </div>

      {/* Quick actual editor — shows the real number; type to set it, ± to nudge */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800/70">
        <span className="hidden sm:inline text-zinc-600 text-[11px] uppercase tracking-wide flex-shrink-0">Actual</span>
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

/**
 * "On pace for X" is the line that turns a progress bar into a decision — the
 * bar says where you are, this says where you land if nothing changes.
 */
function PaceNote({ goal, current }: { goal: Goal; current: number }) {
  const target = goal.target_amount || 0;
  const proj = projected(goal, current);
  if (target <= 0) return null;
  if (current >= target) {
    return <span className="text-[11px] font-medium text-emerald-400">✓ Hit {fmtValShort(goal, target)}</span>;
  }
  if (goal.target_date && daysUntil(goal.target_date) < 0) {
    const short = target - current;
    return <span className="text-[11px] text-rose-300">Closed {fmtValShort(goal, short)} short</span>;
  }
  if (goal.track_mode === "level") {
    const short = target - current;
    return (
      <span className="text-[11px] text-amber-300">
        {fmtValShort(goal, short)} below <span className="text-zinc-600">{fmtValShort(goal, target)}</span>
      </span>
    );
  }
  if (current <= 0) return <span className="text-[11px] text-zinc-600">Nothing logged yet</span>;
  if (proj == null) return <span className="text-[11px] text-zinc-600">Too early to call</span>;
  const ahead = proj >= target;
  return (
    <span className={`text-[11px] ${ahead ? "text-emerald-400" : "text-amber-300"}`}>
      On pace for {fmtValShort(goal, proj)}
      <span className="text-zinc-600"> · {ahead ? "clears" : `${fmtValShort(goal, target - proj)} short of`} {fmtValShort(goal, target)}</span>
    </span>
  );
}

// ─── Featured (starred) top tracker ──────────────────────────────────────────

function FeaturedHero({ goal, live, liveLoading, onOpen }: {
  goal: Goal; live: Record<string, number>;
  liveLoading: boolean; onOpen: () => void;
}) {
  const current = currentValue(goal, live);
  const target = goal.target_amount || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const status = computeStatus(goal, current);
  const st = STATUS[status];
  const proj = projected(goal, current);
  const paceLabel = proj == null ? "—" : fmtValShort(goal, proj);
  const paceClears = proj != null && proj >= target;
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
        {/* Where the year lands at today's rate — the only number the headline
            is missing, and the one that decides whether it needs attention. */}
        <div className="flex gap-2.5">
          {[
            { n: fmtValShort(goal, Math.max(0, target - current)), label: "Still to go", cls: "text-white" },
            { n: paceLabel, label: "On pace for", cls: paceClears ? "text-emerald-400" : "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-2.5 text-center min-w-[104px]">
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

// ─── Quick add ──────────────────────────────────────────────────────────────

/**
 * One line, four fields, Enter. The full modal is still there for colour,
 * notes and live Stripe tracking — this is for the goal you thought of just now.
 */
function QuickAddGoal({ defaultOwner, onAdd }: { defaultOwner: Owner; onAdd: (g: NewGoal) => Promise<void> }) {
  const [name, setName] = useState("");
  const [goalType, setGoalType] = useState<"cash" | "count">("cash");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [owner, setOwner] = useState<Owner>(defaultOwner);
  const [busy, setBusy] = useState(false);

  const ready = name.trim().length > 0 && parseFloat(target) > 0;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    await onAdd({
      name: name.trim(),
      emoji: goalType === "cash" ? "💰" : "🎯",
      goal_type: goalType,
      category: goalType === "cash" ? "revenue" : "other",
      target_amount: parseFloat(target) || 0,
      current_amount: 0,
      // A dated goal belongs to that month's block; an undated one is ongoing.
      period: date ? "monthly" : "monthly",
      target_date: date || null,
      source: null,
      color: goalType === "cash" ? "emerald" : "blue",
      notes: null,
      owner,
      track_mode: "accumulates",
    });
    setName(""); setTarget(""); setDate("");
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          placeholder="New goal — what are you going after?"
          className="min-w-[180px] flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1">
          {([["cash", "💵"], ["count", "🔢"]] as const).map(([t, icon]) => (
            <button key={t} onClick={() => setGoalType(t)} title={t === "cash" ? "Cash goal" : "Count goal"}
              className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${goalType === t ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-white"}`}>
              {icon}
            </button>
          ))}
        </div>
        <div className="relative w-28">
          {goalType === "cash" && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>}
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            inputMode="decimal"
            placeholder="Target"
            className={`w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 pr-2 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none ${goalType === "cash" ? "pl-6" : "pl-3"}`}
          />
        </div>
        <input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          title="Target date — this is what files it under a month"
          className="rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none"
        />
        <OwnerSelect value={owner} onChange={setOwner} className="py-2" />
        <button onClick={() => void submit()} disabled={!ready || busy}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40">
          {busy ? "…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ─── Goal spreadsheet ───────────────────────────────────────────────────────
// Rows arrive pre-sorted by urgency. Every field is editable in place, and an
// automated Actual is read-only on purpose — typing over a number that Stripe
// is about to overwrite is a lie waiting to happen.
function GoalSheet({ goals, live, onPatch, onSetSource, onOpen, onRemove, onSetClosed }: {
  goals: Goal[];
  live: Record<string, number>;
  onPatch: (id: string, patch: Partial<Goal>) => Promise<void>;
  onSetSource: (g: Goal, source: GoalSource) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onSetClosed: (id: string, closed: boolean) => void;
}) {
  const cell = "bg-transparent focus:bg-zinc-950 border border-transparent focus:border-blue-500/50 rounded-md px-2 py-1 text-sm focus:outline-none w-full transition-colors";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80 text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="w-12 px-2 py-2 font-semibold"></th>
              <th className="min-w-[260px] px-3 py-2 font-semibold">Goal</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Who</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Tracking</th>
              <th className="min-w-[110px] whitespace-nowrap px-3 py-2 text-right font-semibold">Actual</th>
              <th className="min-w-[110px] whitespace-nowrap px-3 py-2 text-right font-semibold">Target</th>
              <th className="min-w-[150px] px-3 py-2 font-semibold">Progress</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Due</th>
              <th className="w-16 px-2 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {goals.map((g, i) => (
              <GoalRow key={g.id} goal={g} live={live} zebra={i % 2 === 1} cell={cell}
                onPatch={onPatch} onSetSource={onSetSource} onOpen={onOpen}
                onRemove={onRemove} onSetClosed={onSetClosed} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GoalRow({ goal, live, zebra, cell, onPatch, onSetSource, onOpen, onRemove, onSetClosed }: {
  goal: Goal; live: Record<string, number>; zebra: boolean; cell: string;
  onPatch: (id: string, patch: Partial<Goal>) => Promise<void>;
  onSetSource: (g: Goal, source: GoalSource) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onSetClosed: (id: string, closed: boolean) => void;
}) {
  const current = currentValue(goal, live);
  const target = goal.target_amount || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const st = STATUS[computeStatus(goal, current)];
  const auto = isAutoSource(goal.source);
  const dl = goal.target_date ? daysUntil(goal.target_date) : null;
  const overdue = dl !== null && dl < 0 && current < target;
  const ow = OWNER_STYLE[goal.owner ?? "Andrew"] ?? OWNER_STYLE.Andrew;

  return (
    <tr className={`group border-b border-zinc-800/60 border-l-[3px] transition-colors hover:bg-zinc-800/30 ${zebra ? "bg-zinc-900/30" : ""} ${current >= target && target > 0 ? "opacity-60" : ""}`}
      style={{ borderLeftColor: ow.dot.includes("violet") ? "#a78bfa" : "#60a5fa" }}>
      <td className="px-2 py-1.5 align-middle">
        <input defaultValue={goal.emoji}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== goal.emoji) void onPatch(goal.id, { emoji: v }); }}
          className={`${cell} w-11 min-w-[2.75rem] text-center text-base`} />
      </td>
      <td className="px-1 py-1.5 align-middle">
        <div className="flex items-center gap-1.5">
          <input defaultValue={goal.name}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== goal.name) void onPatch(goal.id, { name: v }); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className={`${cell} font-semibold text-white`} />
          <button onClick={() => onOpen(goal.id)} title="Open details"
            className="flex-shrink-0 text-xs text-zinc-700 opacity-0 transition-opacity hover:text-blue-300 group-hover:opacity-100">↗</button>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-middle">
        <OwnerSelect value={goal.owner ?? "Andrew"} onChange={(v) => void onPatch(goal.id, { owner: v })} />
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-middle">
        <SourceSelect value={goal.source} onChange={(v) => onSetSource(goal, v)} />
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-middle">
        {auto ? (
          live[goal.id] == null ? (
            // A first load walks a year of Stripe; a skeleton reads as "coming"
            // where a bare "…" reads as "broken".
            <span className="ml-auto block h-4 w-16 animate-pulse rounded bg-zinc-800" title="Pulling the live number…" />
          ) : (
            <span className="font-bold tabular-nums text-emerald-300" title={SOURCE_LABEL[goal.source ?? ""] ?? "Auto-tracked"}>
              {fmtVal(goal, current)}
            </span>
          )
        ) : (
          <ActualCell goal={goal} current={current} onPatch={onPatch} />
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-middle">
        <input defaultValue={String(Math.round(target))} inputMode="decimal"
          onBlur={(e) => { const n = parseFloat(e.target.value.replace(/[^\d.]/g, "")); if (!isNaN(n) && n !== target) void onPatch(goal.id, { target_amount: n }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={`${cell} text-right tabular-nums text-zinc-300`} />
      </td>
      <td className="px-3 py-1.5 align-middle">
        <div className="flex items-center gap-2">
          <div className="h-1.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div className={`h-full rounded-full bg-gradient-to-r ${st.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
          <span className="w-9 flex-shrink-0 text-right text-[11px] tabular-nums text-zinc-400">{pct.toFixed(0)}%</span>
          <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${st.badge}`}>{st.label}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-middle">
        <div className="flex items-center gap-1.5">
          <input type="date" value={goal.target_date ?? ""}
            onChange={(e) => void onPatch(goal.id, { target_date: e.target.value || null })}
            className={`rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none ${overdue ? "text-rose-400" : "text-zinc-300"}`} />
          {dl !== null && current < target && (
            <span className={`text-[11px] ${overdue ? "font-semibold text-rose-400" : dl <= 3 ? "text-amber-300" : "text-zinc-600"}`}>
              {overdue ? `${Math.abs(dl)}d over` : dl === 0 ? "today" : `${dl}d`}
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 align-middle">
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => onSetClosed(goal.id, !goal.archived)}
            title={goal.archived ? "Put this back in play" : "Close it out — drops off the board, keeps the record"}
            className="text-sm text-zinc-600 transition-colors hover:text-emerald-300">
            {goal.archived ? "↩" : "📦"}
          </button>
          <button onClick={() => onRemove(goal.id)} title="Delete goal"
            className="text-sm text-zinc-600 transition-colors hover:text-rose-400">✕</button>
        </div>
      </td>
    </tr>
  );
}

/** A manual number, typed straight into the sheet. */
function ActualCell({ goal, current, onPatch }: { goal: Goal; current: number; onPatch: (id: string, patch: Partial<Goal>) => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const commit = () => {
    if (cancelRef.current) { cancelRef.current = false; setDraft(null); return; }
    if (draft != null) {
      const n = parseFloat(draft);
      if (!isNaN(n)) void onPatch(goal.id, { current_amount: Math.round(n) });
      setDraft(null);
    }
  };
  return (
    <input
      type="text" inputMode="decimal"
      value={draft ?? String(Math.round(current))}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
      onFocus={(e) => { setDraft(String(Math.round(current))); const el = e.currentTarget; requestAnimationFrame(() => el.select()); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { cancelRef.current = true; e.currentTarget.blur(); } }}
      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-right text-sm font-bold tabular-nums text-white transition-colors focus:border-blue-500/50 focus:bg-zinc-950 focus:outline-none"
    />
  );
}

// ─── Board section ──────────────────────────────────────────────────────────

const TONE: Record<GoalSection<Goal>["tone"], { title: string; pill: string; rule: string; bar: string }> = {
  rose: { title: "text-rose-300", pill: "border-rose-500/30 bg-rose-500/10 text-rose-300", rule: "bg-rose-500/20", bar: "from-rose-500 to-rose-400" },
  amber: { title: "text-amber-300", pill: "border-amber-500/30 bg-amber-500/10 text-amber-300", rule: "bg-amber-500/20", bar: "from-amber-500 to-yellow-400" },
  zinc: { title: "text-zinc-300", pill: "border-zinc-700 bg-zinc-900 text-zinc-400", rule: "bg-zinc-800", bar: "from-blue-500 to-violet-500" },
};

/**
 * A month heading that carries its own scoreboard: how many goals, how many
 * landed, and one bar for the block. It's the thing that makes the board
 * readable at arm's length — you see the month's shape before any single goal.
 */
function SectionHeader({ section, live, action }: { section: GoalSection<Goal>; live: Record<string, number>; action?: React.ReactNode }) {
  const t = TONE[section.tone];
  const { pct, complete } = sectionProgress(
    section.items,
    (g) => currentValue(g, live),
    (g) => g.target_amount || 0,
  );
  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-2.5">
        <h2 className={`text-sm font-bold ${t.title}`}>{section.emoji} {section.label}</h2>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${t.pill}`}>{section.items.length}</span>
        <div className={`h-px flex-1 ${t.rule}`} />
        {action}
        <span className="flex-shrink-0 text-[11px] tabular-nums text-zinc-500">
          {complete}/{section.items.length} hit · <span className="font-bold text-zinc-300">{Math.round(pct)}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/70">
        <div className={`h-full rounded-full bg-gradient-to-r ${t.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
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
  const [showAchieved, setShowAchieved] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [view, setView] = useState<"sheet" | "grid">("sheet");
  const [person] = usePerson();

  const loadGoals = useCallback(async () => {
    const res = await fetch("/api/goals?include=closed");
    const data = await res.json();
    setGoals(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { void loadGoals(); }, [loadGoals]);

  // A stable key over what actually drives the fetch — which years and which
  // legacy periods are in play. Editing a number must not refetch Stripe; that
  // is what used to make the goal fields jump while you typed in them.
  const liveKey = useMemo(() => {
    const years = new Set<number>();
    const legacy = new Set<string>();
    for (const g of goals) {
      if (!isAutoSource(g.source)) continue;
      if (g.source === "stripe_cash" || g.source === "booked_calls") {
        const anchor = g.target_date ? new Date(`${g.target_date}T12:00:00`) : new Date();
        years.add(anchor.getFullYear());
      } else if (g.source) {
        legacy.add(g.source);
      }
    }
    return JSON.stringify({ years: [...years].sort(), legacy: [...legacy].sort() });
  }, [goals]);

  // Pull the months each automated goal needs, then resolve one number per goal.
  useEffect(() => {
    const { years, legacy } = JSON.parse(liveKey) as { years: number[]; legacy: string[] };
    if (years.length === 0 && legacy.length === 0) { setLive({}); return; }
    let cancelled = false;
    setLiveLoading(true);
    (async () => {
      const [monthlyByYear, legacyEntries] = await Promise.all([
        Promise.all(years.map(async (y) => {
          try {
            const r = await fetch(`/api/goals/live?year=${y}`);
            return (await r.json()) as LiveMonthly;
          } catch { return { cashByMonth: {}, callsByMonth: {} }; }
        })),
        Promise.all(legacy.map(async (source) => {
          const period = SOURCE_PERIOD[source];
          try {
            const r = await fetch(`/api/stripe/revenue?period=${period}`);
            const d = await r.json();
            return [source, Number(d?.summary?.total) || 0] as const;
          } catch { return [source, 0] as const; }
        })),
      ]);
      if (cancelled) return;

      const merged = mergeLiveYears(monthlyByYear);
      const legacyByPeriod = Object.fromEntries(legacyEntries);

      const byGoal: Record<string, number> = {};
      for (const g of goals) {
        const v = autoValue(g, merged, legacyByPeriod);
        if (v !== null) byGoal[g.id] = v;
      }
      setLive(byGoal);
      setLiveLoading(false);
    })();
    return () => { cancelled = true; };
    // `goals` is read to map ids onto values; liveKey is what decides a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  const patchGoal = useCallback(async (id: string, patch: Partial<Goal>) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    await fetch("/api/goals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
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
    const set = new Set(goals.filter((g) => !g.archived).map((g) => g.category));
    return CATEGORIES.filter((c) => set.has(c.key));
  }, [goals]);

  const visible = useMemo(
    () => goals.filter((g) =>
      (filter === "all" || g.category === filter) &&
      (person === "all" || (g.owner ?? "Andrew") === person)
    ),
    [goals, filter, person]
  );

  // ── The board's spine ─────────────────────────────────────────────────────
  // Same shape as the Projects board: what needs you now up top, then the
  // months ahead, with everything you have already hit dropping out of the flow.
  const statusOf = useCallback((g: Goal) => computeStatus(g, currentValue(g, live)), [live]);
  const today = useMemo(() => isoDaysFromNow(0), []);
  const in7 = useMemo(() => isoDaysFromNow(7), []);

  // The year's number is the headline, not a row in December. It comes out of
  // the month blocks and sits above them.
  const inPlay = useMemo(() => visible.filter((g) => !g.archived), [visible]);
  const annual = useMemo(() => inPlay.filter((g) => g.period === "annual"), [inPlay]);
  const monthly = useMemo(() => visible.filter((g) => g.period !== "annual" || g.archived), [visible]);

  const { sections, achievedItems, closedItems, counts } = useMemo(
    () => buildGoalBoard(monthly, statusOf, today, in7),
    [monthly, statusOf, today, in7],
  );


  const openGoal = goals.find((g) => g.id === openId) ?? null;

  const addGoal = useCallback(async (g: NewGoal) => {
    await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(g) });
    await loadGoals();
  }, [loadGoals]);

  // Switching a goal to an automated source clears the number that was typed
  // in by hand — otherwise the old figure is silently added to the live one and
  // September reads $28K instead of $17K.
  const setClosed = useCallback((id: string, closed: boolean) => {
    void patchGoal(id, { archived: closed });
  }, [patchGoal]);

  const setSource = useCallback((g: Goal, source: GoalSource) => {
    const next = source === "manual" ? null : source;
    const patch: Partial<Goal> = { source: next };
    if (next && (g.current_amount ?? 0) !== 0) patch.current_amount = 0;
    void patchGoal(g.id, patch);
  }, [patchGoal]);

  const renderCards = (items: Goal[]) =>
    view === "sheet" ? (
      <GoalSheet goals={items} live={live} onPatch={patchGoal} onSetSource={setSource}
        onOpen={setOpenId} onRemove={deleteGoal} onSetClosed={setClosed} />
    ) : (
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((g) => (
          <GoalCard key={g.id} goal={g} live={live} onOpen={() => setOpenId(g.id)} onPatch={patchGoal}
            onSetClosed={setClosed} />
        ))}
      </div>
    );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">🏁 Goals</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            What needs you first, up top. {counts.open} in play · {counts.achieved} hit
            {liveLoading && <span className="ml-2 text-emerald-400/80">· pulling live numbers…</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
            {([["sheet", "▦ Sheet"], ["grid", "🗂️ Cards"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${view === k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>{l}</button>
            ))}
          </div>
          <PersonSelect />
          <button onClick={() => setModal("new")}
            className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500">
            <span className="text-base leading-none">+</span> Add goal
          </button>
        </div>
      </div>

      {/* Focus strip — the whole board in four numbers */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { n: counts.behind, label: "Past due", cls: counts.behind > 0 ? "text-rose-400" : "text-zinc-600" },
          { n: counts.week, label: "Due this week", cls: counts.week > 0 ? "text-amber-400" : "text-zinc-600" },
          { n: counts.open, label: "In play", cls: "text-blue-400" },
          { n: counts.achieved, label: "Achieved", cls: "text-emerald-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2.5">
            <p className={`text-xl font-bold tabular-nums ${stat.cls}`}>{stat.n}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* The year — the headline number, above everything it rolls up from */}
      {annual.map((g) => (
        <FeaturedHero key={g.id} goal={g} live={live} liveLoading={liveLoading} onOpen={() => setOpenId(g.id)} />
      ))}

      {/* Category chips */}
      {presentCats.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ key: "all", label: "All", emoji: "🏁" }, ...presentCats].map((c) => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${filter === c.key ? "border-blue-500/40 bg-blue-600/20 text-blue-200" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"}`}>
              <span className="mr-1">{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>
      )}

      <QuickAddGoal key={person} defaultOwner={person === "all" ? "Andrew" : person} onAdd={addGoal} />

      {/* The board */}
      {loading ? (
        <p className="animate-pulse py-16 text-center text-zinc-600">Loading goals…</p>
      ) : goals.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-800 py-16 text-center">
          <p className="mb-3 text-4xl">🏁</p>
          <p className="font-medium text-zinc-300">No goals yet</p>
          <p className="mt-1 text-sm text-zinc-600">Name one above and give it a target — that is the whole setup.</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-zinc-600">
          Nothing here for {person === "all" ? "this filter" : person}. Add one above ↑
        </p>
      ) : (
        <div className="space-y-7">
          {sections.length === 0 && counts.achieved > 0 && (
            <p className="py-10 text-center text-zinc-600">🎉 Every goal in play has landed.</p>
          )}
          {sections.length === 0 && counts.achieved === 0 && closedItems.length > 0 && (
            <p className="py-10 text-center text-zinc-600">Nothing in play — everything is closed out below.</p>
          )}
          {sections.map((sec) => (
            <section key={sec.key}>
              <SectionHeader section={sec} live={live}
                action={sec.key === "missed" ? (
                  <button
                    onClick={() => { for (const g of sec.items) setClosed(g.id, true); }}
                    title="Move every past-due goal into Closed out"
                    className="flex-shrink-0 rounded-lg border border-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
                  >
                    📦 Close out all {sec.items.length}
                  </button>
                ) : null} />
              {renderCards(sec.items)}
            </section>
          ))}

          {/* Achieved — out of the way, one click to check */}
          {achievedItems.length > 0 && (
            <section>
              <button onClick={() => setShowAchieved((v) => !v)} className="group mb-2.5 flex w-full items-center gap-2.5 text-left">
                <h2 className="text-sm font-bold text-zinc-500 transition-colors group-hover:text-zinc-300">
                  {showAchieved ? "▾" : "▸"} ✅ Achieved
                </h2>
                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-500">{achievedItems.length}</span>
                <div className="h-px flex-1 bg-zinc-800/70" />
              </button>
              {showAchieved && <div className="opacity-75">{renderCards(achievedItems)}</div>}
            </section>
          )}

          {/* Closed out — kept, not deleted, and one click from coming back */}
          {closedItems.length > 0 && (
            <section>
              <button onClick={() => setShowClosed((v) => !v)} className="group mb-2.5 flex w-full items-center gap-2.5 text-left">
                <h2 className="text-sm font-bold text-zinc-500 transition-colors group-hover:text-zinc-300">
                  {showClosed ? "▾" : "▸"} 📦 Closed out
                </h2>
                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-500">{closedItems.length}</span>
                <div className="h-px flex-1 bg-zinc-800/70" />
                <span className="flex-shrink-0 text-[11px] text-zinc-600">not counted anywhere</span>
              </button>
              {showClosed && <div className="opacity-60">{renderCards(closedItems)}</div>}
            </section>
          )}
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
