"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatExact } from "@/lib/utils";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FINANCE_TABS, isFinanceTab,
  type ChartBar, type FinanceTab, type GhlSearchContact,
  type ManualPayment, type PersonPanelState, type PreviousSummary,
  type RevenueSummary, type SubData, type Subscription, type Transaction,
} from "./finance-types";
import {
  DashboardTab, LowTicketTab, MrrTab, RecentSalesTab,
  type FinanceData, type FinanceHandlers,
} from "./finance-tabs";

const PERIODS = [
  { key: "mtd",     label: "MTD" },
  { key: "wtd",     label: "WTD" },
  { key: "qtd",     label: "QTD" },
  { key: "ytd",     label: "YTD" },
  { key: "alltime", label: "All Time" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T12:00:00"); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function DueBadge({ dateStr }: { dateStr: string }) {
  const d = daysUntil(dateStr);
  const label = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `Due in ${d}d`;
  const cls = d < 0
    ? "bg-red-500/20 text-red-400 border-red-500/30"
    : d <= 3
    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
    : "bg-blue-500/10 text-blue-400 border-blue-500/20";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}

// ─── GHL Contact Search ───────────────────────────────────────────────────────

function GhlContactSearch({ onSelect }: { onSelect: (c: GhlSearchContact) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GhlSearchContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ghl/contacts?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.contacts ?? []);
        setOpen(true);
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function pick(c: GhlSearchContact) {
    onSelect(c);
    setQuery(c.name ?? "");
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="relative">
      <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">
        Link GHL Contact <span className="text-zinc-600 font-normal normal-case">(search by name)</span>
      </label>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a name to search GHL…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 pr-8"
        />
        {loading && <div className="absolute right-3 top-3 w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c)}
              className="w-full px-3 py-2.5 text-left hover:bg-zinc-700 transition-colors border-b border-zinc-700/50 last:border-0"
            >
              <p className="text-white text-sm font-medium">{c.name ?? "—"}</p>
              <p className="text-zinc-500 text-xs">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && !loading && query.length >= 2 && (
        <div className="absolute z-20 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-500 text-xs shadow-xl">
          No GHL contacts found
        </div>
      )}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function QuickAddPromiseModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (records: Omit<ManualPayment, "id" | "created_at">[]) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [offer, setOffer] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSave() {
    if (!name.trim() || !amount || !dueDate) return;
    setSaving(true);
    await onSave([{
      name: name.trim(),
      amount: parseFloat(amount),
      payment_type: "one_off",
      status: "scheduled",
      payment_date: dueDate,
      source: "Other",
      offer: offer.trim() || null,
      notes: notes.trim() || null,
      phone: phone.trim() || null,
      email: null,
      ghl_contact_id: null,
      ghl_url: null,
      interval_type: null,
      billing_day: null,
      start_date: null,
      next_bill_date: null,
    }]);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-base">📅 Log a Promise</h3>
            <p className="text-zinc-500 text-xs mt-0.5">Someone committed to pay — log it here</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-zinc-400 text-xs font-medium block mb-1">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-7 pr-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
                />
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1">Due Date *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          <div>
            <label className="text-zinc-400 text-xs font-medium block mb-1">Offer / Program</label>
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="e.g. 7FC Boardroom"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs font-medium block mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs font-medium block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context on the commitment..."
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 resize-none"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !amount || !dueDate}
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold rounded-xl transition-colors text-sm"
        >
          {saving ? "Saving…" : "📅 Log Promise"}
        </button>
      </div>
    </div>
  );
}

// ─── Add Payment Modal ────────────────────────────────────────────────────────

const SOURCES = ["Stripe", "Fanbasis", "Skool", "PayPal", "Venmo", "Zelle", "Wire", "Cash", "Other"] as const;
const INTERVAL_OPTIONS = ["monthly", "weekly", "quarterly", "annual"] as const;

function nextBillDateFromDay(billingDay: number, startDate: string): string {
  const today = new Date();
  const start = new Date(startDate);
  const base = today > start ? today : start;
  const d = new Date(base.getFullYear(), base.getMonth(), billingDay);
  if (d <= today) d.setMonth(d.getMonth() + 1);
  return d.toISOString().split("T")[0];
}

function AddPaymentModal({
  onClose, onSave,
  prefillName, prefillPhone, prefillEmail, prefillGhlContactId, prefillGhlUrl,
}: {
  onClose: () => void;
  onSave: (records: Omit<ManualPayment, "id" | "created_at">[]) => Promise<void>;
  prefillName?: string;
  prefillPhone?: string | null;
  prefillEmail?: string | null;
  prefillGhlContactId?: string | null;
  prefillGhlUrl?: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const [paymentType, setPaymentType] = useState<"one_off" | "recurring">("one_off");
  const [name, setName] = useState(prefillName ?? "");
  const [source, setSource] = useState<string>("Stripe");
  const [offer, setOffer] = useState("");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(prefillPhone ?? "");
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [ghlContactId, setGhlContactId] = useState(prefillGhlContactId ?? "");
  const [ghlUrl, setGhlUrl] = useState(prefillGhlUrl ?? "");
  const [notes, setNotes] = useState("");
  // One-off
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  // Down payment / balance
  const [hasBalance, setHasBalance] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceDueDate, setBalanceDueDate] = useState("");
  // Recurring
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [billingDay, setBillingDay] = useState("1");
  const [intervalType, setIntervalType] = useState("monthly");

  async function handleSave() {
    if (!name.trim() || !amount) return;
    setSaving(true);

    const base = {
      name: name.trim(),
      source,
      offer: offer.trim() || null,
      notes: notes.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      ghl_contact_id: ghlContactId.trim() || null,
      ghl_url: ghlUrl.trim() || null,
    };

    const records: Omit<ManualPayment, "id" | "created_at">[] = [];

    if (paymentType === "one_off") {
      records.push({
        ...base,
        amount: parseFloat(amount),
        payment_type: "one_off",
        payment_date: paymentDate,
        interval_type: null, billing_day: null, start_date: null, next_bill_date: null,
        status: "collected",
      });
      if (hasBalance && balanceAmount && balanceDueDate) {
        records.push({
          ...base,
          name: `${name.trim()} — Balance Due`,
          amount: parseFloat(balanceAmount),
          payment_type: "one_off",
          payment_date: balanceDueDate,
          interval_type: null, billing_day: null, start_date: null, next_bill_date: null,
          status: "scheduled",
        });
      }
    } else {
      records.push({
        ...base,
        amount: parseFloat(amount),
        payment_type: "recurring",
        payment_date: null,
        interval_type: intervalType,
        billing_day: parseInt(billingDay),
        start_date: startDate,
        next_bill_date: nextBillDateFromDay(parseInt(billingDay), startDate),
        status: "active",
      });
    }

    await onSave(records);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5">
          <h3 className="text-white font-bold text-base">+ Add Payment</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="px-5 space-y-4">
          {/* Payment Type toggle */}
          <div className="flex gap-2 bg-zinc-800 rounded-xl p-1">
            {(["one_off", "recurring"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPaymentType(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  paymentType === t ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {t === "one_off" ? "💸 One-Off" : "🔁 Recurring"}
              </button>
            ))}
          </div>

          {/* GHL contact search */}
          {!prefillName && (
            <GhlContactSearch onSelect={(c) => {
              if (c.name) setName(c.name);
              if (c.phone) setPhone(c.phone);
              if (c.email) setEmail(c.email);
              setGhlContactId(c.id);
              setGhlUrl(c.ghlUrl);
            }} />
          )}

          {/* Name */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Label / Description *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={paymentType === "recurring" ? "e.g. Skool Revenue Share" : "e.g. Katie — BOARDROOM"}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Source + Amount side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Source *</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">{paymentType === "one_off" && hasBalance ? "Down Payment ($) *" : "Amount ($) *"}</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* One-off: payment date */}
          {paymentType === "one_off" && (
            <>
              <div>
                <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">{hasBalance ? "Down Payment Date" : "Payment Date"}</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Balance due toggle */}
              <button
                onClick={() => { setHasBalance(!hasBalance); if (hasBalance) { setBalanceAmount(""); setBalanceDueDate(""); } }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  hasBalance
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
                }`}
              >
                <span className="text-base">{hasBalance ? "✅" : "+"}</span>
                {hasBalance ? "Balance due added" : "Add balance due (down payment)"}
              </button>

              {/* Balance fields */}
              {hasBalance && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-3">
                  <p className="text-amber-300 text-xs font-semibold uppercase tracking-wide">Balance Due</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-zinc-400 text-xs block mb-1">Amount ($)</label>
                      <input
                        type="number"
                        value={balanceAmount}
                        onChange={(e) => setBalanceAmount(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 text-xs block mb-1">Due Date</label>
                      <input
                        type="date"
                        value={balanceDueDate}
                        onChange={(e) => setBalanceDueDate(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  {amount && balanceAmount && (
                    <p className="text-zinc-500 text-xs">
                      Total deal: <span className="text-white font-semibold">${(parseFloat(amount || "0") + parseFloat(balanceAmount || "0")).toLocaleString()}</span>
                      {" "}(${parseFloat(amount || "0").toLocaleString()} now + ${parseFloat(balanceAmount || "0").toLocaleString()} due {balanceDueDate || "TBD"})
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Recurring fields */}
          {paymentType === "recurring" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Interval</label>
                  <select
                    value={intervalType}
                    onChange={(e) => setIntervalType(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    {INTERVAL_OPTIONS.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Billing Day (of month)</label>
                  <input
                    type="number"
                    value={billingDay}
                    onChange={(e) => setBillingDay(e.target.value)}
                    min="1"
                    max="31"
                    placeholder="1"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              {billingDay && startDate && (
                <p className="text-zinc-500 text-xs">
                  Next bill: <span className="text-zinc-300">{nextBillDateFromDay(parseInt(billingDay || "1"), startDate)}</span>
                  {" "}· Counts <span className="text-emerald-400 font-medium">${parseFloat(amount || "0").toLocaleString()}/mo</span> toward MRR
                </p>
              )}
            </>
          )}

          {/* Offer (optional) */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Offer / Product <span className="text-zinc-600 font-normal normal-case">(optional)</span></label>
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="e.g. BOARDROOM, Fanbasis Membership"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Phone + Email (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Phone <span className="text-zinc-600 font-normal normal-case">(optional)</span></label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Email <span className="text-zinc-600 font-normal normal-case">(optional)</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Notes (optional) */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Notes <span className="text-zinc-600 font-normal normal-case">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any context…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-zinc-700 rounded-xl text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !name.trim() || !amount}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-white text-sm font-bold transition-colors"
          >
            {saving ? "Saving…" : paymentType === "one_off" ? (hasBalance ? "Log Down Payment + Balance" : "Log Payment") : "Add Subscription"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manual Payment Card ──────────────────────────────────────────────────────

// ─── Contact Action Buttons ───────────────────────────────────────────────────

function ContactActions({ phone, email, size = "md" }: { phone?: string | null; email?: string | null; size?: "sm" | "md" }) {
  if (!phone && !email) return null;
  const btn = size === "sm"
    ? "p-1.5 rounded-lg text-xs transition-colors"
    : "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors";

  const gmailUrl = email
    ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}`
    : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {phone && (
        <>
          <a href={`tel:${phone}`} className={`${btn} bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30`}>
            {size === "md" && "📞 "}Call
          </a>
          <a href={`sms:${phone}`} className={`${btn} bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30`}>
            {size === "md" && "💬 "}Text
          </a>
        </>
      )}
      {email && (
        <>
          <a href={`mailto:${email}`} className={`${btn} bg-zinc-700/40 hover:bg-zinc-700/70 text-zinc-300 border border-zinc-600/40`}>
            {size === "md" && "✉️ "}Email
          </a>
          {gmailUrl && (
            <a href={gmailUrl} target="_blank" rel="noreferrer" className={`${btn} bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30`}>
              {size === "md" ? "Gmail" : "G"}
            </a>
          )}
        </>
      )}
    </div>
  );
}

// ─── Person Panel ─────────────────────────────────────────────────────────────

function PersonPanel({
  person,
  manualPayments,
  stripeTx,
  stripeSubscriptions,
  onClose,
  onEditPayment,
  onTogglePayment,
  onAddPaymentForPerson,
  togglingManualId,
}: {
  person: PersonPanelState;
  manualPayments: ManualPayment[];
  stripeTx: Transaction[];
  stripeSubscriptions: Subscription[];
  onClose: () => void;
  onEditPayment: (p: ManualPayment) => void;
  onTogglePayment: (p: ManualPayment) => void;
  onAddPaymentForPerson: (name: string, phone: string | null, email: string | null, ghlContactId: string | null, ghlUrl: string | null) => void;
  togglingManualId: string | null;
}) {
  const nameNorm = person.name.toLowerCase();

  // All manual payments for this person
  const myManual = manualPayments.filter((p) =>
    (person.ghlContactId && p.ghl_contact_id === person.ghlContactId) ||
    (person.email && p.email === person.email) ||
    p.name.toLowerCase() === nameNorm
  );

  // Stripe data for this person
  const myTx = stripeTx.filter((t) =>
    (person.email && t.email === person.email) ||
    t.name.toLowerCase() === nameNorm
  );
  const mySubs = stripeSubscriptions.filter((s) =>
    (person.email && s.email === person.email) ||
    s.name.toLowerCase() === nameNorm
  );

  const upcoming = myManual.filter((p) => p.status === "scheduled").sort((a, b) =>
    (a.payment_date ?? "").localeCompare(b.payment_date ?? "")
  );
  const history = myManual.filter((p) => p.status !== "scheduled");
  const totalPaid = [...myTx, ...history.filter(p => p.status === "collected" || p.status === "active")]
    .reduce((s, p) => s + p.amount, 0);
  const totalUpcoming = upcoming.reduce((s, p) => s + p.amount, 0);

  const phone = person.phone;
  const phoneDigits = phone?.replace(/\D/g, "");
  const email = person.email;
  const gmailUrl = email ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}` : null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />
      <div
        className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 flex flex-col h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b border-zinc-800">
          {/* Avatar + close */}
          <div className="flex items-start justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                {person.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-white font-bold text-base leading-tight">{person.name}</h2>
                {email && <p className="text-zinc-500 text-xs mt-0.5">{email}</p>}
              </div>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors mt-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Quick actions */}
          <div className="px-5 pb-4 flex flex-wrap gap-2">
            {phone && (
              <>
                <a href={`tel:${phone}`} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-400 rounded-xl text-xs font-semibold transition-colors">📞 Call</a>
                <a href={`sms:${phone}`} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-400 rounded-xl text-xs font-semibold transition-colors">💬 Text</a>
                {phoneDigits && <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-400 rounded-xl text-xs font-semibold transition-colors">WhatsApp</a>}
              </>
            )}
            {email && (
              <>
                <a href={`mailto:${email}`} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-700/40 hover:bg-zinc-700 border border-zinc-600/40 text-zinc-300 rounded-xl text-xs font-semibold transition-colors">✉️ Email</a>
                {gmailUrl && <a href={gmailUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-600/30 text-red-400 rounded-xl text-xs font-semibold transition-colors">Gmail</a>}
              </>
            )}
            {person.ghlUrl && (
              <a href={person.ghlUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-400 rounded-xl text-xs font-semibold transition-colors">⚡ GHL</a>
            )}
          </div>

          {/* Revenue summary pills */}
          <div className="px-5 pb-4 flex gap-3">
            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-center">
              <p className="text-emerald-400 font-bold text-sm">${totalPaid.toLocaleString()}</p>
              <p className="text-zinc-600 text-[10px] uppercase tracking-wide">Collected</p>
            </div>
            {totalUpcoming > 0 && (
              <div className="flex-1 bg-zinc-900 border border-amber-900/30 rounded-xl px-3 py-2 text-center">
                <p className="text-amber-400 font-bold text-sm">${totalUpcoming.toLocaleString()}</p>
                <p className="text-zinc-600 text-[10px] uppercase tracking-wide">Upcoming</p>
              </div>
            )}
            {mySubs.length > 0 && (
              <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-center">
                <p className="text-violet-400 font-bold text-sm">${mySubs[0].monthlyAmount}/mo</p>
                <p className="text-zinc-600 text-[10px] uppercase tracking-wide">MRR</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Stripe subscription */}
          {mySubs.map((sub) => (
            <div key={sub.id} className="bg-zinc-900 border border-emerald-900/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-sm">🔁 {sub.offer}</p>
                  <p className="text-zinc-500 text-xs">via Stripe · {sub.interval}</p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-400 font-bold text-sm">${formatExact(sub.amount)}/mo</p>
                  <p className={`text-xs mt-0.5 ${sub.status === "paused" ? "text-amber-400" : "text-zinc-500"}`}>
                    {sub.status === "paused" ? "Paused" : `Next ${sub.nextBill}`}
                  </p>
                </div>
              </div>
              <p className="text-zinc-600 text-xs">Started {sub.startDate}</p>
            </div>
          ))}

          {/* Upcoming (scheduled) payments */}
          {upcoming.length > 0 && (
            <div>
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">📅 Upcoming</p>
              <div className="space-y-2">
                {upcoming.map((p) => (
                  <div key={p.id} className="bg-zinc-900 border border-amber-900/30 rounded-2xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {p.payment_date && <DueBadge dateStr={p.payment_date} />}
                          <span className="text-zinc-600 text-xs">{p.source}</span>
                        </div>
                      </div>
                      <p className="text-amber-400 font-bold text-sm flex-shrink-0">${p.amount.toLocaleString()}</p>
                    </div>
                    {p.notes && <p className="text-zinc-600 text-xs italic">{p.notes}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => onTogglePayment(p)}
                        disabled={togglingManualId === p.id}
                        className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg text-xs transition-colors disabled:opacity-50"
                      >
                        {togglingManualId === p.id ? "…" : "✓ Mark Collected"}
                      </button>
                      <button onClick={() => onEditPayment(p)} className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30 rounded-lg text-xs transition-colors">✏️ Edit</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual payment history */}
          {history.length > 0 && (
            <div>
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">🏦 Manual Payments</p>
              <div className="space-y-2">
                {history.map((p) => (
                  <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{p.name}</p>
                        <p className="text-zinc-600 text-xs">{p.source} · {p.payment_type === "recurring" ? `${p.interval_type} · next ${p.next_bill_date ?? "—"}` : (p.payment_date ?? "one-off")}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold text-sm ${p.payment_type === "recurring" ? "text-emerald-400" : "text-white"}`}>${p.amount.toLocaleString()}</p>
                        {p.payment_type === "recurring" && <p className="text-zinc-600 text-xs">/mo</p>}
                      </div>
                    </div>
                    {p.notes && <p className="text-zinc-600 text-xs italic">{p.notes}</p>}
                    <button onClick={() => onEditPayment(p)} className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30 rounded-lg text-xs transition-colors">✏️ Edit</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stripe transaction history */}
          {myTx.length > 0 && (
            <div>
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">💳 Stripe History</p>
              <div className="space-y-2">
                {myTx.map((tx) => (
                  <div key={tx.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{tx.offer}</p>
                      <p className="text-zinc-600 text-xs">{tx.date}{tx.isSubscriptionCharge ? " · subscription" : ""}</p>
                    </div>
                    <p className="text-zinc-300 font-semibold text-sm flex-shrink-0">${formatExact(tx.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {myManual.length === 0 && myTx.length === 0 && mySubs.length === 0 && (
            <p className="text-zinc-600 text-sm text-center py-6">No payment records yet for this contact.</p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-zinc-800">
          <button
            onClick={() => onAddPaymentForPerson(person.name, person.phone, person.email, person.ghlContactId, person.ghlUrl)}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-colors"
          >
            + Add Payment for {person.name.split(" ")[0]}
          </button>
        </div>
      </div>
    </div>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  Fanbasis: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  Skool: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  default: "text-zinc-400 bg-zinc-700/30 border-zinc-600/30",
};

function EditSubModal({ sub, onClose, onSave }: { sub: Subscription; onClose: () => void; onSave: (amount: string, date: string) => void }) {
  const [amount, setAmount] = useState(String(sub.amount));
  const [date, setDate] = useState(sub.nextBillTs ? new Date(sub.nextBillTs * 1000).toISOString().split("T")[0] : "");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4 mx-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Edit — {sub.name}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1">Amount ($)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1">Next Billing Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-xl transition-colors">Cancel</button>
          <button onClick={() => onSave(amount, date)} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors">Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Manual Payment Modal ────────────────────────────────────────────────

function EditManualPaymentModal({ payment, onClose, onSave, onDelete }: {
  payment: ManualPayment;
  onClose: () => void;
  onSave: (updates: Partial<ManualPayment>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(payment.name);
  const [source, setSource] = useState(payment.source);
  const [offer, setOffer] = useState(payment.offer ?? "");
  const [amount, setAmount] = useState(String(payment.amount));
  const [paymentDate, setPaymentDate] = useState(payment.payment_date ?? "");
  const [nextBillDate, setNextBillDate] = useState(payment.next_bill_date ?? "");
  const [billingDay, setBillingDay] = useState(String(payment.billing_day ?? ""));
  const [phone, setPhone] = useState(payment.phone ?? "");
  const [email, setEmail] = useState(payment.email ?? "");
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isRecurring = payment.payment_type === "recurring";
  const isScheduled = payment.status === "scheduled";
  const sourceColor = SOURCE_COLORS[payment.source] ?? SOURCE_COLORS.default;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-white font-bold text-base truncate">{payment.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sourceColor}`}>{payment.source}</span>
                {isScheduled && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">DUE</span>}
                <span className="text-zinc-600 text-xs">{isRecurring ? payment.interval_type : "one-off"}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none flex-shrink-0 mt-0.5">&times;</button>
          </div>
          {/* Quick contact actions */}
          {(payment.phone || payment.email) && (
            <div className="mt-3">
              <ContactActions phone={payment.phone} email={payment.email} size="md" />
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Label</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Source + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Amount ($)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Offer */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Offer / Product</label>
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="e.g. BOARDROOM, Miami Event Sponsor"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Date fields */}
          {!isRecurring && (
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">
                {isScheduled ? "Due Date" : "Payment Date"}
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
          {isRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Next Billing Date</label>
                <input
                  type="date"
                  value={nextBillDate}
                  onChange={(e) => setNextBillDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Billing Day</label>
                <input
                  type="number"
                  value={billingDay}
                  onChange={(e) => setBillingDay(e.target.value)}
                  min="1"
                  max="31"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Status pill */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
            isScheduled ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
            : payment.status === "paused" ? "bg-amber-900/20 border-amber-900/30 text-amber-400"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          }`}>
            <span>{isScheduled ? "🕐" : payment.status === "paused" ? "⏸" : "✓"}</span>
            <span className="font-medium">
              {isScheduled ? "Scheduled — awaiting collection"
                : payment.status === "paused" ? "Paused"
                : isRecurring ? "Active"
                : "Collected"}
            </span>
          </div>

          {/* Notes */}
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any context…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 space-y-2 flex-shrink-0">
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-zinc-700 rounded-xl text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => onSave({
                name: name.trim(),
                source,
                offer: offer.trim() || null,
                amount: parseFloat(amount),
                payment_date: !isRecurring ? (paymentDate || null) : payment.payment_date,
                next_bill_date: isRecurring ? (nextBillDate || null) : payment.next_bill_date,
                billing_day: isRecurring ? (parseInt(billingDay) || null) : payment.billing_day,
                phone: phone.trim() || null,
                email: email.trim() || null,
                notes: notes.trim() || null,
              })}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors"
            >
              Save Changes
            </button>
          </div>
          {confirmDelete ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 border border-zinc-700 rounded-xl text-zinc-400 text-xs hover:bg-zinc-800 transition-colors">Keep</button>
              <button onClick={onDelete} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors">Delete permanently</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="w-full py-2 text-red-500 hover:text-red-400 text-xs transition-colors">
              Delete this payment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FinancesWorkspace() {
  // The sidebar and the in-page tab bar both write ?tab=, so the URL is the
  // single source of truth for which view is open.
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const tab: FinanceTab = isFinanceTab(urlTab) ? urlTab : "dashboard";
  const router = useRouter();

  const [period, setPeriod] = useState("mtd");
  const [chart, setChart] = useState<ChartBar[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [previous, setPrevious] = useState<PreviousSummary | null>(null);
  // Captured when data lands, so every countdown on screen agrees.
  const [nowTs, setNowTs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState<SubData | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [manualPayments, setManualPayments] = useState<ManualPayment[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForPerson, setAddForPerson] = useState<{ name: string; phone: string | null; email: string | null; ghlContactId: string | null; ghlUrl: string | null } | null>(null);
  const [editingManual, setEditingManual] = useState<ManualPayment | null>(null);
  const [togglingManualId, setTogglingManualId] = useState<string | null>(null);
  const [personPanel, setPersonPanel] = useState<PersonPanelState | null>(null);
  const [showPromiseModal, setShowPromiseModal] = useState(false);

  const loadRevenue = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/stripe/revenue?period=${period}`);
    const data = await res.json();
    setChart(data.chart || []);
    setTransactions(data.transactions || []);
    setPrevious(data.previous ?? null);
    setNowTs(Math.floor(Date.now() / 1000));
    setSummary(data.summary || null);
    setLoading(false);
    setIsDemo(data.isDemo);
  }, [period]);

  const loadSubscriptions = useCallback(async () => {
    const res = await fetch("/api/stripe/subscriptions");
    const data = await res.json();
    setSubData(data);
  }, []);

  const loadManualPayments = useCallback(async () => {
    const res = await fetch("/api/manual-payments");
    const data = await res.json();
    setManualPayments(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { loadRevenue(); }, [loadRevenue]);
  useEffect(() => { loadSubscriptions(); }, [loadSubscriptions]);
  useEffect(() => { loadManualPayments(); }, [loadManualPayments]);

  async function togglePause(sub: Subscription) {
    setTogglingId(sub.id);
    await fetch("/api/stripe/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: sub.id, action: sub.status === "active" ? "pause" : "resume" }),
    });
    setTogglingId(null);
    loadSubscriptions();
  }

  async function deleteSub(sub: Subscription) {
    if (!confirm(`Cancel ${sub.name}'s subscription? This cannot be undone.`)) return;
    setDeletingId(sub.id);
    await fetch("/api/stripe/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: sub.id }),
    });
    setDeletingId(null);
    loadSubscriptions();
  }

  async function saveEdit(amount: string, date: string) {
    if (!editingSub) return;
    const amountChanged = parseFloat(amount) !== editingSub.amount;
    const origDate = editingSub.nextBillTs ? new Date(editingSub.nextBillTs * 1000).toISOString().split("T")[0] : "";
    const dateChanged = date !== origDate;
    if (amountChanged) {
      await fetch("/api/stripe/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: editingSub.id, action: "editAmount",
          itemId: editingSub.itemId,
          amountCents: Math.round(parseFloat(amount) * 100),
          currency: editingSub.currency,
          interval: editingSub.interval,
        }),
      });
    }
    if (dateChanged && date) {
      await fetch("/api/stripe/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: editingSub.id, action: "editBillingDate", billingDateTs: Math.floor(new Date(date).getTime() / 1000) }),
      });
    }
    setEditingSub(null);
    loadSubscriptions();
  }

  async function addManualPayment(records: Omit<ManualPayment, "id" | "created_at">[]) {
    await Promise.all(records.map((payload) =>
      fetch("/api/manual-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    ));
    setShowAddModal(false);
    loadManualPayments();
  }

  async function saveManualEdit(updates: Partial<ManualPayment>) {
    if (!editingManual) return;
    await fetch("/api/manual-payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingManual.id, ...updates }),
    });
    setEditingManual(null);
    loadManualPayments();
  }

  // Inline edit straight from a payment row (optimistic)
  async function patchManual(id: string, patch: Partial<ManualPayment>) {
    setManualPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    await fetch("/api/manual-payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function toggleManual(p: ManualPayment) {
    setTogglingManualId(p.id);
    let newStatus: string;
    if (p.status === "scheduled") {
      newStatus = "collected";
    } else if (p.status === "active") {
      newStatus = "paused";
    } else {
      newStatus = "active";
    }
    await fetch("/api/manual-payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, status: newStatus }),
    });
    setTogglingManualId(null);
    loadManualPayments();
  }

  async function deleteManual(p: ManualPayment) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    await fetch("/api/manual-payments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    loadManualPayments();
  }

  const financeData: FinanceData = useMemo(
    () => ({ period, nowTs, loading, chart, transactions, summary, previous, subData, manualPayments }),
    [period, nowTs, loading, chart, transactions, summary, previous, subData, manualPayments],
  );

  // Opening the person panel is the same gesture from a charge, a manual
  // payment or a subscription — only the fields we happen to know differ.
  const handlers: FinanceHandlers = useMemo(() => ({
    onOpenTx: (tx) => setPersonPanel({ name: tx.name, phone: tx.phone, email: tx.email, ghlUrl: null, ghlContactId: null }),
    onOpenManual: (p) => setPersonPanel({ name: p.name, phone: p.phone, email: p.email, ghlUrl: p.ghl_url, ghlContactId: p.ghl_contact_id }),
    onOpenSub: (sub) => setPersonPanel({ name: sub.name, phone: null, email: sub.email, ghlUrl: null, ghlContactId: null }),
    onEditSub: setEditingSub,
    onToggleSub: togglePause,
    onDeleteSub: deleteSub,
    onEditManual: setEditingManual,
    onMarkCollected: (p) => patchManual(p.id, { status: "collected", payment_date: new Date().toISOString().split("T")[0] }),
    onLogPromise: () => setShowPromiseModal(true),
    onLogCollected: () => setShowAddModal(true),
    onGoTab: (next) => router.push(next === "dashboard" ? "/revenue" : `/revenue?tab=${next}`, { scroll: false }),
    togglingId,
    deletingId,
    // The mutation helpers are re-declared every render; depending on them here
    // would rebuild this object every render for no gain. The busy ids are what
    // the sheets actually need to see change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [router, togglingId, deletingId]);


  return (
    <div className="space-y-6">
      {/* Edit sub modal */}
      {editingSub && (
        <EditSubModal sub={editingSub} onClose={() => setEditingSub(null)} onSave={saveEdit} />
      )}

      {/* Quick promise modal */}
      {showPromiseModal && (
        <QuickAddPromiseModal onClose={() => setShowPromiseModal(false)} onSave={async (records) => { await addManualPayment(records); setShowPromiseModal(false); }} />
      )}

      {/* Add payment modal */}
      {showAddModal && (
        <AddPaymentModal onClose={() => setShowAddModal(false)} onSave={addManualPayment} />
      )}

      {/* Add payment pre-filled for a specific person */}
      {addForPerson && (
        <AddPaymentModal
          onClose={() => setAddForPerson(null)}
          onSave={async (records) => { await addManualPayment(records); setAddForPerson(null); setPersonPanel(null); }}
          prefillName={addForPerson.name}
          prefillPhone={addForPerson.phone}
          prefillEmail={addForPerson.email}
          prefillGhlContactId={addForPerson.ghlContactId}
          prefillGhlUrl={addForPerson.ghlUrl}
        />
      )}

      {/* Edit manual payment modal */}
      {editingManual && (
        <EditManualPaymentModal
          payment={editingManual}
          onClose={() => setEditingManual(null)}
          onSave={saveManualEdit}
          onDelete={async () => { await deleteManual(editingManual); setEditingManual(null); }}
        />
      )}

      {/* Person panel */}
      {personPanel && (
        <PersonPanel
          person={personPanel}
          manualPayments={manualPayments}
          stripeTx={transactions}
          stripeSubscriptions={subData?.subscriptions ?? []}
          onClose={() => setPersonPanel(null)}
          onEditPayment={(p) => { setEditingManual(p); }}
          onTogglePayment={toggleManual}
          onAddPaymentForPerson={(name, phone, email, ghlContactId, ghlUrl) => {
            setAddForPerson({ name, phone, email, ghlContactId, ghlUrl });
          }}
          togglingManualId={togglingManualId}
        />
      )}

      {/* ── Header: what section you're in, and which slice of time ───────── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">💰 Finances</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {isDemo
              ? "Demo data — connect Stripe to see live numbers"
              : "Stripe and hand-logged money, in one place"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowPromiseModal(true)}
            className="rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/25"
          >
            📅 Log promise
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-emerald-500"
          >
            + Log collected
          </button>
          {/* The period drives every tab, so it sits above them rather than inside one. */}
          <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                disabled={tab === "mrr"}
                title={tab === "mrr" ? "MRR is a snapshot of today's book, not a period total" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-30 ${
                  period === p.key ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Tabs: the same set as the sidebar, so either route works ──────── */}
      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60 p-1">
        {FINANCE_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "dashboard" ? "/revenue" : `/revenue?tab=${t.key}`}
            scroll={false}
            className={`flex-shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
            }`}
          >
            <span className="mr-1.5" aria-hidden>{t.emoji}</span>{t.label}
            {t.key === "mrr" && subData ? (
              <span className="ml-1.5 text-[11px] opacity-60">{subData.totalActive}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "dashboard" && <DashboardTab data={financeData} handlers={handlers} />}
      {tab === "sales" && <RecentSalesTab data={financeData} handlers={handlers} />}
      {tab === "mrr" && <MrrTab data={financeData} handlers={handlers} />}
      {tab === "low" && <LowTicketTab data={financeData} handlers={handlers} />}
    </div>
  );
}
