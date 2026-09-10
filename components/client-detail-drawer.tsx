"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * One client, everything we know, without leaving Sales OS.
 *
 * Clicking a name used to open the onboarding runbook and nothing else, so
 * anything real — their calls, their numbers, what they owe you — meant opening
 * Helm. Helm's ClientDetail carries eleven sections; this carries the ones with
 * data behind them, reading the client's own record.
 *
 * Laid out the way Helm's is: one running page with a sticky pill nav that
 * jumps between sections and lights up as you scroll past them. Tabs hide
 * everything you are not looking at, which is the wrong trade on a screen you
 * open to get your bearings on someone.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MergedClient } from "@/lib/client-accounts";
import {
  DETAIL_TABS, EMPTY_DETAIL, latestMonth, tabCounts,
  type CheckInRecord, type ClientDetail, type ClientGraphics, type DetailTab,
} from "@/lib/client-detail";
import { RUNBOOK, onboardingProgress } from "@/lib/client-accounts";
import { HEALTH_META, ago, daysSince, statusToHealth } from "@/lib/client-roster";
import type { Patch } from "@/components/client-onboarding";

const money = (n: number | null) =>
  n === null || n === undefined ? "—" : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

const day = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ClientDetailDrawer({ client, onClose, onPatch, helmUrl }: {
  client: MergedClient;
  onClose: () => void;
  onPatch: (client: MergedClient, patch: Patch) => void;
  helmUrl: string;
}) {
  const [active, setActive] = useState<DetailTab>("overview");
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; detail: ClientDetail } | { status: "error"; message: string }
  >({ status: "loading" });
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/clients/${client.key}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load this client");
        setState({ status: "ready", detail: payload as ClientDetail });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setState({ status: "error", message: reason instanceof Error ? reason.message : "Could not load this client" });
      });
    return () => controller.abort();
  }, [client.key]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const detail = state.status === "ready" ? state.detail : EMPTY_DETAIL;

  // Scroll position drives the active pill, so the nav always says where you
  // are rather than where you last clicked.
  useEffect(() => {
    if (state.status !== "ready") return;
    const root = scroller.current;
    if (!root) return;
    const sections = DETAIL_TABS
      .map((t) => root.querySelector<HTMLElement>(`#sec-${t.id}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id.replace("sec-", "") as DetailTab);
      },
      { root, rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [state.status]);

  const jump = (id: DetailTab) => {
    setActive(id);
    scroller.current?.querySelector(`#sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const counts = useMemo(() => tabCounts(detail), [detail]);
  const month = useMemo(() => latestMonth(detail.checkIns), [detail.checkIns]);
  const health = statusToHealth(client.status);
  const gap = daysSince(client.helm?.lastContactAt ?? null);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside role="dialog" aria-label={`${client.name} details`}
        className="flex h-full w-full max-w-3xl flex-col border-l border-zinc-800 bg-zinc-950">

        <header className="border-b border-zinc-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {client.helm?.headshotUrl
                ? <img src={client.helm.headshotUrl} alt="" width={44} height={44} className="h-11 w-11 flex-shrink-0 rounded-full object-cover" />
                : <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-sm font-bold text-white">
                    {client.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </span>}
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">{client.name}</h2>
                <p className="truncate text-xs text-zinc-500">
                  {client.program || "No program"}
                  {client.email ? ` · ${client.email}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <a href={`${helmUrl.replace(/\/+$/, "")}/clients/${client.key}`} target="_blank" rel="noreferrer"
                title="Open in Helm"
                className="rounded-lg border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-200">Helm ↗</a>
              <button type="button" onClick={onClose} aria-label="Close"
                className="text-2xl leading-none text-zinc-500 hover:text-white">&times;</button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`rounded-full border px-2 py-0.5 font-semibold ${HEALTH_META[health].chip}`}>
              {client.status || HEALTH_META[health].label}
            </span>
            <Chip label="Deal" value={money(client.dealValue)} />
            <Chip label="MRR" value={money(client.mrr)} />
            <Chip label="Last contact" value={gap === null ? "never" : ago(client.helm?.lastContactAt ?? null)} tone={gap !== null && gap >= 14 ? "warn" : undefined} />
            {month && <Chip label={month.monthLabel ?? "Latest month"} value={money(month.cashCollected)} />}
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-3 py-2" aria-label="Client sections">
          {DETAIL_TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => jump(t.id)} aria-current={active === t.id ? "true" : undefined}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                active === t.id ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"}`}>
              <span aria-hidden>{t.icon}</span>{t.label}
              {counts[t.id] > 0 && (
                <span className={`rounded px-1 text-[10px] tabular-nums ${active === t.id ? "bg-blue-500/40 text-white" : "bg-zinc-700/70 text-zinc-300"}`}>{counts[t.id]}</span>
              )}
            </button>
          ))}
        </nav>

        <div ref={scroller} className="flex-1 overflow-y-auto p-5">
          {state.status === "loading" ? (
            <div className="space-y-2" aria-label="Loading client">
              {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-900" />)}
            </div>
          ) : state.status === "error" ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-200">{state.message}</p>
          ) : (
            <div className="space-y-8">
              {DETAIL_TABS.map((t) => (
                <section key={t.id} id={`sec-${t.id}`} className="scroll-mt-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                    <span aria-hidden>{t.icon}</span>{t.label}
                    <span className="h-px flex-1 bg-zinc-800" />
                    {counts[t.id] > 0 && <span className="text-[11px] font-semibold tabular-nums text-zinc-600">{counts[t.id]}</span>}
                  </h3>
                  <Section tab={t.id} client={client} detail={detail} onPatch={onPatch} />
                </section>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <span className={`rounded-lg border px-2 py-0.5 tabular-nums ${
      tone === "warn" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-zinc-800 bg-zinc-900 text-zinc-400"}`}>
      <span className="text-zinc-600">{label}</span> <span className="font-semibold text-zinc-200">{value}</span>
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-600">{children}</p>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5">{children}</div>;
}

function Section({ tab, client, detail, onPatch }: {
  tab: DetailTab; client: MergedClient; detail: ClientDetail;
  onPatch: (client: MergedClient, patch: Patch) => void;
}) {
  if (tab === "overview") return <Overview client={client} detail={detail} onPatch={onPatch} />;

  if (tab === "calls") {
    if (!detail.calls.length) return <Empty>No calls on this client&rsquo;s record.</Empty>;
    return (
      <div className="space-y-2">
        {detail.calls.map((call) => (
          <Card key={call.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-semibold text-white">
                {call.isGroup ? "👥 " : "🧑‍💼 "}{call.title ?? (call.isGroup ? "Group call" : "1:1 call")}
              </p>
              <span className="flex-shrink-0 text-[11px] tabular-nums text-zinc-500">{day(call.callDate) ?? "No date"}</span>
            </div>
            {call.summary && <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-zinc-400">{call.summary}</p>}
            {call.nextSteps && <p className="mt-1.5 text-xs text-emerald-300/90"><span className="text-zinc-600">Next: </span>{call.nextSteps}</p>}
            {call.fathomUrl && (
              <a href={call.fathomUrl} target="_blank" rel="noreferrer"
                className="mt-2 inline-block text-[11px] font-semibold text-blue-400 hover:text-blue-300">Recording ↗</a>
            )}
          </Card>
        ))}
      </div>
    );
  }

  if (tab === "todos") {
    if (!detail.todos.length) return <Empty>Nothing on this client&rsquo;s to-do list.</Empty>;
    return (
      <div className="space-y-1.5">
        {detail.todos.map((todo) => (
          <div key={todo.id} className={`flex items-start gap-3 rounded-xl border border-zinc-800 p-3 ${todo.done ? "opacity-45" : "bg-zinc-900/50"}`}>
            <span aria-hidden className="mt-0.5 text-sm">{todo.done ? "✅" : "⬜️"}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${todo.done ? "text-zinc-500 line-through" : "font-medium text-white"}`}>{todo.title}</p>
              {todo.description && <p className="mt-0.5 text-xs text-zinc-500">{todo.description}</p>}
              <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-600">
                {todo.dueDate && <span>Due {day(todo.dueDate)}</span>}
                {todo.owner && <span>{todo.owner}</span>}
                {todo.urgency && <span>{todo.urgency}</span>}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tab === "checkins") {
    if (!detail.checkIns.length) return <Empty>No monthly check-ins submitted.</Empty>;
    return <div className="space-y-2">{detail.checkIns.map((c) => <CheckIn key={c.id} row={c} />)}</div>;
  }

  if (tab === "goals") {
    if (!detail.cashGoals.length) return <Empty>No cash goals set for this client.</Empty>;
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {detail.cashGoals.map((goal) => (
          <div key={goal.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {MONTHS[goal.month - 1] ?? goal.month} {goal.year}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-300">{money(goal.goal)}</p>
          </div>
        ))}
      </div>
    );
  }

  if (tab === "projects") {
    if (!detail.projects.length) return <Empty>No projects on this client&rsquo;s record.</Empty>;
    return (
      <div className="space-y-1.5">
        {detail.projects.map((project) => (
          <div key={project.id} className={`rounded-xl border border-zinc-800 p-3 ${project.done ? "opacity-45" : "bg-zinc-900/50"}`}>
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              {project.isFocus && <span title="Current focus" aria-label="Current focus">🎯</span>}
              <span className={project.done ? "text-zinc-500 line-through" : ""}>{project.name}</span>
            </p>
            {project.note && <p className="mt-1 text-xs text-zinc-500">{project.note}</p>}
            {project.dueDate && <p className="mt-1 text-[11px] text-zinc-600">Due {day(project.dueDate)}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (tab === "proof") {
    if (!detail.proof.length) return <Empty>No proof or testimonials recorded.</Empty>;
    return (
      <div className="space-y-2">
        {detail.proof.map((item) => (
          <Card key={item.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-400">
                {item.kind === "proof" ? "Proof" : "Testimonial"}{item.headline ? ` · ${item.headline}` : ""}
              </span>
              <span className="flex-shrink-0 text-[11px] text-zinc-600">{day(item.date)}</span>
            </div>
            {item.body && <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{item.body}</p>}
            {item.mediaUrl && (
              <a href={item.mediaUrl} target="_blank" rel="noreferrer"
                className="mt-2 inline-block text-[11px] font-semibold text-blue-400 hover:text-blue-300">Open media ↗</a>
            )}
          </Card>
        ))}
      </div>
    );
  }

  if (tab === "graphics") return <Graphics graphics={detail.graphics} name={client.name} />;

  return <Onboarding client={client} />;
}

/**
 * The welcome kit. Helm generates these when someone joins and shows them on
 * the client; Sales OS was storing the URLs and rendering none of them.
 */
function Graphics({ graphics, name }: { graphics: ClientGraphics; name: string }) {
  const shots = [
    graphics.headshotUrl ? { label: "Headshot", url: graphics.headshotUrl } : null,
    graphics.welcomeSquareUrl ? { label: "Welcome square", url: graphics.welcomeSquareUrl } : null,
    graphics.welcomeStoryUrl ? { label: "Welcome story", url: graphics.welcomeStoryUrl } : null,
  ].filter((shot): shot is { label: string; url: string } => Boolean(shot));

  if (!shots.length && !graphics.welcomeMessage && !graphics.skoolUrl && !graphics.socials) {
    return <Empty>No welcome kit generated for {name} yet.</Empty>;
  }

  return (
    <div className="space-y-3">
      {shots.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shots.map((shot) => (
            <a key={shot.label} href={shot.url} target="_blank" rel="noreferrer"
              className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600">
              <img src={shot.url} alt={`${name} — ${shot.label}`} loading="lazy"
                className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]" />
              <p className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400">{shot.label}</p>
            </a>
          ))}
        </div>
      )}
      {graphics.welcomeMessage && (
        <Card><p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{graphics.welcomeMessage}</p></Card>
      )}
      {graphics.welcomeCaption && (
        <Card><p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">{graphics.welcomeCaption}</p></Card>
      )}
      <div className="flex flex-wrap gap-2">
        {graphics.skoolUrl && <Action href={graphics.skoolUrl} icon="🏫" label="Skool" external />}
        {Object.entries(graphics.socials ?? {}).map(([network, url]) => (
          <Action key={network} href={url} icon="🔗" label={network} external />
        ))}
      </div>
    </div>
  );
}

function CheckIn({ row }: { row: CheckInRecord }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-white">{row.monthLabel ?? day(row.monthDate) ?? "Check-in"}</p>
        {row.nps !== null && <span className="text-[11px] text-zinc-500">NPS {row.nps}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="text-zinc-500">Cash <b className="tabular-nums text-emerald-300">{money(row.cashCollected)}</b></span>
        <span className="text-zinc-500">New rev <b className="tabular-nums text-zinc-200">{money(row.newRevenue)}</b></span>
        {row.callsBooked !== null && <span className="text-zinc-500">Calls booked <b className="tabular-nums text-zinc-200">{row.callsBooked}</b></span>}
      </div>
      {(row.start || row.stop || row.favorite) && (
        <dl className="mt-2.5 space-y-1 border-t border-zinc-800 pt-2.5 text-xs">
          {row.start && <div><dt className="inline text-zinc-600">Start: </dt><dd className="inline text-zinc-400">{row.start}</dd></div>}
          {row.stop && <div><dt className="inline text-zinc-600">Stop: </dt><dd className="inline text-zinc-400">{row.stop}</dd></div>}
          {row.favorite && <div><dt className="inline text-zinc-600">Favourite: </dt><dd className="inline text-zinc-400">{row.favorite}</dd></div>}
        </dl>
      )}
    </Card>
  );
}

function Onboarding({ client }: { client: MergedClient }) {
  const progress = onboardingProgress(client.onboarding);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" style={{ width: `${progress.pct}%` }} />
        </div>
        <span className="text-xs font-bold tabular-nums text-zinc-300">{progress.done}/{progress.total}</span>
      </div>
      {RUNBOOK.map((step) => {
        const state = client.onboarding?.[step.key];
        return (
          <div key={step.key} className={`flex items-start gap-3 rounded-xl border border-zinc-800 p-3 ${state?.done ? "opacity-50" : "bg-zinc-900/50"}`}>
            <span aria-hidden className="text-sm">{state?.done ? "✅" : step.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${state?.done ? "text-zinc-500 line-through" : "text-white"}`}>{step.label}</p>
              <p className="mt-0.5 text-xs text-zinc-600">{state?.at ? `Done ${day(state.at)}` : step.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Overview({ client, detail, onPatch }: {
  client: MergedClient; detail: ClientDetail;
  onPatch: (client: MergedClient, patch: Patch) => void;
}) {
  const digits = (client.phone ?? "").replace(/\D/g, "");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {digits && <Action href={`tel:${digits}`} icon="📞" label="Call" />}
        {digits && <Action href={`sms:${digits}`} icon="💬" label="Text" />}
        {client.email && <Action href={`mailto:${client.email}`} icon="✉️" label="Email" />}
        {(client.whatsapp || digits) && (
          <Action href={`https://wa.me/${(client.whatsapp ?? client.phone ?? "").replace(/\D/g, "")}`} icon="🟢" label="WhatsApp" external />
        )}
      </div>

      {client.helm?.lastContactAt && (
        <p className="text-xs text-zinc-500">
          Last contact {day(client.helm.lastContactAt)}. Marking a new one updates the record everywhere.
          <button type="button" onClick={() => onPatch(client, { last_contact_at: new Date().toISOString() })}
            className="ml-2 rounded-lg border border-zinc-700 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 hover:border-zinc-500">
            Contacted today
          </button>
        </p>
      )}

      <Field label="Notes" value={client.notes ?? ""}
        onSave={(value) => onPatch(client, { notes: value })} />

      {detail.notes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Logged notes</p>
          {detail.notes.map((note) => (
            <Card key={note.id}>
              <p className="text-xs leading-relaxed text-zinc-300">{note.pinned ? "📌 " : ""}{note.body}</p>
              <p className="mt-1 text-[11px] text-zinc-600">{note.category ?? "Note"} · {day(note.createdAt) ?? "undated"}</p>
            </Card>
          ))}
        </div>
      )}

      {detail.tickets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Support</p>
          {detail.tickets.map((ticket) => (
            <Card key={ticket.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold text-white">{ticket.type ?? "Ticket"}</span>
                <span className={`text-[11px] ${ticket.resolvedAt ? "text-zinc-600" : "text-amber-300"}`}>
                  {ticket.resolvedAt ? "Resolved" : ticket.status ?? "Open"}
                </span>
              </div>
              {ticket.message && <p className="mt-1 text-xs text-zinc-400">{ticket.message}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Action({ href, icon, label, external }: { href: string; icon: string; label: string; external?: boolean }) {
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white">
      <span aria-hidden>{icon}</span>{label}
    </a>
  );
}

/** Saves on blur, so a paragraph is one write and not one per keystroke. */
function Field({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
      <textarea key={value} defaultValue={value} rows={4}
        onBlur={(e) => { if (e.target.value !== value) onSave(e.target.value); }}
        placeholder="Nothing recorded yet"
        className="mt-1 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:border-blue-500 focus:outline-none" />
    </label>
  );
}
