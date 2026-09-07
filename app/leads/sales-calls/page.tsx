"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { callViewState, isBookedSalesCall, leadStageForCall, shouldOpenSalesCallRow } from "@/lib/sales-call-leads";
import type { CallResult, SalesCall } from "@/lib/supabase-calls";

const RESULT_OPTIONS: CallResult[] = [
  "🔜 Upcoming",
  "📣 Follow Up",
  "✅ Sale",
  "❌ Did Not Close",
  "👻 No Show",
  "➖ Other",
];

type LeadSync = {
  status: "updated" | "unchanged" | "unmatched" | "ambiguous" | "error";
  method?: "email" | "phone" | "name";
  count?: number;
  stage?: string;
  message?: string;
};

type DialogFeedback = { message: string; role: "status" | "alert" };

function callTime(value: string | null): string {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: value.includes("T") ? "numeric" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined,
  });
}

function syncMessage(sync: LeadSync | undefined): string {
  if (!sync) return "Call saved.";
  if (sync.status === "updated") return sync.stage ? `Call saved. Lead moved to ${sync.stage}.` : "Call and lead notes saved.";
  if (sync.status === "ambiguous") return `Call saved. Lead stage was not changed because ${sync.count ?? "multiple"} exact ${sync.method ?? "identity"} matches were found.`;
  if (sync.status === "unmatched") return "Call saved. No exact lead match was found, so no lead was changed.";
  if (sync.status === "error") return `Call saved, but the lead could not be updated${sync.message ? `: ${sync.message}` : "."}`;
  return "Call saved. The linked lead already has the correct stage.";
}

function resultPatch(result: CallResult): Partial<SalesCall> {
  if (result === "🔜 Upcoming") return { result, showed: null, success: null };
  if (result === "👻 No Show") return { result, showed: false, success: false };
  if (result === "✅ Sale") return { result, showed: true, success: true };
  if (result === "📣 Follow Up") return { result, showed: true, success: false };
  return { result, success: false };
}

export default function LeadsSalesCallsPage() {
  const [calls, setCalls] = useState<SalesCall[]>([]);
  const [selected, setSelected] = useState<SalesCall | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [dialogFeedback, setDialogFeedback] = useState<DialogFeedback | null>(null);
  const [showMovedOff, setShowMovedOff] = useState(false);
  const [search, setSearch] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const busyRef = useRef(new Set<string>());
  const busyGenerationByIdRef = useRef(new Map<string, number>());
  const dialogOperationGenerationRef = useRef(0);
  const selectedCallIdRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const fallbackFocusRef = useRef<HTMLInputElement>(null);

  function openDialog(row: SalesCall, opener: HTMLElement) {
    dialogOperationGenerationRef.current += 1;
    selectedCallIdRef.current = row.id;
    openerRef.current = opener;
    setDialogFeedback(null);
    setSelected(row);
  }

  function closeDialog() {
    dialogOperationGenerationRef.current += 1;
    selectedCallIdRef.current = null;
    setDialogFeedback(null);
    setSelected(null);
    const opener = openerRef.current;
    openerRef.current = null;
    requestAnimationFrame(() => {
      const openerCanReceiveFocus = opener?.isConnected
        && !opener.matches(":disabled, [aria-hidden='true']")
        && !opener.closest("[inert]");
      (openerCanReceiveFocus ? opener : fallbackFocusRef.current)?.focus();
    });
  }

  useEffect(() => {
    let current = true;
    fetch("/api/sales-calls")
      .then(async (response) => {
        const data = await response.json() as { calls?: SalesCall[]; error?: string };
        if (!response.ok || data.error) throw new Error(data.error || "Unable to load sales calls");
        if (current) setCalls(data.calls ?? []);
      })
      .catch((reason) => current && setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => current && setLoading(false));
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (!dialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // selected ID intentionally owns one dialog opening; saves must not reset focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const rows = useMemo(() => {
    const now = new Date();
    const normalizedSearch = search.trim().toLowerCase();
    const eligible = calls.filter((row) => row.call_type === "📞 Sales Call" && row.confirmed === "✅ Confirmed");
    const selectedRows = showMovedOff
      ? eligible.filter((row) => callViewState(row, now) !== "booked").sort((a, b) => (b.call_date ?? "").localeCompare(a.call_date ?? ""))
      : eligible.filter((row) => isBookedSalesCall(row, now)).sort((a, b) => (a.call_date ?? "").localeCompare(b.call_date ?? ""));
    if (!normalizedSearch) return selectedRows;
    return selectedRows.filter((row) => [row.name, row.email, row.phone].some((value) => value?.toLowerCase().includes(normalizedSearch)));
  }, [calls, search, showMovedOff]);

  async function updateCall(id: string, patch: Partial<SalesCall> | { booked_view_action: "move_off" | "restore"; expected_updated_at: string; booked_view_revision?: string }, origin: "page" | "dialog" = "page") {
    if (busyRef.current.has(id)) return;
    const operationGeneration = dialogOperationGenerationRef.current + 1;
    dialogOperationGenerationRef.current = operationGeneration;
    const dialogCallId = origin === "dialog" ? selectedCallIdRef.current : null;
    const ownsDialogFeedback = () => origin === "dialog"
      && dialogOperationGenerationRef.current === operationGeneration
      && dialogCallId === id
      && selectedCallIdRef.current === id;
    busyRef.current.add(id);
    busyGenerationByIdRef.current.set(id, operationGeneration);
    setBusyIds((current) => new Set(current).add(id));
    setNotice(null);
    setMutationError(null);
    setDialogFeedback(null);
    try {
      const response = await fetch("/api/sales-calls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const ownsDialogAfterResponse = ownsDialogFeedback();
      const data = await response.json() as { call?: SalesCall; leadSync?: LeadSync; error?: string };
      const ownsDialogAfterBody = ownsDialogAfterResponse && ownsDialogFeedback();
      if (!response.ok || !data.call) throw new Error(data.error || "Unable to save call");
      setCalls((current) => current.map((row) => row.id === id ? data.call! : row));
      setSelected((current) => current?.id === id ? data.call! : current);
      const message = syncMessage(data.leadSync);
      if (origin === "dialog") {
        const partial = data.leadSync && !["updated", "unchanged"].includes(data.leadSync.status);
        if (ownsDialogAfterBody && ownsDialogFeedback()) {
          setDialogFeedback({ message, role: partial ? "alert" : "status" });
        }
      } else {
        setNotice(message);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (origin === "dialog") {
        if (ownsDialogFeedback()) setDialogFeedback({ message, role: "alert" });
      } else setMutationError(message);
    } finally {
      if (busyGenerationByIdRef.current.get(id) === operationGeneration) {
        busyGenerationByIdRef.current.delete(id);
        busyRef.current.delete(id);
        setBusyIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-4 text-zinc-100">
      <div inert={selected ? true : undefined} aria-hidden={selected ? true : undefined}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sales Calls</h1>
          <p className="mt-1 text-sm text-zinc-500">Confirmed upcoming sales calls from SalesOS. Record attendance and an outcome to update the matched lead safely.</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300">
          <input type="checkbox" checked={showMovedOff} onChange={(event) => setShowMovedOff(event.target.checked)} className="h-4 w-4 accent-violet-500" />
          Show moved off / history
        </label>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="sales-call-search">Search sales calls</label>
        <input ref={fallbackFocusRef} id="sales-call-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or phone…" className="min-h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-base outline-none focus:border-violet-500 sm:max-w-md sm:text-sm" />
        <p className="text-sm text-zinc-500" aria-live="polite">{rows.length} {showMovedOff ? "moved-off or historical" : "upcoming booked"} call{rows.length === 1 ? "" : "s"}</p>
      </div>

      {notice && <div role="status" className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">{notice}</div>}
      {mutationError && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{mutationError}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <caption className="sr-only">{showMovedOff ? "Sales calls moved off the booked view and call history" : "Confirmed upcoming booked sales calls"}</caption>
          <thead className="border-b border-zinc-800 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th scope="col" className="px-4 py-3">Person</th>
              <th scope="col" className="px-4 py-3">Call date</th>
              <th scope="col" className="px-4 py-3">Attendance</th>
              <th scope="col" className="px-4 py-3">Outcome</th>
              <th scope="col" className="px-4 py-3">Lead placement</th>
              <th scope="col" className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500">Loading real SalesOS sales calls…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500">{showMovedOff ? "No moved-off sales calls match this view." : "No confirmed upcoming sales calls are booked."}</td></tr>
            ) : rows.map((row) => {
              const stage = leadStageForCall(row);
              const busy = busyIds.has(row.id);
              return (
                <tr key={row.id} tabIndex={0} onClick={(event) => openDialog(row, event.currentTarget)} onKeyDown={(event) => { if (shouldOpenSalesCallRow(event)) { event.preventDefault(); openDialog(row, event.currentTarget); } }} className="cursor-pointer hover:bg-zinc-800/60 focus:bg-zinc-800/60 focus:outline-none">
                  <th scope="row" className="px-4 py-3 font-medium text-white">
                    <span className="block">{row.name || "Name unavailable"}</span>
                    <span className="block max-w-64 break-all text-xs font-normal text-zinc-500">{row.email || row.phone || "Contact unavailable"}</span>
                  </th>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-300">{callTime(row.call_date)}</td>
                  <td className="px-4 py-3">{row.showed === true ? "✅ Showed" : row.showed === false ? "👻 Did not show" : "— Unrecorded"}</td>
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <label className="sr-only" htmlFor={`result-${row.id}`}>Outcome for {row.name || "sales call"}</label>
                    <select id={`result-${row.id}`} value={row.result ?? "🔜 Upcoming"} disabled={busy} onChange={(event) => updateCall(row.id, resultPatch(event.target.value as CallResult))} className="min-h-11 w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-base disabled:opacity-50 sm:text-sm">
                      {RESULT_OPTIONS.map((result) => <option key={result}>{result}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{stage ?? (row.showed !== true && (row.result === "📣 Follow Up" || row.result === "✅ Sale") ? "Attendance required; unchanged" : "No automatic stage change")}</td>
                  <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    {callViewState(row) === "moved-off" ? (
                      <button disabled={busy} onClick={() => updateCall(row.id, { booked_view_action: "restore", expected_updated_at: row.updated_at, booked_view_revision: row.booked_view_revision })} aria-label={`Restore natural call view: ${row.name || "unnamed person"}`} className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-800 px-3 font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                        {busy ? "Saving…" : "Restore view"}
                      </button>
                    ) : callViewState(row) === "booked" ? (
                      <button disabled={busy} onClick={() => updateCall(row.id, { booked_view_action: "move_off", expected_updated_at: row.updated_at })} aria-label={`Move off booked calls: ${row.name || "unnamed person"}`} className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-800 px-3 font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                        {busy ? "Saving…" : "Move off"}
                      </button>
                    ) : <span className="text-zinc-500">{callViewState(row) === "completed" ? "Completed" : "Past"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      </div>
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/65" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="sales-call-editor-title" className="h-full w-full max-w-lg overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">Sales call</p>
                <h2 id="sales-call-editor-title" className="mt-1 text-xl font-bold text-white">{selected.name || "Name unavailable"}</h2>
                <p className="mt-1 text-sm text-zinc-500">{callTime(selected.call_date)}</p>
              </div>
              <button ref={closeButtonRef} onClick={closeDialog} aria-label="Close sales call editor" className="min-h-11 min-w-11 rounded-xl border border-zinc-800 text-xl text-zinc-400 hover:text-white">×</button>
            </div>

            <div className="space-y-5">
              {dialogFeedback && (
                <div
                  role={dialogFeedback.role}
                  aria-live={dialogFeedback.role === "alert" ? "assertive" : "polite"}
                  aria-atomic="true"
                  className={`rounded-xl border px-4 py-3 text-sm ${dialogFeedback.role === "alert" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}
                >
                  {dialogFeedback.message}
                </div>
              )}
              <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm sm:grid-cols-2">
                <div className="break-all"><span className="block text-xs text-zinc-500">Email</span>{selected.email || "—"}</div>
                <div className="break-all"><span className="block text-xs text-zinc-500">Phone</span>{selected.phone || "—"}</div>
              </div>
              <label className="block text-sm font-medium text-zinc-300">Attendance
                <select aria-label={`Attendance for ${selected.name || "sales call"}`} value={selected.showed === true ? "showed" : selected.showed === false ? "no-show" : "unknown"} disabled={busyIds.has(selected.id)} onChange={(event) => {
                  const value = event.target.value;
                  if (value === "no-show") updateCall(selected.id, { showed: false, success: false, result: "👻 No Show" }, "dialog");
                  else updateCall(selected.id, { showed: value === "showed" ? true : null }, "dialog");
                }} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-base sm:text-sm">
                  <option value="unknown">— Attendance unrecorded</option>
                  <option value="showed">✅ Showed</option>
                  <option value="no-show">👻 Did not show</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-zinc-300">Outcome
                <select aria-label={`Outcome for ${selected.name || "sales call"}`} value={selected.result ?? "🔜 Upcoming"} disabled={busyIds.has(selected.id)} onChange={(event) => updateCall(selected.id, resultPatch(event.target.value as CallResult), "dialog")} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-base sm:text-sm">
                  {RESULT_OPTIONS.map((result) => <option key={result}>{result}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-zinc-300">Follow-up date
                <input type="date" value={selected.follow_up_date ?? ""} disabled={busyIds.has(selected.id)} onChange={(event) => updateCall(selected.id, { follow_up_date: event.target.value || null }, "dialog")} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-base sm:text-sm" />
              </label>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
                <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Lead stage effect</span>
                <p className="mt-2">{leadStageForCall(selected) ?? "This attendance/outcome does not force a lead stage change."}</p>
              </div>
              {callViewState(selected) === "booked" && (
                <button disabled={busyIds.has(selected.id)} onClick={() => updateCall(selected.id, { booked_view_action: "move_off", expected_updated_at: selected.updated_at }, "dialog")} className="min-h-11 w-full rounded-xl bg-violet-600 px-4 font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
                  {busyIds.has(selected.id) ? "Saving…" : "Move off booked calls"}
                </button>
              )}
              {callViewState(selected) === "moved-off" && (
                <button disabled={busyIds.has(selected.id)} onClick={() => updateCall(selected.id, { booked_view_action: "restore", expected_updated_at: selected.updated_at, booked_view_revision: selected.booked_view_revision }, "dialog")} className="min-h-11 w-full rounded-xl bg-violet-600 px-4 font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
                  {busyIds.has(selected.id) ? "Saving…" : "Restore natural call view"}
                </button>
              )}
              <p className="text-xs text-zinc-500">Moving off uses a reversible view marker and preserves the call outcome, attendance, and success evidence. Restoring returns the call to its truthful upcoming, completed, or past view.</p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
