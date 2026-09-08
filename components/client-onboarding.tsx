"use client";

/**
 * New clients, and the runbook that turns a payment into an onboarded member.
 *
 * Everything on this screen writes. The rest of the Clients section reads Helm
 * through a GET-only proxy, which is why it has always been read-only; the
 * fields Sales OS is responsible for live in our own table and are edited here
 * in place. A row with no Sales OS record shows a single button to start one.
 */

import { useMemo, useState } from "react";
import {
  CLIENT_STATUSES, RUNBOOK, nextRunbookStep, onboardingProgress,
  type MergedClient, type OnboardingStepKey, type RunbookStep,
} from "@/lib/client-accounts";

const OWNERS = ["Andrew", "Jameson"] as const;
const ownerEmoji = (o: string) => (o === "Jameson" ? "🧑" : "🧔");

const FAM_CHAT_URL = "https://chat.whatsapp.com/";
const money = (n: number | null) => (n === null || n === undefined ? "—" : `$${Math.round(n).toLocaleString()}`);

const statusTone = (status: string | null) => {
  const key = (status ?? "").toLowerCase();
  if (key.includes("risk")) return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  if (key.includes("track")) return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (key.includes("onboard")) return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (key.includes("board")) return "border-zinc-700 bg-zinc-800 text-zinc-400";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
};

function daysAgo(date: string | null): string {
  if (!date) return "—";
  const then = Date.parse(date.length === 10 ? `${date}T12:00:00` : date);
  if (!Number.isFinite(then)) return "—";
  const days = Math.round((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type Patch = Record<string, unknown>;

export default function ClientOnboarding({
  clients, loading, error, onPatch, onCreate, onStep, busyKey,
}: {
  clients: MergedClient[];
  loading?: boolean;
  error?: string | null;
  busyKey: string | null;
  onPatch: (client: MergedClient, patch: Patch) => void;
  onCreate: (draft: { name: string; email?: string; deal_value?: number; mrr?: number; start_date?: string }) => void;
  onStep: (client: MergedClient, key: OnboardingStepKey, done: boolean, note?: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [deal, setDeal] = useState("");
  const [mrr, setMrr] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => `${c.name} ${c.email ?? ""} ${c.program ?? ""}`.toLowerCase().includes(q));
  }, [clients, query]);

  const open = clients.find((c) => c.key === openKey) ?? null;

  const totals = useMemo(() => ({
    count: clients.length,
    deal: clients.reduce((sum, c) => sum + (c.dealValue ?? 0), 0),
    mrr: clients.reduce((sum, c) => sum + (c.mrr ?? 0), 0),
    onboarded: clients.filter((c) => nextRunbookStep(c.onboarding) === null).length,
  }), [clients]);

  const submit = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      email: email.trim() || undefined,
      deal_value: deal ? Number(deal.replace(/[^\d.]/g, "")) : undefined,
      mrr: mrr ? Number(mrr.replace(/[^\d.]/g, "")) : undefined,
      start_date: new Date().toISOString().slice(0, 10),
    });
    setName(""); setEmail(""); setDeal(""); setMrr("");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="New clients" value={String(totals.count)} tone="text-white" detail="in this window" />
        <Stat label="Contract value" value={money(totals.deal)} tone="text-emerald-300" detail="signed" />
        <Stat label="New MRR" value={money(totals.mrr)} tone="text-blue-300" detail="recurring, per month" />
        <Stat label="Fully onboarded" value={`${totals.onboarded}/${totals.count}`} tone="text-violet-300" detail="all seven steps" />
      </div>

      {/* Add someone the moment they pay, whether or not Helm knows yet */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
        <div className="grid gap-2 md:grid-cols-[1.4fr_1.4fr_110px_110px_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New client name"
            aria-label="New client name"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
          <input value={deal} onChange={(e) => setDeal(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Deal $"
            aria-label="Deal value" inputMode="decimal"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
          <input value={mrr} onChange={(e) => setMrr(e.target.value.replace(/[^\d.]/g, ""))} placeholder="MRR $"
            aria-label="Monthly recurring" inputMode="decimal"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
          <button type="button" onClick={submit} disabled={!name.trim()}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40">
            + Add client
          </button>
        </div>
      </div>

      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search new clients…"
        aria-label="Search new clients"
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />

      {loading ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-10 text-center text-sm text-zinc-400">Loading clients…</p>
      ) : error ? (
        <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center text-sm text-rose-200">{error}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
          <p className="text-sm font-medium text-zinc-300">No new clients in this window</p>
          <p className="mt-1 text-xs text-zinc-600">Add one above the moment they pay, and work the runbook from here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left">
              <thead className="bg-zinc-900/80">
                <tr className="border-b border-zinc-800 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  <th className="min-w-[190px] px-3 py-2.5">Client</th>
                  <th className="w-28 px-2 py-2.5">Started</th>
                  <th className="w-28 px-2 py-2.5 text-right">Deal</th>
                  <th className="w-24 px-2 py-2.5 text-right">MRR</th>
                  <th className="w-32 px-2 py-2.5">Status</th>
                  <th className="w-24 px-2 py-2.5">Who</th>
                  {RUNBOOK.map((step) => (
                    <th key={step.key} title={`${step.label} — ${step.detail}`} className="w-10 px-1 py-2.5 text-center">
                      <span aria-hidden>{step.emoji}</span>
                      <span className="sr-only">{step.label}</span>
                    </th>
                  ))}
                  <th className="w-32 px-3 py-2.5">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {rows.map((client, index) => (
                  <Row key={client.key} client={client} zebra={index % 2 === 1} busy={busyKey === client.key}
                    onPatch={onPatch} onStep={onStep} onOpen={() => setOpenKey(client.key)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <RunbookDrawer client={open} busy={busyKey === open.key} onClose={() => setOpenKey(null)}
          onStep={onStep} onPatch={onPatch} />
      )}
    </div>
  );
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-zinc-600">{detail}</p>
    </div>
  );
}

function Row({ client, zebra, busy, onPatch, onStep, onOpen }: {
  client: MergedClient; zebra: boolean; busy: boolean;
  onPatch: (client: MergedClient, patch: Patch) => void;
  onStep: (client: MergedClient, key: OnboardingStepKey, done: boolean) => void;
  onOpen: () => void;
}) {
  const progress = onboardingProgress(client.onboarding);
  const next = nextRunbookStep(client.onboarding);
  const cell = "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-zinc-200 transition-colors hover:border-zinc-800 focus:border-blue-500 focus:bg-zinc-950 focus:outline-none";

  // A Helm member we have no record for cannot be edited yet; one button fixes
  // that rather than a row of dead inputs.
  if (!client.editable) {
    return (
      <tr className={`${zebra ? "bg-zinc-900/30" : ""}`}>
        <td className="px-3 py-2">
          <p className="text-sm font-semibold text-white">{client.name}</p>
          <p className="text-[11px] text-zinc-600">{client.email ?? "No email on file"}</p>
        </td>
        <td className="px-2 py-2 text-xs text-zinc-500">{daysAgo(client.startDate)}</td>
        <td colSpan={11} className="px-3 py-2">
          <button type="button" onClick={() => onPatch(client, { __create: true })} disabled={busy}
            className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] font-semibold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50">
            {busy ? "Adding…" : "＋ Track in Sales OS to edit"}
          </button>
          <span className="ml-2 text-[11px] text-zinc-600">Read-only until Sales OS has its own record.</span>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`group transition-colors hover:bg-zinc-800/30 ${zebra ? "bg-zinc-900/30" : ""}`}>
      <td className="px-3 py-1.5">
        <input defaultValue={client.name} key={`${client.key}-name-${client.name}`} disabled={busy}
          aria-label={`Name: ${client.name}`}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== client.name) onPatch(client, { name: v }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={`${cell} font-semibold text-white`} />
        <button type="button" onClick={onOpen} className="px-2 text-[11px] text-zinc-600 transition-colors hover:text-blue-300">
          {client.email ?? "no email"} · open runbook →
        </button>
      </td>
      <td className="px-2 py-1.5">
        <input type="date" value={client.startDate ?? ""} disabled={busy}
          aria-label={`Start date for ${client.name}`}
          onChange={(e) => onPatch(client, { start_date: e.target.value || null })}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-1.5 py-1 text-[11px] text-zinc-300 focus:border-blue-500 focus:outline-none" />
      </td>
      <td className="px-2 py-1.5">
        <input defaultValue={client.dealValue === null ? "" : String(client.dealValue)} key={`${client.key}-deal-${client.dealValue}`}
          inputMode="decimal" disabled={busy} aria-label={`Deal value for ${client.name}`} placeholder="—"
          onBlur={(e) => { const raw = e.target.value.replace(/[^\d.]/g, ""); const v = raw ? Number(raw) : null; if (v !== client.dealValue) onPatch(client, { deal_value: v }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={`${cell} text-right font-semibold tabular-nums text-emerald-300`} />
      </td>
      <td className="px-2 py-1.5">
        <input defaultValue={client.mrr === null ? "" : String(client.mrr)} key={`${client.key}-mrr-${client.mrr}`}
          inputMode="decimal" disabled={busy} aria-label={`MRR for ${client.name}`} placeholder="—"
          onBlur={(e) => { const raw = e.target.value.replace(/[^\d.]/g, ""); const v = raw ? Number(raw) : null; if (v !== client.mrr) onPatch(client, { mrr: v }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={`${cell} text-right font-semibold tabular-nums text-blue-300`} />
      </td>
      <td className="px-2 py-1.5">
        <select value={CLIENT_STATUSES.includes(client.status as never) ? (client.status as string) : "Onboarding"}
          disabled={busy} aria-label={`Status for ${client.name}`}
          onChange={(e) => onPatch(client, { status: e.target.value })}
          className={`w-full rounded-lg border px-1.5 py-1 text-[11px] font-semibold focus:outline-none ${statusTone(client.status)}`}>
          {CLIENT_STATUSES.map((status) => <option key={status} value={status} className="bg-zinc-900 text-white">{status}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select value={client.owner} disabled={busy} aria-label={`Owner for ${client.name}`}
          onChange={(e) => onPatch(client, { owner: e.target.value })}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-1.5 py-1 text-[11px] font-semibold text-zinc-200 focus:border-blue-500 focus:outline-none">
          {OWNERS.map((o) => <option key={o} value={o} className="bg-zinc-900">{ownerEmoji(o)} {o}</option>)}
        </select>
      </td>
      {RUNBOOK.map((step) => {
        const done = client.onboarding?.[step.key]?.done === true;
        return (
          <td key={step.key} className="px-1 py-1.5 text-center">
            <input type="checkbox" checked={done} disabled={busy}
              aria-label={`${step.label} for ${client.name}`}
              title={`${step.label} — ${step.detail}`}
              onChange={(e) => onStep(client, step.key, e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-emerald-500" />
          </td>
        );
      })}
      <td className="px-3 py-1.5">
        <button type="button" onClick={onOpen} className="w-full text-left">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${progress.pct}%` }} />
            </div>
            <span className="w-8 flex-shrink-0 text-right text-[11px] tabular-nums text-zinc-400">{progress.pct}%</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-zinc-600">
            {next ? `next: ${next.label}` : "✓ fully onboarded"}
          </p>
        </button>
      </td>
    </tr>
  );
}

export function RunbookDrawer({ client, busy, onClose, onStep, onPatch }: {
  client: MergedClient; busy: boolean; onClose: () => void;
  onStep: (client: MergedClient, key: OnboardingStepKey, done: boolean, note?: string) => void;
  onPatch: (client: MergedClient, patch: Patch) => void;
}) {
  const progress = onboardingProgress(client.onboarding);
  const next = nextRunbookStep(client.onboarding);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-zinc-800 bg-zinc-950">
        <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white">{client.name}</h3>
              <p className="text-xs text-zinc-500">
                {client.email ?? "No email"}
                {client.dealValue ? ` · ${money(client.dealValue)} deal` : ""}
                {client.mrr ? ` · ${money(client.mrr)}/mo` : ""}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-2xl leading-none text-zinc-500 hover:text-white">&times;</button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500" style={{ width: `${progress.pct}%` }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-zinc-300">{progress.done}/{progress.total}</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            {next ? `Next up: ${next.emoji} ${next.label} — ${next.detail}` : "Everything on the runbook is done."}
          </p>
        </header>

        <div className="space-y-2 p-5">
          {RUNBOOK.map((step) => (
            <StepRow key={`${step.key}-${client.onboarding?.[step.key]?.note ?? ""}`} step={step} client={client} busy={busy} onStep={onStep} />
          ))}

          <div className="mt-5 space-y-3 border-t border-zinc-800 pt-5">
            <Labelled label="Program">
              <input defaultValue={client.program ?? ""} key={`prog-${client.program}`} disabled={busy}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (client.program ?? "")) onPatch(client, { program: v }); }}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none" />
            </Labelled>
            <Labelled label="WhatsApp number">
              <input defaultValue={client.whatsapp ?? ""} key={`wa-${client.whatsapp}`} disabled={busy} placeholder="+1…"
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (client.whatsapp ?? "")) onPatch(client, { whatsapp: v }); }}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none" />
            </Labelled>
            <Labelled label="Notes">
              <textarea defaultValue={client.notes ?? ""} key={`notes-${client.notes}`} rows={4} disabled={busy}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (client.notes ?? "")) onPatch(client, { notes: v }); }}
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm leading-relaxed text-zinc-200 focus:border-blue-500 focus:outline-none" />
            </Labelled>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-zinc-600">{label}</label>
      {children}
    </div>
  );
}

/** Each step carries its own note and, where useful, the link that does it. */
function StepRow({ step, client, busy, onStep }: {
  step: RunbookStep; client: MergedClient; busy: boolean;
  onStep: (client: MergedClient, key: OnboardingStepKey, done: boolean, note?: string) => void;
}) {
  const state = client.onboarding?.[step.key];
  const done = state?.done === true;
  const [note, setNote] = useState(state?.note ?? "");

  const action = shortcutFor(step.key, client);

  return (
    <div className={`rounded-xl border p-3 transition-colors ${done ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-zinc-800 bg-zinc-900/50"}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={done} disabled={busy}
          aria-label={step.label}
          onChange={(e) => onStep(client, step.key, e.target.checked, note || undefined)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${done ? "text-emerald-200" : "text-white"}`}>{step.emoji} {step.label}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{step.detail}</p>
          {done && state?.at && (
            <p className="mt-1 text-[10px] text-emerald-400/70">Done {new Date(state.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} disabled={busy}
              placeholder="Note (optional)" aria-label={`Note for ${step.label}`}
              onBlur={() => { if ((state?.note ?? "") !== note) onStep(client, step.key, done, note); }}
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300 focus:border-blue-500 focus:outline-none" />
            {action && (
              <a href={action.href} target="_blank" rel="noreferrer"
                className="flex-shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white">
                {action.label} ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The link that actually does the step, where there is one. */
function shortcutFor(key: OnboardingStepKey, client: MergedClient): { href: string; label: string } | null {
  const phone = (client.whatsapp ?? client.phone ?? "").replace(/\D/g, "");
  switch (key) {
    case "fam":
      return phone
        ? { href: `https://wa.me/${phone}`, label: "Message on WhatsApp" }
        : { href: FAM_CHAT_URL, label: "Open the Fam chat" };
    case "call":
      return { href: "/client-calls", label: "Client calendar" };
    case "graphic":
      return { href: "/youtube", label: "Graphics Studio" };
    case "portal":
      return { href: "/clients/members", label: "Members" };
    default:
      return null;
  }
}
