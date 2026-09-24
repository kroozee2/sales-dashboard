"use client";

import { useCallback, useEffect, useState } from "react";

type Action = {
  id: string; tool: string; summary: string; status: string;
  input: Record<string, unknown>; result: string | null;
  created_at: string; executed_at: string | null;
};

const TOOL_LABEL: Record<string, string> = {
  create_lead: "New lead",
  update_lead: "Lead update",
  add_lead_note: "Lead note",
  update_sales_call: "Call update",
  sync_fathom_to_call: "Fathom link",
};

/**
 * Jarvis proposes, Andrew decides. Nothing in here has happened yet: each card
 * is a change waiting on a click, and the same click cannot land twice because
 * the server only moves a row out of pending once.
 */
export default function JarvisApprovals({ onChanged }: { onChanged?: () => void }) {
  const [pending, setPending] = useState<Action[]>([]);
  const [recent, setRecent] = useState<Action[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        fetch("/api/jarvis/actions?status=pending", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/jarvis/actions?status=all", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setPending(p.actions ?? []);
      setRecent((a.actions ?? []).filter((x: Action) => x.status !== "pending").slice(0, 8));
    } catch { /* the chat still works without the queue */ }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(id: string, decision: "approve" | "discard") {
    setBusy(id); setError(null);
    const res = await fetch("/api/jarvis/actions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(body.error ?? "That did not go through.");
    await load();
    onChanged?.();
  }

  if (pending.length === 0 && recent.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {pending.length > 0 ? `${pending.length} change${pending.length === 1 ? "" : "s"} waiting on you` : "Nothing waiting"}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Jarvis proposes changes. Nothing is saved until you approve it here.
          </p>
        </div>
        {recent.length > 0 && (
          <button onClick={() => setShowDone((v) => !v)} className="text-xs text-zinc-500 hover:text-zinc-300">
            {showDone ? "hide" : "show"} recent
          </button>
        )}
      </div>

      {error && <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}

      <div className="mt-3 space-y-2">
        {pending.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              {TOOL_LABEL[a.tool] ?? a.tool}
            </span>
            <span className="min-w-0 flex-1 text-sm text-zinc-200">{a.summary}</span>
            <button onClick={() => void decide(a.id, "approve")} disabled={busy === a.id}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {busy === a.id ? "Saving…" : "Approve"}
            </button>
            <button onClick={() => void decide(a.id, "discard")} disabled={busy === a.id}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50">
              Discard
            </button>
          </div>
        ))}
      </div>

      {showDone && recent.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-white/10 pt-3">
          {recent.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs">
              <span className={
                a.status === "executed" ? "text-emerald-400"
                : a.status === "discarded" ? "text-zinc-600" : "text-rose-400"
              }>
                {a.status === "executed" ? "✓" : a.status === "discarded" ? "—" : "✕"}
              </span>
              <span className="truncate text-zinc-400">{a.summary}</span>
              <span className="ml-auto shrink-0 text-zinc-600">{a.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
