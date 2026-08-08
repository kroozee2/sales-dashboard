"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatExact } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  offer: string;
  amount: number;
  date: string;
  status: string;
  customerId: string | null;
  createdTs: number;
  isSubscriptionCharge?: boolean;
}

interface GhlContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  ghlUrl: string;
}

interface Subscription {
  id: string;
  itemId: string | null;
  priceId: string | null;
  currency: string;
  name: string;
  email: string | null;
  offer: string;
  amount: number;
  monthlyAmount: number;
  interval: string;
  status: "active" | "paused";
  nextBill: string;
  nextBillTs: number | null;
  startDate: string;
  customerId: string | null;
}

interface RevenueSummary {
  total: number;
  newSalesLowTicket: number;
  newSalesHighTicket: number;
  newSalesLowCount: number;
  newSalesHighCount: number;
}

interface SubData {
  subscriptions: Subscription[];
  mrr: number;
  totalActive: number;
  totalPaused: number;
}

interface ManualPayment {
  id: string;
  name: string;
  source: string;
  offer: string | null;
  notes: string | null;
  amount: number;
  payment_type: "one_off" | "recurring";
  payment_date: string | null;
  interval_type: string | null;
  billing_day: number | null;
  start_date: string | null;
  next_bill_date: string | null;
  status: "active" | "paused" | "cancelled" | "scheduled" | "collected";
  phone: string | null;
  email: string | null;
  ghl_contact_id: string | null;
  ghl_url: string | null;
  created_at: string;
}

interface GhlSearchContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  ghlUrl: string;
}

interface PersonPanelState {
  name: string;
  phone: string | null;
  email: string | null;
  ghlUrl: string | null;
  ghlContactId: string | null;
}

type DrawerType = "subscriptions" | "low" | "high" | "all" | "manual" | null;

const PERIODS = [
  { key: "mtd",     label: "MTD" },
  { key: "wtd",     label: "WTD" },
  { key: "qtd",     label: "QTD" },
  { key: "ytd",     label: "YTD" },
  { key: "alltime", label: "All Time" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

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

// ─── Aligned payment rows (Monarch-style, editable) ──────────────────────────

const PAY_STATUS = ["collected", "scheduled", "active", "paused"] as const;

// Editable manual-payment row. Columns line up with TxRow.
function ManualRow({ p, color, onOpen, onPatch }: {
  p: ManualPayment; color: string; onOpen: () => void; onPatch: (id: string, patch: Partial<ManualPayment>) => void;
}) {
  const amountCls = color === "blue" ? "text-blue-400" : color === "purple" ? "text-purple-400" : "text-emerald-400";
  return (
    <div className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/30 transition-colors">
      <button onClick={onOpen} className="min-w-0 text-left" style={{ flex: "2 1 0%" }}>
        <p className="text-white text-sm font-medium truncate">{p.name}</p>
        <p className="text-zinc-600 text-xs truncate">{p.source ?? "—"}{p.offer ? ` · ${p.offer}` : ""}</p>
      </button>
      {/* Date */}
      <input
        type="date"
        value={p.payment_date ? p.payment_date.split("T")[0] : ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onPatch(p.id, { payment_date: e.target.value || null })}
        className="hidden md:block w-[130px] flex-shrink-0 bg-transparent hover:bg-zinc-800 border border-transparent hover:border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 cursor-pointer transition-colors"
      />
      {/* Status */}
      <select
        value={p.status ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onPatch(p.id, { status: e.target.value } as Partial<ManualPayment>)}
        className={`hidden sm:block w-[110px] flex-shrink-0 rounded-lg px-2 py-1 text-xs cursor-pointer focus:outline-none focus:border-violet-500 border transition-colors ${
          p.status === "scheduled" ? "bg-amber-950/40 border-amber-800/50 text-amber-300" : "bg-zinc-800 border-zinc-700 text-zinc-300"
        }`}
      >
        {PAY_STATUS.map((s) => <option key={s} value={s} className="bg-zinc-900 text-zinc-200">{s}</option>)}
      </select>
      {/* Amount — editable */}
      <div className="w-[110px] flex-shrink-0 flex items-center justify-end gap-0.5">
        <span className={`text-sm font-semibold ${amountCls}`}>$</span>
        <input
          type="number"
          value={p.amount}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onPatch(p.id, { amount: Number(e.target.value) || 0 })}
          className={`w-full bg-transparent hover:bg-zinc-800 border border-transparent hover:border-zinc-700 rounded-lg px-1 py-1 text-sm font-semibold text-right focus:outline-none focus:border-violet-500 transition-colors ${amountCls}`}
        />
      </div>
    </div>
  );
}

function PayHeader() {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-t border-zinc-800 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
      <span style={{ flex: "2 1 0%" }}>Name</span>
      <span className="hidden md:block w-[130px] flex-shrink-0">Date</span>
      <span className="hidden sm:block w-[110px] flex-shrink-0">Status</span>
      <span className="w-[110px] flex-shrink-0 text-right">Amount</span>
    </div>
  );
}

// Read-only Stripe transaction row — same column widths as ManualRow
function TxRow({ tx, color, onOpen }: { tx: Transaction; color: string; onOpen: () => void }) {
  const amountCls = color === "blue" ? "text-blue-400" : color === "purple" ? "text-purple-400" : "text-emerald-400";
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/30 transition-colors text-left">
      <div className="min-w-0" style={{ flex: "2 1 0%" }}>
        <p className="text-white text-sm font-medium truncate">{tx.name}</p>
        <p className="text-zinc-600 text-xs truncate">{tx.offer || "Stripe"}</p>
      </div>
      <span className="hidden md:block w-[130px] flex-shrink-0 text-zinc-500 text-xs">{tx.date}</span>
      <span className="hidden sm:block w-[110px] flex-shrink-0 text-zinc-600 text-xs">💳 Stripe</span>
      <span className={`w-[110px] flex-shrink-0 text-right text-sm font-semibold ${amountCls}`}>${formatExact(tx.amount)}</span>
    </button>
  );
}

// ─── Transaction Contact Card ─────────────────────────────────────────────────

function TxContactCard({ tx }: { tx: Transaction }) {
  const [contact, setContact] = useState<GhlContact | null | "loading">("loading");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tx.email) params.set("email", tx.email);
    else if (tx.name && tx.name !== "Customer") params.set("name", tx.name);
    else { setContact(null); return; }
    fetch(`/api/ghl/contact-lookup?${params}`)
      .then((r) => r.json())
      .then((d) => setContact(d.contact ?? null));
  }, [tx.email, tx.name]);

  async function searchGhl() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const params = new URLSearchParams({ name: searchQuery });
    const r = await fetch(`/api/ghl/contact-lookup?${params}`);
    const d = await r.json();
    setContact(d.contact ?? null);
    setSearching(false);
  }

  const phone = (contact !== "loading" && contact?.phone) ? contact.phone : tx.phone;
  const phoneDigits = phone ? phone.replace(/\D/g, "") : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white font-semibold text-sm">{tx.name}</p>
          {tx.email && <p className="text-zinc-500 text-xs mt-0.5">{tx.email}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-emerald-400 font-bold text-sm">${formatExact(tx.amount)}</p>
          <p className="text-zinc-600 text-xs">{tx.date}</p>
        </div>
      </div>

      {/* Offer badge */}
      <span className="inline-block px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-md text-xs border border-zinc-700">
        {tx.offer}
      </span>

      {/* Contact actions */}
      {contact === "loading" ? (
        <p className="text-zinc-600 text-xs animate-pulse">Looking up in GHL…</p>
      ) : contact ? (
        <div className="space-y-2">
          {phone && <p className="text-zinc-500 text-xs">{phone}</p>}
          <div className="flex flex-wrap gap-1.5">
            {contact.ghlUrl && (
              <a href={contact.ghlUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-300 text-xs font-medium transition-colors">
                ⚡ GHL
              </a>
            )}
            {phone && (
              <>
                <a href={`tel:${phone}`}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 text-xs font-medium transition-colors">
                  📞 Call
                </a>
                <a href={`sms:${phone}`}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-medium transition-colors">
                  💬 iMessage
                </a>
                {phoneDigits && (
                  <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-300 text-xs font-medium transition-colors">
                    📱 WhatsApp
                  </a>
                )}
              </>
            )}
            {(contact.email ?? tx.email) && (
              <>
                <a href={`mailto:${contact.email ?? tx.email}`}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-700/40 hover:bg-zinc-700 border border-zinc-600/40 text-zinc-300 text-xs font-medium transition-colors">
                  ✉️ Email
                </a>
                <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(contact.email ?? tx.email ?? "")}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-600/30 text-red-400 text-xs font-medium transition-colors">
                  Gmail
                </a>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-zinc-600 text-xs">Not found in GHL — search manually:</p>
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchGhl()}
              placeholder="Name or email…"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
            />
            <button onClick={searchGhl} disabled={searching}
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium disabled:opacity-50 transition-colors">
              {searching ? "…" : "Search"}
            </button>
          </div>
          {/* Still show email/phone from Stripe if available */}
          {tx.email && (
            <a href={`mailto:${tx.email}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-700/40 hover:bg-zinc-700 border border-zinc-600/40 text-zinc-300 text-xs font-medium transition-colors">
              ✉️ Email {tx.email}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub Contact Card ─────────────────────────────────────────────────────────

function SubContactCard({ sub, onEdit, onToggle, onDelete, toggling, deleting }: {
  sub: Subscription;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
  deleting: boolean;
}) {
  const [contact, setContact] = useState<GhlContact | null | "loading">("loading");
  useEffect(() => {
    const params = new URLSearchParams();
    if (sub.email) params.set("email", sub.email);
    else if (sub.name) params.set("name", sub.name);
    else { setContact(null); return; }
    fetch(`/api/ghl/contact-lookup?${params}`)
      .then((r) => r.json())
      .then((d) => setContact(d.contact ?? null));
  }, [sub.email, sub.name]);

  const phone = (contact !== "loading" && contact?.phone) ? contact.phone : null;
  const phoneDigits = phone ? phone.replace(/\D/g, "") : null;
  const isPaused = sub.status === "paused";

  return (
    <div className={`bg-zinc-900 border rounded-xl px-4 py-2.5 ${isPaused ? "border-amber-900/40" : "border-zinc-800"}`}>
      {/* Single compact row */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isPaused ? "bg-amber-400" : "bg-emerald-400"}`} />
        <span className="text-white text-sm font-medium flex-shrink-0">{sub.name}</span>
        <span className={`text-xs font-bold flex-shrink-0 ${isPaused ? "text-amber-400" : "text-emerald-400"}`}>${formatExact(sub.amount)}<span className="text-zinc-600 font-normal">/{sub.interval === "month" ? "mo" : sub.interval}</span></span>
        {isPaused && <span className="text-amber-600 text-xs flex-shrink-0">Paused</span>}
        {!isPaused && sub.nextBill && <span className="text-zinc-600 text-xs flex-shrink-0">· {sub.nextBill}</span>}
        <div className="flex items-center gap-1 flex-wrap ml-auto">
          {contact !== "loading" && contact?.ghlUrl && (
            <a href={contact.ghlUrl} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded-md bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-300 text-xs transition-colors">⚡</a>
          )}
          {phone && (
            <>
              <a href={`tel:${phone}`} className="px-2 py-0.5 rounded-md bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 text-xs transition-colors">📞</a>
              <a href={`sms:${phone}`} className="px-2 py-0.5 rounded-md bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs transition-colors">💬</a>
              {phoneDigits && <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded-md bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-300 text-xs transition-colors">📱</a>}
            </>
          )}
          {(contact !== "loading" && contact?.email) && (
            <>
              <a href={`mailto:${contact.email}`} className="px-2 py-0.5 rounded-md bg-zinc-700/40 hover:bg-zinc-700 border border-zinc-600/40 text-zinc-300 text-xs transition-colors">✉️</a>
              <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(contact.email)}`} target="_blank" rel="noreferrer" className="px-2 py-0.5 rounded-md bg-red-600/20 hover:bg-red-600/40 border border-red-600/30 text-red-400 text-xs transition-colors">Gmail</a>
            </>
          )}
          <button onClick={onEdit} className="px-2 py-0.5 rounded-md bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30 text-xs transition-colors">✏️</button>
          <button onClick={onToggle} disabled={toggling} className={`px-2 py-0.5 rounded-md border text-xs disabled:opacity-50 transition-colors ${isPaused ? "bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border-emerald-600/30" : "bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border-amber-600/30"}`}>
            {toggling ? "…" : isPaused ? "▶" : "⏸"}
          </button>
          {isPaused && <button onClick={onDelete} disabled={deleting} className="px-2 py-0.5 rounded-md bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 text-xs disabled:opacity-50 transition-colors">{deleting ? "…" : "🗑"}</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Add Promise Modal ──────────────────────────────────────────────────

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

function ManualPaymentCard({ payment, onEdit, onDelete, onToggle, toggling, deleting }: {
  payment: ManualPayment;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  toggling: boolean;
  deleting: boolean;
}) {
  const isRecurring = payment.payment_type === "recurring";
  const isPaused = payment.status === "paused";
  const isScheduled = payment.status === "scheduled";
  const isCollected = payment.status === "collected" || payment.status === "active";
  const sourceColor = SOURCE_COLORS[payment.source] ?? SOURCE_COLORS.default;

  const borderColor = isPaused ? "border-amber-900/40" : isScheduled ? "border-amber-500/30" : "border-zinc-800";
  const amountColor = isPaused ? "text-amber-400" : isScheduled ? "text-amber-300" : "text-emerald-400";

  return (
    <div className={`bg-zinc-900 border rounded-2xl p-4 space-y-3 ${borderColor}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-white font-semibold text-sm">{payment.name}</p>
            {isScheduled && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">DUE</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sourceColor}`}>{payment.source}</span>
            {payment.offer && <span className="text-zinc-500 text-xs">{payment.offer}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`font-bold text-sm ${amountColor}`}>${payment.amount.toLocaleString()}</p>
          <p className="text-zinc-600 text-xs">{isRecurring ? payment.interval_type : isScheduled ? "scheduled" : "one-off"}</p>
        </div>
      </div>

      {isRecurring && (
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Next bill: <span className={`font-medium ${isPaused ? "text-zinc-600" : "text-zinc-300"}`}>{isPaused ? "Paused" : (payment.next_bill_date ?? "—")}</span></span>
          <span className="text-zinc-600">Started {payment.start_date ?? "—"}</span>
        </div>
      )}

      {!isRecurring && payment.payment_date && (
        <p className={`text-xs ${isScheduled ? "text-amber-400" : "text-zinc-500"}`}>
          {isScheduled ? `Due on ${payment.payment_date}` : `Collected on ${payment.payment_date}`}
        </p>
      )}

      {payment.notes && (
        <p className="text-zinc-500 text-xs italic">{payment.notes}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onEdit} className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30 rounded-lg text-xs transition-colors">✏️ Edit</button>
        {isScheduled && (
          <button onClick={onToggle} disabled={toggling} className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg text-xs disabled:opacity-50 transition-colors">
            {toggling ? "…" : "✓ Mark Collected"}
          </button>
        )}
        {isRecurring && (
          <button onClick={onToggle} disabled={toggling} className={`px-2.5 py-1 border rounded-lg text-xs disabled:opacity-50 transition-colors ${
            isPaused ? "bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border-emerald-600/30" : "bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border-amber-600/30"
          }`}>
            {toggling ? "…" : isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
        )}
        <button onClick={onDelete} disabled={deleting} className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg text-xs disabled:opacity-50 transition-colors">
          {deleting ? "…" : "🗑 Delete"}
        </button>
      </div>
    </div>
  );
}

// ─── Revenue Drawer ───────────────────────────────────────────────────────────

function RevenueDrawer({ type, transactions, subData, summary, onClose, onEditSub, onToggleSub, onDeleteSub, togglingId, deletingId, manualPayments, onEditManual, onDeleteManual, onToggleManual, togglingManualId, deletingManualId }: {
  type: DrawerType;
  transactions: Transaction[];
  subData: SubData | null;
  summary: RevenueSummary | null;
  onClose: () => void;
  onEditSub: (s: Subscription) => void;
  onToggleSub: (s: Subscription) => void;
  onDeleteSub: (s: Subscription) => void;
  togglingId: string | null;
  deletingId: string | null;
  manualPayments: ManualPayment[];
  onEditManual: (p: ManualPayment) => void;
  onDeleteManual: (p: ManualPayment) => void;
  onToggleManual: (p: ManualPayment) => void;
  togglingManualId: string | null;
  deletingManualId: string | null;
}) {
  if (!type) return null;

  const config: Record<NonNullable<DrawerType>, { emoji: string; title: string; subtitle: string; color: string }> = {
    subscriptions: { emoji: "📈", title: "Active Subscriptions", subtitle: `${subData?.totalActive ?? 0} active · MRR ${fmt(subData?.mrr ?? 0)}`, color: "emerald" },
    low:           { emoji: "🎟",  title: "Low Ticket Purchases", subtitle: `${summary?.newSalesLowCount ?? 0} transactions · ${fmt(summary?.newSalesLowTicket ?? 0)}`, color: "blue" },
    high:          { emoji: "🏆", title: "High Ticket Sales", subtitle: `${summary?.newSalesHighCount ?? 0} transactions · ${fmt(summary?.newSalesHighTicket ?? 0)}`, color: "purple" },
    all:           { emoji: "💰", title: "All Transactions", subtitle: `${transactions.length} total`, color: "zinc" },
    manual:        { emoji: "🏦", title: "Manual Payments", subtitle: `${manualPayments.length} entries`, color: "purple" },
  };

  const { emoji, title, subtitle } = config[type];

  const activeSubs = subData?.subscriptions.filter((s) => s.status === "active") ?? [];
  const pausedSubs = subData?.subscriptions.filter((s) => s.status === "paused") ?? [];
  const allSubs = [...activeSubs, ...pausedSubs];

  const filteredTx =
    type === "low" ? transactions.filter((t) => t.amount < 1000 && !t.isSubscriptionCharge) :
    type === "high" ? transactions.filter((t) => t.amount >= 1000 && !t.isSubscriptionCharge) :
    transactions;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />
      <div
        className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 flex flex-col h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <span className="text-2xl">{emoji}</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-base">{title}</h2>
            <p className="text-zinc-500 text-xs mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {type === "subscriptions" ? (
            allSubs.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No subscriptions found.</p>
            ) : (
              allSubs.map((sub) => (
                <SubContactCard
                  key={sub.id}
                  sub={sub}
                  onEdit={() => onEditSub(sub)}
                  onToggle={() => onToggleSub(sub)}
                  onDelete={() => onDeleteSub(sub)}
                  toggling={togglingId === sub.id}
                  deleting={deletingId === sub.id}
                />
              ))
            )
          ) : type === "manual" ? (
            manualPayments.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No manual payments yet.</p>
            ) : (
              manualPayments.map((p) => (
                <ManualPaymentCard
                  key={p.id}
                  payment={p}
                  onEdit={() => onEditManual(p)}
                  onDelete={() => onDeleteManual(p)}
                  onToggle={() => onToggleManual(p)}
                  toggling={togglingManualId === p.id}
                  deleting={deletingManualId === p.id}
                />
              ))
            )
          ) : (
            filteredTx.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No transactions found.</p>
            ) : (
              filteredTx.map((tx) => (
                <TxContactCard key={tx.id} tx={tx} />
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ emoji, label, value, sub, color, onClick, gradient }: {
  emoji: string;
  label: string;
  value: string;
  sub: string;
  color: string;
  onClick?: () => void;
  gradient: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`relative overflow-hidden bg-gradient-to-br ${gradient} border border-zinc-800 rounded-2xl p-5 text-left w-full transition-all ${onClick ? "hover:border-zinc-600 hover:scale-[1.01] cursor-pointer active:scale-[0.99]" : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{emoji}</span>
        {onClick && <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
      </div>
      <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-zinc-500 text-xs mt-1">{sub}</p>
    </Tag>
  );
}

// ─── Edit Sub Modal ───────────────────────────────────────────────────────────

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

export default function RevenuePage() {
  const [period, setPeriod] = useState("mtd");
  const [chart, setChart] = useState<{ label: string; revenue: number }[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [subData, setSubData] = useState<SubData | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [drawer, setDrawer] = useState<DrawerType>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [manualPayments, setManualPayments] = useState<ManualPayment[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForPerson, setAddForPerson] = useState<{ name: string; phone: string | null; email: string | null; ghlContactId: string | null; ghlUrl: string | null } | null>(null);
  const [editingManual, setEditingManual] = useState<ManualPayment | null>(null);
  const [togglingManualId, setTogglingManualId] = useState<string | null>(null);
  const [deletingManualId, setDeletingManualId] = useState<string | null>(null);
  const [personPanel, setPersonPanel] = useState<PersonPanelState | null>(null);
  const [showPromiseModal, setShowPromiseModal] = useState(false);

  const loadRevenue = useCallback(async () => {
    const res = await fetch(`/api/stripe/revenue?period=${period}`);
    const data = await res.json();
    setChart(data.chart || []);
    setTransactions(data.transactions || []);
    setSummary(data.summary || null);
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
    setDeletingManualId(p.id);
    await fetch("/api/manual-payments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    setDeletingManualId(null);
    loadManualPayments();
  }

  const activeSubs = subData?.subscriptions.filter((s) => s.status === "active") ?? [];
  const pausedSubs = subData?.subscriptions.filter((s) => s.status === "paused") ?? [];
  const highTicketTx = transactions.filter((t) => t.amount >= 1000 && !t.isSubscriptionCharge);
  const lowTicketTx = transactions.filter((t) => t.amount < 1000 && !t.isSubscriptionCharge);
  const manualActiveSubs = manualPayments.filter((p) => p.payment_type === "recurring" && p.status === "active");
  const manualMrr = manualActiveSubs.reduce((sum, p) => sum + p.amount, 0);
  const totalMrr = (subData?.mrr ?? 0) + manualMrr;

  // Period date-range for manual payment filtering (mirrors Stripe API periods)
  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === "mtd") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    if (period === "wtd") { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); return d.toISOString().split("T")[0]; }
    if (period === "qtd") { const q = Math.floor(now.getMonth() / 3); return new Date(now.getFullYear(), q * 3, 1).toISOString().split("T")[0]; }
    if (period === "ytd") return new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
    return null; // alltime — no filter
  }, [period]);

  // Manual one-off collected payments that belong in high/low strips (period-filtered)
  const manualCollected = manualPayments.filter((p) => {
    if (p.payment_type !== "one_off") return false;
    if (p.status !== "collected") return false;
    if (p.amount <= 0) return false;
    if (periodStart && p.payment_date && p.payment_date < periodStart) return false;
    return true;
  });
  const manualHighTx = manualCollected.filter((p) => p.amount >= 1000);
  const manualLowTx = manualCollected.filter((p) => p.amount < 1000);
  const manualHighTotal = manualHighTx.reduce((s, p) => s + p.amount, 0);
  const manualLowTotal = manualLowTx.reduce((s, p) => s + p.amount, 0);
  const manualCollectedTotal = manualHighTotal + manualLowTotal;

  // Upcoming scheduled payments (all, sorted by due date)
  const upcomingScheduled = manualPayments
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => (a.payment_date ?? "").localeCompare(b.payment_date ?? ""));

  // Open the person panel from a manual payment
  function openPersonFromManual(p: ManualPayment) {
    setPersonPanel({
      name: p.name,
      phone: p.phone,
      email: p.email,
      ghlUrl: p.ghl_url,
      ghlContactId: p.ghl_contact_id,
    });
  }

  // Open the person panel from a Stripe transaction
  function openPersonFromTx(tx: Transaction) {
    setPersonPanel({
      name: tx.name,
      phone: tx.phone,
      email: tx.email,
      ghlUrl: null,
      ghlContactId: null,
    });
  }

  // Open person panel from a Stripe subscription
  function openPersonFromSub(sub: Subscription) {
    setPersonPanel({
      name: sub.name,
      phone: null,
      email: sub.email,
      ghlUrl: null,
      ghlContactId: null,
    });
  }

  // Merge manual payments into chart bars by matching payment_date to the nearest bucket label
  const mergedChart = useMemo(() => {
    if (!chart.length || !manualCollected.length) return chart;
    const adjusted = chart.map((b) => ({ ...b }));
    for (const p of manualCollected) {
      if (!p.payment_date) continue;
      const payDate = new Date(p.payment_date + "T12:00:00");
      // Try to find the matching bucket: for MTD (e.g. "Jun 27"), YTD/QTD (e.g. "Jun"), WTD (e.g. "Fri, Jun 27"), alltime (e.g. "2026")
      let bestIdx = -1;
      for (let i = 0; i < adjusted.length; i++) {
        const label = adjusted[i].label;
        // alltime: year string
        if (/^\d{4}$/.test(label) && label === String(payDate.getFullYear())) { bestIdx = i; break; }
        // YTD/QTD: "Jun" month abbreviation
        const monthAbbr = payDate.toLocaleDateString("en-US", { month: "short" });
        if (label === monthAbbr) { bestIdx = i; break; }
        // MTD: "Jun 27"
        const mtdLabel = `${monthAbbr} ${payDate.getDate()}`;
        if (label === mtdLabel) { bestIdx = i; break; }
        // WTD: "Fri, Jun 27"
        const wtdLabel = payDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        if (label === wtdLabel) { bestIdx = i; break; }
      }
      if (bestIdx >= 0) adjusted[bestIdx].revenue += p.amount;
    }
    return adjusted;
  }, [chart, manualCollected]);

  return (
    <div className="space-y-6">
      {/* Drawer */}
      <RevenueDrawer
        type={drawer}
        transactions={transactions}
        subData={subData}
        summary={summary}
        onClose={() => setDrawer(null)}
        onEditSub={(s) => setEditingSub(s)}
        onToggleSub={togglePause}
        onDeleteSub={deleteSub}
        togglingId={togglingId}
        deletingId={deletingId}
        manualPayments={manualPayments}
        onEditManual={(p) => setEditingManual(p)}
        onDeleteManual={deleteManual}
        onToggleManual={toggleManual}
        togglingManualId={togglingManualId}
        deletingManualId={deletingManualId}
      />

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

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">💰 Revenue</h1>
          {isDemo && <span className="text-xs text-amber-400 mt-1 block">Demo data — connect Stripe to see live numbers</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPromiseModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-sm font-semibold rounded-xl transition-colors"
          >
            📅 Log Promise
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors shadow"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Log Collected
          </button>
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p.key ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          emoji="💰" label="Total Revenue" value={fmt((summary?.total ?? 0) + manualCollectedTotal)}
          sub="cash collected" color="text-white"
          gradient="from-zinc-900 to-zinc-950"
          onClick={() => setDrawer("all")}
        />
        <KpiCard
          emoji="📈" label="MRR" value={fmt(totalMrr)}
          sub={`${(subData?.totalActive ?? 0) + manualActiveSubs.length} active · ${pausedSubs.length} paused`}
          color="text-emerald-400"
          gradient="from-emerald-950/40 to-zinc-950"
          onClick={() => setDrawer("subscriptions")}
        />
        <KpiCard
          emoji="🎟" label="Low Ticket" value={fmt((summary?.newSalesLowTicket ?? 0) + manualLowTotal)}
          sub={`${(summary?.newSalesLowCount ?? 0) + manualLowTx.length} purchases under $1K`}
          color="text-blue-400"
          gradient="from-blue-950/30 to-zinc-950"
          onClick={() => setDrawer("low")}
        />
        <KpiCard
          emoji="🏆" label="High Ticket" value={fmt((summary?.newSalesHighTicket ?? 0) + manualHighTotal)}
          sub={`${(summary?.newSalesHighCount ?? 0) + manualHighTx.length} sales $1K+`}
          color="text-purple-400"
          gradient="from-purple-950/30 to-zinc-950"
          onClick={() => setDrawer("high")}
        />
      </div>

      {/* Revenue Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">📊 Revenue Over Time</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={mergedChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false}
              tickFormatter={(v) => `$${Number(v).toLocaleString()}`} width={80} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
              labelStyle={{ color: "#e4e4e7" }}
              formatter={(v) => [`$${Number(v).toLocaleString()}`, "Revenue"]}
            />
            <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Active Subscriptions — full cards with inline actions */}
      <div className="space-y-0">
        <div className="flex items-center justify-between px-1 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📈</span>
            <div>
              <p className="text-white font-semibold text-sm">MRR — Active Subscriptions</p>
              <p className="text-zinc-500 text-xs">{activeSubs.length} active · {pausedSubs.length} paused</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-emerald-400 font-bold">{fmt(subData?.mrr ?? 0)}<span className="text-zinc-500 font-normal text-xs">/mo</span></p>
            <button onClick={() => setDrawer("subscriptions")} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">All →</button>
          </div>
        </div>
        <div className="space-y-3">
          {activeSubs.slice(0, 6).map((sub) => (
            <SubContactCard
              key={sub.id}
              sub={sub}
              onEdit={() => setEditingSub(sub)}
              onToggle={() => togglePause(sub)}
              onDelete={() => deleteSub(sub)}
              toggling={togglingId === sub.id}
              deleting={deletingId === sub.id}
            />
          ))}
          {pausedSubs.slice(0, 2).map((sub) => (
            <SubContactCard
              key={sub.id}
              sub={sub}
              onEdit={() => setEditingSub(sub)}
              onToggle={() => togglePause(sub)}
              onDelete={() => deleteSub(sub)}
              toggling={togglingId === sub.id}
              deleting={deletingId === sub.id}
            />
          ))}
          {(activeSubs.length + pausedSubs.length) > 8 && (
            <button onClick={() => setDrawer("subscriptions")} className="w-full py-2.5 text-xs text-zinc-500 hover:text-zinc-300 text-center transition-colors border border-zinc-800 rounded-xl">
              View all {activeSubs.length + pausedSubs.length} subscriptions →
            </button>
          )}
        </div>

      </div>

      {/* ── Promised Payments ── standalone section */}
      <div id="promises" className="bg-zinc-900 border border-amber-900/40 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-900/30">
          <div>
            <p className="text-white font-semibold text-sm">📅 Promised Payments</p>
            <p className="text-zinc-500 text-xs mt-0.5">
              {upcomingScheduled.length > 0
                ? `${upcomingScheduled.length} promise${upcomingScheduled.length > 1 ? "s" : ""} · $${upcomingScheduled.reduce((s, p) => s + p.amount, 0).toLocaleString()} pending`
                : "No outstanding promises"}
            </p>
          </div>
          <button
            onClick={() => setShowPromiseModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-xl transition-colors"
          >
            + Log Promise
          </button>
        </div>

        {upcomingScheduled.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className="text-3xl">🤝</span>
            <p className="text-zinc-500 text-sm">No promised payments yet</p>
            <button onClick={() => setShowPromiseModal(true)} className="text-amber-400 text-xs underline underline-offset-2 mt-1">
              Log your first promise
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {upcomingScheduled.map((p) => (
              <div key={p.id} className="px-5 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-semibold text-sm">{p.name}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">{p.offer || p.source}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-amber-400 font-bold text-base">${p.amount.toLocaleString()}</p>
                    {p.payment_date && <DueBadge dateStr={p.payment_date} />}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.ghl_url && (
                    <a href={p.ghl_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-300 text-xs font-medium transition-colors">⚡ GHL</a>
                  )}
                  {p.phone && (
                    <>
                      <a href={`tel:${p.phone}`} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 text-xs font-medium transition-colors">📞 Call</a>
                      <a href={`sms:${p.phone}`} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-medium transition-colors">💬 iMessage</a>
                      <a href={`https://wa.me/${p.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-300 text-xs font-medium transition-colors">📱 WhatsApp</a>
                    </>
                  )}
                  {p.email && (
                    <>
                      <a href={`mailto:${p.email}`} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-700/40 hover:bg-zinc-700 border border-zinc-600/40 text-zinc-300 text-xs font-medium transition-colors">✉️ Email</a>
                      <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(p.email)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-600/30 text-red-400 text-xs font-medium transition-colors">Gmail</a>
                    </>
                  )}
                  <button onClick={() => openPersonFromManual(p)} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30 rounded-lg text-xs transition-colors">✏️ Edit</button>
                  <button
                    onClick={async () => {
                      await fetch("/api/manual-payments", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: p.id, status: "collected", payment_date: new Date().toISOString().split("T")[0] }),
                      });
                      setManualPayments((prev) => prev.map((x) => x.id === p.id ? { ...x, status: "collected" as const, payment_date: new Date().toISOString().split("T")[0] } : x));
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg text-xs font-medium transition-colors ml-auto"
                  >
                    ✓ Mark Collected
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Low ticket strip */}
      {(lowTicketTx.length > 0 || manualLowTx.length > 0) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setDrawer("low")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-800/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🎟</span>
              <div className="text-left">
                <p className="text-white font-semibold text-sm">Low Ticket Purchases</p>
                <p className="text-zinc-500 text-xs">{lowTicketTx.length + manualLowTx.length} transactions under $1K</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-blue-400 font-bold">{fmt((summary?.newSalesLowTicket ?? 0) + manualLowTotal)}</p>
              <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </button>
          <PayHeader />
          <div className="divide-y divide-zinc-800/60">
            {manualLowTx.map((p) => (
              <ManualRow key={p.id} p={p} color="blue" onOpen={() => openPersonFromManual(p)} onPatch={patchManual} />
            ))}
            {lowTicketTx.slice(0, 5 - Math.min(manualLowTx.length, 5)).map((tx) => (
              <TxRow key={tx.id} tx={tx} color="blue" onOpen={() => openPersonFromTx(tx)} />
            ))}
            {(lowTicketTx.length + manualLowTx.length) > 5 && (
              <button onClick={() => setDrawer("low")} className="w-full px-6 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 text-center transition-colors">
                View all {lowTicketTx.length + manualLowTx.length} →
              </button>
            )}
          </div>
        </div>
      )}

      {/* High ticket strip */}
      {(highTicketTx.length > 0 || manualHighTx.length > 0) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setDrawer("high")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-800/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🏆</span>
              <div className="text-left">
                <p className="text-white font-semibold text-sm">High Ticket Sales</p>
                <p className="text-zinc-500 text-xs">{highTicketTx.length + manualHighTx.length} transactions ≥ $1,000</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-purple-400 font-bold">{fmt((summary?.newSalesHighTicket ?? 0) + manualHighTotal)}</p>
              <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </button>
          <PayHeader />
          <div className="divide-y divide-zinc-800/60">
            {manualHighTx.map((p) => (
              <ManualRow key={p.id} p={p} color="purple" onOpen={() => openPersonFromManual(p)} onPatch={patchManual} />
            ))}
            {highTicketTx.slice(0, 5 - Math.min(manualHighTx.length, 5)).map((tx) => (
              <TxRow key={tx.id} tx={tx} color="purple" onOpen={() => openPersonFromTx(tx)} />
            ))}
            {(highTicketTx.length + manualHighTx.length) > 5 && (
              <button onClick={() => setDrawer("high")} className="w-full px-6 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 text-center transition-colors">
                View all {highTicketTx.length + manualHighTx.length} →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual Payments strip */}
      {manualPayments.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setDrawer("manual")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-800/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🏦</span>
              <div className="text-left">
                <p className="text-white font-semibold text-sm">Manual Payments</p>
                <p className="text-zinc-500 text-xs">
                  {manualActiveSubs.length} recurring · {manualPayments.filter(p => p.payment_type === "one_off").length} one-off
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-purple-400 font-bold">{fmt(manualMrr)}<span className="text-zinc-500 font-normal text-xs">/mo</span></p>
              <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </button>
          <PayHeader />
          <div className="divide-y divide-zinc-800/60">
            {manualPayments.slice(0, 8).map((p) => (
              <ManualRow key={p.id} p={p} color="purple" onOpen={() => openPersonFromManual(p)} onPatch={patchManual} />
            ))}
            {manualPayments.length > 8 && (
              <button onClick={() => setDrawer("manual")} className="w-full px-6 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 text-center transition-colors">
                View all {manualPayments.length} →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
