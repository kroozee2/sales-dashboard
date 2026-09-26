"use client";

/**
 * Events as a spreadsheet, by the month they actually happen.
 *
 * The old tab was a flat list of cards in date order, which answers "what is
 * next" but not "is every month covered". The goal is one conversion event a
 * month, and a list cannot show you the month you skipped — so every month gets
 * a row whether or not anything is in it, and an empty one says so.
 */

import { useMemo, useState } from "react";
import { EVENT_TYPES } from "@/lib/content-constants";
import {
  awaitingResults, completedTotals, coverage, groupByMonth, isComplete,
  isConversionEvent, spots, typeLabel, undated,
  type BoardEvent,
} from "@/lib/events-board";

const cell =
  "bg-transparent focus:bg-zinc-950 border border-transparent focus:border-blue-500/50 rounded-md px-2 py-1 text-sm focus:outline-none w-full transition-colors";

const money = (n: number | null) => (n === null || n === 0 ? "—" : `$${n.toLocaleString()}`);

const dayOf = (date: string | null) =>
  date ? new Date(`${date}T12:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric" }) : "—";

export default function EventsBoard({ events, onPatch, onDelete, onAdd, onOpen }: {
  events: BoardEvent[];
  onPatch: (id: string, update: Partial<BoardEvent>) => void;
  onDelete: (event: BoardEvent) => void;
  onAdd: (monthKey: string) => void;
  /** The full record — location, notes, the promo runway — which the row does not hold. */
  onOpen: (event: BoardEvent) => void;
}) {
  const [showPast, setShowPast] = useState(false);

  const planning = useMemo(() => events.filter((e) => !isComplete(e)), [events]);
  const done = useMemo(
    () => events.filter(isComplete).sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "")),
    [events],
  );
  const totals = useMemo(() => completedTotals(events), [events]);
  // Been and gone, never closed out. This is the nudge that keeps the numbers real.
  const toClose = useMemo(() => planning.filter((e) => awaitingResults(e)), [planning]);

  const groups = useMemo(() => groupByMonth(events), [events]);
  const cover = useMemo(() => coverage(groups), [groups]);
  const loose = useMemo(() => undated(planning), [planning]);
  const shown = showPast ? groups : groups.filter((g) => !g.isPast || g.events.length > 0);

  return (
    <div className="space-y-4">
      {/* The objective, and the months still missing it */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-white">
            One conversion event a month
            <span className="ml-2 text-xs font-normal text-zinc-500">
              {cover.covered} of {cover.total} months covered
            </span>
          </p>
          {cover.gaps.length > 0 && (
            <p className="text-xs text-amber-300">
              Nothing that converts in {cover.gaps.slice(0, 3).join(", ")}
              {cover.gaps.length > 3 ? ` and ${cover.gaps.length - 3} more` : ""}
            </p>
          )}
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {cover.months.map((month) => (
            <div key={month.key} title={`${month.label}: ${month.conversions} conversion event${month.conversions === 1 ? "" : "s"}`}
              className={`flex min-w-[54px] flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-1.5 ${
                month.covered ? "border-emerald-500/30 bg-emerald-500/10"
                  : month.isPast ? "border-zinc-800 bg-zinc-950/60"
                  : "border-amber-500/30 bg-amber-500/10"}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${month.isCurrent ? "text-white" : "text-zinc-500"}`}>
                {month.short}
              </span>
              <span className={`text-sm ${month.covered ? "text-emerald-300" : month.isPast ? "text-zinc-700" : "text-amber-300"}`}>
                {month.covered ? (month.conversions > 1 ? month.conversions : "✓") : month.isPast ? "–" : "○"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {toClose.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <span className="text-sm text-amber-200">
            {toClose.length} event{toClose.length === 1 ? " has" : "s have"} already happened and {toClose.length === 1 ? "has" : "have"} no result yet
          </span>
          <span className="text-xs text-zinc-400">{toClose.map((e) => e.title).slice(0, 3).join(", ")}</span>
          <button type="button" onClick={() => toClose.forEach((e) => onPatch(e.id, { completed_at: new Date().toISOString() }))}
            className="ml-auto rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 ring-1 ring-amber-400/30 transition hover:bg-amber-500/30">
            Mark {toClose.length === 1 ? "it" : "them all"} complete
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {planning.length} upcoming · {done.length} complete · a month turns green once something in it asks for money
        </p>
        <button type="button" onClick={() => setShowPast((v) => !v)}
          className="rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200">
          {showPast ? "Hide empty past months" : "Show all past months"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80 text-left text-[11px] uppercase tracking-wide text-zinc-400">
                <th className="w-20 whitespace-nowrap px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Event</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">Type</th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-semibold" title="Does this event ask for money?">Converts</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Price</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Signups</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Goal</th>
                <th className="w-40 whitespace-nowrap px-3 py-2 font-semibold">Spots left</th>
                <th className="px-3 py-2 font-semibold">Link</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            {shown.map((group) => (
              <tbody key={group.key}>
                <tr className={`border-y border-zinc-800 ${group.isCurrent ? "bg-blue-500/[0.07]" : "bg-zinc-950/80"}`}>
                  <td colSpan={10} className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${
                        group.covered ? "bg-emerald-500" : group.isPast ? "bg-zinc-700" : "bg-amber-500"}`} />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">{group.label}</span>
                      {group.isCurrent && <span className="rounded bg-blue-500/20 px-1.5 text-[10px] font-bold text-blue-300">THIS MONTH</span>}
                      {(() => {
                        const open = group.events.filter((e) => !isComplete(e)).length;
                        const closed = group.events.length - open;
                        return (
                          <span className="text-[11px] text-zinc-500">
                            {group.events.length === 0 ? "nothing planned"
                              : [open > 0 ? `${open} planned` : null, closed > 0 ? `${closed} complete` : null]
                                  .filter(Boolean).join(" · ")}
                          </span>
                        );
                      })()}
                      {!group.covered && !group.isPast && (
                        <span className="text-[11px] font-semibold text-amber-300">no conversion event</span>
                      )}
                      {!group.isPast && (
                        <button type="button" onClick={() => onAdd(group.key)}
                          className="ml-auto rounded-lg border border-zinc-700 px-2 py-0.5 text-[11px] font-semibold text-zinc-400 transition-colors hover:border-blue-500 hover:text-blue-300">
                          ＋ Add to {group.label.split(" ")[0]}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {group.events.filter((e) => !isComplete(e)).map((event, index) => (
                  <Row key={event.id} event={event} striped={index % 2 === 1} onPatch={onPatch} onDelete={onDelete} onOpen={onOpen} />
                ))}
              </tbody>
            ))}
            {loose.length > 0 && (
              <tbody>
                <tr className="border-y border-zinc-800 bg-zinc-950/80">
                  <td colSpan={10} className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-zinc-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">No date yet</span>
                      <span className="text-[11px] text-zinc-500">{loose.length} · give them a date to put them on a month</span>
                    </span>
                  </td>
                </tr>
                {loose.map((event, index) => (
                  <Row key={event.id} event={event} striped={index % 2 === 1} onPatch={onPatch} onDelete={onDelete} onOpen={onOpen} />
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>

      {done.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-emerald-500/20">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Complete</h3>
              <p className="mt-0.5 text-xs text-zinc-400">What each event actually did. Type straight into the cells.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <Stat label="Events" value={String(totals.events)} />
              <Stat label="Attended" value={totals.attended ? totals.attended.toLocaleString() : "—"} />
              <Stat label="Conversions" value={totals.conversions ? totals.conversions.toLocaleString() : "—"} tone="text-blue-300" />
              <Stat label="Revenue" value={money(totals.revenue)} tone="text-emerald-300" />
              <Stat label="Convert rate" value={totals.rate === null ? "—" : `${(totals.rate * 100).toFixed(0)}%`} />
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80 text-left text-[11px] uppercase tracking-wide text-zinc-400">
                  <th className="w-24 px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Event</th>
                  <th className="px-3 py-2 text-right font-semibold">Signups</th>
                  <th className="px-3 py-2 text-right font-semibold">Attended</th>
                  <th className="px-3 py-2 text-right font-semibold">Conversions</th>
                  <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                  <th className="px-3 py-2 text-right font-semibold" title="Conversions ÷ attended">Rate</th>
                  <th className="px-3 py-2 font-semibold">What happened</th>
                  <th className="w-20 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {done.map((event, index) => (
                  <DoneRow key={event.id} event={event} striped={index % 2 === 1} onPatch={onPatch} onOpen={onOpen} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "text-zinc-200" }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</span>
    </span>
  );
}

/** A finished event. Blank stays blank: an unrecorded number is not zero. */
function DoneRow({ event, striped, onPatch, onOpen }: {
  event: BoardEvent; striped: boolean;
  onPatch: (id: string, update: Partial<BoardEvent>) => void;
  onOpen: (event: BoardEvent) => void;
}) {
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0));
  const rate = event.attended && event.conversions ? event.conversions / event.attended : null;

  return (
    <tr className={`group border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/30 ${striped ? "bg-zinc-900/30" : ""}`}>
      <td className="whitespace-nowrap px-3 py-1.5 text-xs tabular-nums text-zinc-400">
        {event.start_date ? new Date(`${event.start_date}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
      </td>
      <td className="min-w-[180px] px-3 py-1.5">
        <button type="button" onClick={() => onOpen(event)} className="text-left text-sm font-semibold text-white hover:text-blue-300">
          {event.title}
        </button>
        <span className="ml-2 text-[11px] text-zinc-500">{typeLabel(event.event_type)}</span>
      </td>
      <td className="px-3 py-1.5 text-right text-sm tabular-nums text-zinc-400">{event.signups || "—"}</td>
      <td className="px-1 py-1.5">
        <input defaultValue={event.attended ?? ""} inputMode="numeric" placeholder="—" aria-label={`Attended at ${event.title}`}
          onBlur={(e) => { const v = num(e.target.value); if (v !== (event.attended ?? null)) onPatch(event.id, { attended: v }); }}
          className={`${cell} text-right tabular-nums text-zinc-200`} />
      </td>
      <td className="px-1 py-1.5">
        <input defaultValue={event.conversions ?? ""} inputMode="numeric" placeholder="—" aria-label={`Conversions from ${event.title}`}
          onBlur={(e) => { const v = num(e.target.value); if (v !== (event.conversions ?? null)) onPatch(event.id, { conversions: v }); }}
          className={`${cell} text-right font-semibold tabular-nums text-blue-300`} />
      </td>
      <td className="px-1 py-1.5">
        <input defaultValue={event.revenue ?? ""} inputMode="decimal" placeholder="—" aria-label={`Revenue from ${event.title}`}
          onBlur={(e) => { const v = num(e.target.value); if (v !== (event.revenue ?? null)) onPatch(event.id, { revenue: v }); }}
          className={`${cell} text-right font-semibold tabular-nums text-emerald-300`} />
      </td>
      <td className="px-3 py-1.5 text-right text-sm tabular-nums text-zinc-400">
        {rate === null ? "—" : `${(rate * 100).toFixed(0)}%`}
      </td>
      <td className="min-w-[200px] px-1 py-1.5">
        <input defaultValue={event.recap ?? ""} placeholder="what worked, what to change" aria-label={`Recap for ${event.title}`}
          onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (event.recap ?? null)) onPatch(event.id, { recap: v }); }}
          className={`${cell} text-xs text-zinc-400`} />
      </td>
      <td className="px-2 py-1.5 text-right">
        <button type="button" onClick={() => onPatch(event.id, { completed_at: null })} title="Move back to planning"
          className="rounded px-1.5 py-1 text-[11px] text-zinc-600 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-300 group-hover:opacity-100">
          reopen
        </button>
      </td>
    </tr>
  );
}

function Row({ event, striped, onPatch, onDelete, onOpen }: {
  event: BoardEvent; striped: boolean;
  onPatch: (id: string, update: Partial<BoardEvent>) => void;
  onDelete: (event: BoardEvent) => void;
  onOpen: (event: BoardEvent) => void;
}) {
  const seat = spots(event);
  const converts = isConversionEvent(event);

  return (
    <tr className={`group border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/30 ${striped ? "bg-zinc-900/30" : ""}`}>
      <td className="px-2 py-1.5 align-middle whitespace-nowrap">
        <input type="date" defaultValue={event.start_date ?? ""} aria-label={`Date for ${event.title}`}
          onBlur={(e) => { const v = e.target.value || null; if (v !== event.start_date) onPatch(event.id, { start_date: v }); }}
          className={`${cell} text-xs tabular-nums text-zinc-300`} title={dayOf(event.start_date)} />
      </td>
      <td className="min-w-[200px] px-1 py-1.5 align-middle">
        <input defaultValue={event.title} aria-label="Event title"
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== event.title) onPatch(event.id, { title: v }); }}
          className={`${cell} font-semibold text-white`} />
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-middle">
        <select value={event.event_type} aria-label={`Type for ${event.title}`}
          onChange={(e) => onPatch(event.id, { event_type: e.target.value })}
          className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-[11px] font-semibold text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
          {EVENT_TYPES.map((t) => <option key={t.key} value={t.key} className="bg-zinc-900 text-zinc-200">{t.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-1.5 text-center align-middle">
        <span title={converts ? `${typeLabel(event.event_type)} asks for money` : "Builds the audience rather than converting it"}
          className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
            converts ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-600"}`}>
          {converts ? "✓" : "—"}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right align-middle">
        <input defaultValue={event.price ?? ""} inputMode="decimal" placeholder="—" aria-label={`Price for ${event.title}`}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const next = raw === "" ? null : Number(raw.replace(/[^\d.]/g, ""));
            if (next !== null && !Number.isFinite(next)) return;
            if (next !== (event.price ?? null)) onPatch(event.id, { price: next });
          }}
          className={`${cell} text-right tabular-nums text-zinc-300`} />
      </td>
      <td className="px-2 py-1.5 text-right align-middle">
        <input defaultValue={String(event.signups ?? 0)} inputMode="numeric" aria-label={`Signups for ${event.title}`}
          onBlur={(e) => {
            const next = Math.max(0, Math.floor(Number(e.target.value.replace(/[^\d]/g, "")) || 0));
            if (next !== (event.signups ?? 0)) onPatch(event.id, { signups: next });
          }}
          className={`${cell} text-right font-semibold tabular-nums text-white`} />
      </td>
      <td className="px-2 py-1.5 text-right align-middle">
        <input defaultValue={event.spots_goal ?? ""} inputMode="numeric" placeholder="—" aria-label={`Seat goal for ${event.title}`}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const next = raw === "" ? null : Math.max(0, Math.floor(Number(raw.replace(/[^\d]/g, "")) || 0));
            if (next !== (event.spots_goal ?? null)) onPatch(event.id, { spots_goal: next });
          }}
          className={`${cell} text-right tabular-nums text-zinc-400`} />
      </td>
      <td className="px-3 py-1.5 align-middle">
        {seat.has ? (
          <div title={`${seat.filled} of ${seat.goal} taken`}>
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
              <span className={`font-semibold tabular-nums ${seat.full ? "text-emerald-300" : "text-zinc-200"}`}>
                {seat.full ? "Full" : `${seat.remaining} left`}
              </span>
              <span className="tabular-nums text-zinc-600">{seat.pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div className={`h-full rounded-full transition-[width] duration-500 ${seat.full ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${seat.pct}%` }} />
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-zinc-700">Set a goal</span>
        )}
      </td>
      <td className="min-w-[180px] px-1 py-1.5 align-middle">
        <div className="flex items-center gap-1">
          <input defaultValue={event.page_url ?? ""} placeholder="https://…" aria-label={`Signup link for ${event.title}`}
            onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== event.page_url) onPatch(event.id, { page_url: v }); }}
            className={`${cell} text-xs text-zinc-400`} />
          {event.page_url && (
            <a href={event.page_url} target="_blank" rel="noreferrer" title="Open the signup page"
              className="flex-shrink-0 rounded px-1 text-xs text-zinc-600 hover:text-blue-300">↗</a>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-center align-middle">
        <button type="button" onClick={() => onPatch(event.id, { completed_at: new Date().toISOString() })}
          aria-label={`Mark ${event.title} complete`} title="It has run. Move it to Complete and record the result."
          className="text-xs text-zinc-700 opacity-0 transition-opacity hover:text-emerald-300 group-hover:opacity-100">✓</button>
        <button type="button" onClick={() => onOpen(event)} aria-label={`Open ${event.title}`}
          title="Location, notes and the promo runway"
          className="ml-1 text-xs text-zinc-700 opacity-0 transition-opacity hover:text-blue-300 group-hover:opacity-100">✏️</button>
        <button type="button" onClick={() => onDelete(event)} aria-label={`Remove ${event.title}`}
          className="ml-1 text-xs text-zinc-700 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100">🗑</button>
      </td>
    </tr>
  );
}

export { money };
