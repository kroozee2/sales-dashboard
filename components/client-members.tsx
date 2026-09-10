"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * The Members roster, modelled on Helm's — which is the version of this screen
 * that gets used every day, so its shape is worth copying rather than inventing.
 *
 * Health tiles that double as filters, a filter separate from an ordering, one
 * dense row per member with the numbers you glance at and the actions you take,
 * and List or Gallery.
 *
 * Every field here writes to the client's own row, which is the same row Helm
 * and the Mastermind Portal read. There is no read-only client any more: the
 * old split between "Helm's roster" and "our records" is gone, and with it the
 * two-rows-per-person problem that made neither side trustworthy.
 */

import { useMemo, useState } from "react";
import type { MergedClient } from "@/lib/client-accounts";
import { CLIENT_STATUSES } from "@/lib/client-accounts";
import {
  HEALTH_META, ROSTER_FILTERS, ROSTER_VIEWS, ago, applyFilter, daysSince,
  groupRoster, rosterCounts, statusToHealth,
  type RosterFilter, type RosterView,
} from "@/lib/client-roster";
import {
  EMPTY_CASH, memberStage, money as cashMoney, MONTH_NAMES,
  type MemberCash, type MemberStage,
} from "@/lib/member-numbers";

const money = (n: number | null) =>
  n === null || n === undefined ? "—" : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
const telLink = (p: string | null) => (digits(p) ? `tel:${digits(p)}` : undefined);
const smsLink = (p: string | null) => (digits(p) ? `sms:${digits(p)}` : undefined);
const waLink = (p: string | null) => (digits(p) ? `https://wa.me/${digits(p)}` : undefined);
const mailLink = (e: string | null) => (e ? `mailto:${e}` : undefined);

export type Patch = Record<string, unknown>;

/** What the roster row cannot know on its own: stage, and the Portal numbers. */
export interface MemberExtra { stage: MemberStage; cash: MemberCash }

export default function ClientMembers({ clients, busyKey, onPatch, onOpen, helmUrl, extras, month }: {
  clients: MergedClient[];
  busyKey: string | null;
  onPatch: (client: MergedClient, patch: Patch) => void;
  onOpen: (client: MergedClient) => void;
  helmUrl: string;
  /** Keyed by the client's id, which is the same id the payload uses. */
  extras?: Map<string, MemberExtra>;
  /** 1-12, the month the cash columns are showing. */
  month?: number;
}) {
  const [filter, setFilter] = useState<RosterFilter>("all");
  // Opens grouped by status, which is what this screen is read by.
  const [view, setView] = useState<RosterView>("status");
  const [layout, setLayout] = useState<"list" | "gallery">("list");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => rosterCounts(clients), [clients]);
  const filtered = useMemo(() => applyFilter(clients, filter, query), [clients, filter, query]);
  /**
   * Where a member sits, read off the row as it is right now.
   *
   * The payload carries a stage too, but it is a snapshot: change someone's
   * status in this sheet and that snapshot is stale until the next fetch, so
   * the row would sit in the wrong group until a reload. Reading the live row
   * instead is what makes a status change move the member immediately.
   */
  const stageOf = useMemo(
    () => (client: MergedClient): MemberStage =>
      memberStage({ status: client.status, isActive: client.helm?.isActive ?? true }),
    [],
  );
  // `now` is left undefined so groupRoster uses its own default, the way it
  // did before: calling new Date() here would be impure during render.
  const groups = useMemo(() => groupRoster(filtered, view, undefined, stageOf), [filtered, view, stageOf]);
  const shown = groups.reduce((sum, group) => sum + group.clients.length, 0);

  const programs = useMemo(() => {
    const set = new Set<string>(["BOARDROOM", "LAUNCH", "7-Figure CEO"]);
    for (const client of clients) if (client.program?.trim()) set.add(client.program.trim());
    return [...set].sort();
  }, [clients]);

  return (
    <div className="space-y-4">
      {/* Health tiles double as filters, exactly as they do in Helm */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Onboarding" value={counts.onboarding} tone="blue" active={filter === "onboarding"} onClick={() => setFilter("onboarding")} />
        <Tile label="At Risk" value={counts.risk} tone="rose" active={filter === "risk"} onClick={() => setFilter("risk")} />
        <Tile label="Off-Track" value={counts.offtrack} tone="amber" active={filter === "offtrack"} onClick={() => setFilter("offtrack")} />
        <Tile label="On Track" value={counts.ontrack} tone="emerald" active={filter === "ontrack"} onClick={() => setFilter("ontrack")} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients…"
          aria-label="Search clients"
          className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none sm:max-w-xs" />
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
          {ROSTER_FILTERS.map((option) => (
            <button key={option.key} type="button" onClick={() => setFilter(option.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${filter === option.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
              {option.label}
              {option.key === "attention" && counts.attention > 0 && <span className="ml-1.5 text-xs opacity-70">{counts.attention}</span>}
              {option.key === "offboarded" && counts.offboarded > 0 && <span className="ml-1.5 text-xs opacity-70">{counts.offboarded}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
          {ROSTER_VIEWS.map((option) => (
            <button key={option.key} type="button" onClick={() => setView(option.key)} title={option.hint}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${view === option.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-shrink-0 gap-1 rounded-xl border border-zinc-800 bg-zinc-900/70 p-1 sm:ml-auto">
          {([["list", "☰ List"], ["gallery", "🖼️ Gallery"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setLayout(key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${layout === key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          {filter === "attention" ? "All clear. Nobody is at risk, off-track or overdue a conversation." : "No clients match."}
        </div>
      ) : layout === "gallery" ? (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key}>
              {group.label && <GroupHeading label={group.label} count={group.clients.length} />}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {group.clients.map((client) => (
                  <GalleryCard key={client.key} client={client} onOpen={() => onOpen(client)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key} className="overflow-hidden rounded-2xl border border-zinc-800">
              <header className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3.5 py-2">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  {group.label ? `${group.label} · ${group.clients.length}` : `${shown} member${shown === 1 ? "" : "s"}`}
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-700">Days since contact →</span>
              </header>
              <div className="divide-y divide-zinc-800/70">
                {group.clients.map((client) => (
                  <Row key={client.key} client={client} programs={programs} busy={busyKey === client.key}
                    onPatch={onPatch} onOpen={() => onOpen(client)} helmUrl={helmUrl}
                    cash={extras?.get(client.key)?.cash ?? EMPTY_CASH} month={month} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The three numbers a member sets for themselves in the Mastermind Portal.
 *
 * A dash means they have not set it, which is not the same as zero and is the
 * thing worth chasing. The year goal carries how many of the twelve months it
 * covers, because a "$60K year" built from three filled-in months is not a
 * year's goal yet.
 */
function CashChip({ icon, value, muted, tone, title, suffix }: {
  icon: string; value: string; muted: boolean; tone?: string; title: string; suffix?: string;
}) {
  return (
    <span title={title}
      className={`inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-1.5 py-1 text-[11px] font-semibold tabular-nums ${muted ? "text-zinc-600" : tone ?? "text-zinc-300"}`}>
      <span aria-hidden>{icon}</span>{value}
      {suffix && <span className="text-[10px] font-normal text-zinc-500">{suffix}</span>}
    </span>
  );
}

/**
 * The three numbers a member sets for themselves in the Mastermind Portal.
 *
 * A dash means they have not set it, which is not the same as zero and is the
 * thing worth chasing. The year goal carries how many of the twelve months it
 * covers, because a "$60K year" built from three filled-in months is not a
 * year's goal yet.
 *
 * These stay visible at every width, unlike the older Glance chips that hide
 * below lg: they are the reason this screen gets opened now, so losing them on
 * a laptop would defeat the point. The row already wraps, so they drop onto a
 * second line on a phone rather than overflowing.
 */
function CashCells({ cash, month, name }: { cash: MemberCash; month?: number; name: string }) {
  const monthName = month ? MONTH_NAMES[month - 1] : "This month";
  const pct = cash.monthPct;
  const tone = pct === null ? "text-zinc-300"
    : pct >= 100 ? "text-emerald-300"
      : pct >= 60 ? "text-amber-300" : "text-rose-300";

  return (
    <>
      <CashChip
        icon="🎯"
        value={cashMoney(cash.yearGoal)}
        muted={cash.yearGoal === null}
        suffix={cash.monthsSet > 0 && cash.monthsSet < 12 ? `${cash.monthsSet}/12` : undefined}
        title={cash.yearGoal === null
          ? `${name} has not set a cash goal in the Portal`
          : `${name}'s goal for the year — the sum of the ${cash.monthsSet} month${cash.monthsSet === 1 ? "" : "s"} they have filled in`}
      />
      <CashChip
        icon="📅"
        value={cashMoney(cash.monthGoal)}
        muted={cash.monthGoal === null}
        title={cash.monthGoal === null ? `No ${monthName} goal set` : `${monthName} goal`}
      />
      <CashChip
        icon="💵"
        value={cashMoney(cash.monthActual)}
        muted={cash.monthActual === null}
        tone={tone}
        suffix={pct === null ? undefined : `${pct}%`}
        title={cash.monthActual === null
          ? `${name} has not submitted a ${monthName} check-in`
          : `${monthName} cash collected${pct === null ? "" : ` — ${pct}% of goal`}`}
      />
    </>
  );
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-sm font-bold text-zinc-200">{label}</span>
      <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-500">{count}</span>
      <span className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}

const TILE_TONE: Record<string, { value: string; ring: string }> = {
  blue: { value: "text-blue-300", ring: "border-blue-500/40 bg-blue-500/10" },
  rose: { value: "text-rose-300", ring: "border-rose-500/40 bg-rose-500/10" },
  amber: { value: "text-amber-300", ring: "border-amber-500/40 bg-amber-500/10" },
  emerald: { value: "text-emerald-300", ring: "border-emerald-500/40 bg-emerald-500/10" },
};

function Tile({ label, value, tone, active, onClick }: {
  label: string; value: number; tone: keyof typeof TILE_TONE; active: boolean; onClick: () => void;
}) {
  const t = TILE_TONE[tone];
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${active ? t.ring : "border-zinc-800 bg-zinc-900/70 hover:border-zinc-700"}`}>
      <p className={`text-2xl font-bold tabular-nums ${value > 0 ? t.value : "text-zinc-600"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
    </button>
  );
}

function Avatar({ name, src, size = 40 }: { name: string; src: string | null; size?: number }) {
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  if (src) return <img src={src} alt="" width={size} height={size} className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.32 }}>{initials}</div>
  );
}

function Row({ client, programs, busy, onPatch, onOpen, helmUrl, cash, month }: {
  client: MergedClient; programs: string[]; busy: boolean;
  onPatch: (client: MergedClient, patch: Patch) => void;
  onOpen: () => void;
  helmUrl: string;
  cash: MemberCash;
  month?: number;
}) {
  const health = statusToHealth(client.status);
  const gap = daysSince(client.helm?.lastContactAt ?? null);
  const portal = client.helm?.portalStatus ?? null;

  return (
    <div className={`flex flex-col gap-2 p-3 transition-colors hover:bg-zinc-800/30 sm:flex-row sm:items-center sm:gap-3 ${busy ? "opacity-60" : ""}`}>
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left sm:flex-1">
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: HEALTH_META[health].dot }} aria-hidden />
        <Avatar name={client.name} src={client.helm?.headshotUrl ?? null} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <span className="truncate">{client.name}</span>
            {portal && (
              <span title={portal === "active" ? "In the app" : "Invited, has not logged in yet"}
                className={`flex-shrink-0 rounded px-1 py-0.5 text-[10px] ${portal === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}>
                📱{portal === "active" ? "✓" : ""}
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-zinc-500">
            {client.program || "No program"}
            {client.helm?.lastContactAt ? ` · last contact ${new Date(client.helm.lastContactAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : " · no contact logged"}
          </span>
        </span>
      </button>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 pl-[52px] sm:pl-0">
        <CashCells cash={cash} month={month} name={client.name} />
        <Glance icon="🎥" value={String(client.helm?.callsAttended ?? 0)} muted={!client.helm?.callsAttended}
          title={client.helm ? `${client.helm.callsAttended} calls attended` : "Helm has no call data"} />
        <MoneyField icon="💰" value={client.dealValue} busy={busy} title="Contract value"
          label={`Contract value for ${client.name}`} onSave={(next) => onPatch(client, { deal_value: next })} />
        <MoneyField icon="🔁" value={client.mrr} busy={busy} title="Monthly recurring"
          label={`Monthly recurring for ${client.name}`} onSave={(next) => onPatch(client, { mrr: next })} />
        <Glance icon="📱" value={ago(client.helm?.lastContactAt ?? null)} muted={!client.helm?.lastContactAt} title="Last contact" />

        <select value={client.program ?? ""} disabled={busy} aria-label={`Program for ${client.name}`}
          onChange={(e) => onPatch(client, { program: e.target.value })}
          className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-1.5 py-1 text-[11px] font-semibold text-zinc-200 focus:border-blue-500 focus:outline-none">
          <option value="">No program</option>
          {programs.map((program) => <option key={program} value={program}>{program}</option>)}
        </select>
        <DaysBadge days={gap} />
        <QuickAction href={telLink(client.phone)} title="Call" icon="📞" />
        <QuickAction href={smsLink(client.phone)} title="iMessage" icon="💬" />
        <QuickAction href={mailLink(client.email)} title="Email" icon="✉️" />
        <QuickAction href={waLink(client.whatsapp ?? client.phone)} title="WhatsApp" icon="🟢" external />
        {/* A status we do not recognise is shown as its own option rather than
            silently swapped for one we do: it is a real value someone typed. */}
        <select value={client.status ?? ""}
          disabled={busy} aria-label={`Status for ${client.name}`}
          onChange={(e) => onPatch(client, { status: e.target.value })}
          className={`rounded-lg border px-1.5 py-1 text-[11px] font-semibold focus:outline-none ${HEALTH_META[health].chip}`}>
          {!CLIENT_STATUSES.includes(client.status as never) && (
            <option value={client.status ?? ""} className="bg-zinc-900 text-white">{client.status || "No status"}</option>
          )}
          {CLIENT_STATUSES.map((status) => <option key={status} value={status} className="bg-zinc-900 text-white">{status}</option>)}
        </select>
        {client.helmId && (
          <a href={`${helmUrl.replace(/\/+$/, "")}/clients/${client.helmId}`} target="_blank" rel="noreferrer"
            title="Open in Helm" className="rounded-lg border border-zinc-800 px-1.5 py-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-300">↗</a>
        )}
      </div>
    </div>
  );
}

/**
 * A number you can edit in place. It commits on blur or Enter rather than on
 * every keystroke, so typing "12000" is one save and not five.
 */
function MoneyField({ icon, value, title, label, busy, onSave }: {
  icon: string; value: number | null; title: string; label: string; busy: boolean;
  onSave: (next: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null || value === undefined ? "" : String(value));
  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed.replace(/[^\d.-]/g, ""));
    setDraft(null);
    if (next !== null && !Number.isFinite(next)) return;
    if (next === (value ?? null)) return;
    onSave(next);
  };
  return (
    <span title={title}
      className={`hidden items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] tabular-nums lg:inline-flex ${draft === null ? "border-zinc-800 bg-zinc-950/60" : "border-blue-500/50 bg-blue-500/10"}`}>
      <span aria-hidden>{icon}</span>
      <input
        aria-label={label}
        value={shown}
        disabled={busy}
        inputMode="decimal"
        placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
        }}
        className={`w-14 bg-transparent text-right tabular-nums focus:outline-none ${value === null && draft === null ? "text-zinc-700" : "text-zinc-200"}`}
      />
    </span>
  );
}

function Glance({ icon, value, muted, title }: { icon: string; value: string; muted: boolean; title: string }) {
  return (
    <span title={title}
      className={`hidden items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-1.5 py-1 text-[11px] tabular-nums lg:inline-flex ${muted ? "text-zinc-700" : "text-zinc-300"}`}>
      <span aria-hidden>{icon}</span>{value}
    </span>
  );
}

/** How long since anyone spoke to them. Amber at a week, red at a fortnight. */
function DaysBadge({ days }: { days: number | null }) {
  const tone = days === null ? "border-zinc-800 text-zinc-700"
    : days >= 14 ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : days >= 7 ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-zinc-800 bg-zinc-950/60 text-zinc-400";
  return (
    <span title={days === null ? "No contact recorded in Helm" : `${days} days since last contact`}
      className={`rounded-lg border px-1.5 py-1 text-[11px] font-semibold tabular-nums ${tone}`}>
      {days === null ? "—" : `${days}d`}
    </span>
  );
}

function QuickAction({ href, title, icon, external }: { href?: string; title: string; icon: string; external?: boolean }) {
  if (!href) {
    return <span title={`${title} unavailable`} className="rounded-lg border border-zinc-800 px-1.5 py-1 text-[11px] text-zinc-800">{icon}</span>;
  }
  return (
    <a href={href} title={title} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-1.5 py-1 text-[11px] transition-colors hover:border-zinc-600">
      {icon}
    </a>
  );
}

function GalleryCard({ client, onOpen }: { client: MergedClient; onOpen: () => void }) {
  const health = statusToHealth(client.status);
  const gap = daysSince(client.helm?.lastContactAt ?? null);
  return (
    <button type="button" onClick={onOpen}
      className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 text-center transition-colors hover:border-zinc-700">
      <Avatar name={client.name} src={client.helm?.headshotUrl ?? null} size={56} />
      <span className="w-full">
        <span className="block truncate text-sm font-semibold text-white">{client.name}</span>
        <span className="block truncate text-[11px] text-zinc-500">{client.program || "No program"}</span>
      </span>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${HEALTH_META[health].chip}`}>
        {client.status || HEALTH_META[health].label}
      </span>
      <span className="flex w-full items-center justify-center gap-2 text-[10px] text-zinc-600">
        <span title="Calls attended">🎥 {client.helm?.callsAttended ?? 0}</span>
        <span title="Days since contact">⏳ {gap === null ? "—" : `${gap}d`}</span>
        {client.mrr ? <span title="Monthly recurring">🔁 {money(client.mrr)}</span> : null}
      </span>
    </button>
  );
}
