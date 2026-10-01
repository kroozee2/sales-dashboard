"use client";

import { useEffect, useMemo, useState } from "react";
import { prettyPhone } from "@/lib/phone-format";

type Signup = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  event_date: string;
  signed_up_at: string;
  tapped_whatsapp_at: string | null;
  in_whatsapp_group: boolean | null;
  in_ghl: boolean;
  invite_status: string | null;
  invited_at: string | null;
  source: string | null;
};

type Payload = {
  signups: Signup[];
  next_party: { date: string; label: string };
  whatsapp_group_read: boolean;
  generated_at: string;
};

const PILL = "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1";
const GREEN = `${PILL} bg-emerald-400/10 text-emerald-300 ring-emerald-400/25`;
const AMBER = `${PILL} bg-amber-400/10 text-amber-300 ring-amber-400/25`;
const BLUE = `${PILL} bg-blue-400/10 text-blue-300 ring-blue-400/25`;
const GREY = `${PILL} bg-white/[0.04] text-zinc-500 ring-white/10`;

/**
 * Whether they are in the group chat.
 *
 * Real membership is the truth, but it can only be read when Unipile is
 * configured and only for someone whose number we hold. Everything else falls
 * back to the tap on the join button, which proves intent and nothing more, so
 * it is styled and worded differently rather than passed off as membership.
 */
function WhatsAppCell({ row, groupRead }: { row: Signup; groupRead: boolean }) {
  if (row.in_whatsapp_group === true) return <span className={GREEN}>in group</span>;
  if (row.in_whatsapp_group === false) {
    return (
      <span className={AMBER} title="Not in the group chat, checked against their phone number">
        not in group
      </span>
    );
  }
  // Membership unknown. Say what we do know.
  if (row.tapped_whatsapp_at) {
    return (
      <span
        className={BLUE}
        title={
          groupRead
            ? "They opened the invite link. We have no number to match them in the group, so we cannot confirm they joined."
            : "They opened the invite link. The group itself could not be read, so this is not confirmed membership."
        }
      >
        tapped join
      </span>
    );
  }
  return <span className={GREY} title="They never opened the WhatsApp invite link">no tap</span>;
}

function InviteCell({ status }: { status: string | null }) {
  if (status === "invited") return <span className={GREEN}>on calendar</span>;
  if (status === "queued") return <span className={AMBER} title="Waiting for the 9am or 3pm queue run">queued</span>;
  if (status === "failed") return <span className={`${PILL} bg-rose-400/10 text-rose-300 ring-rose-400/25`}>failed</span>;
  return <span className={GREY}>—</span>;
}

const day = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
};

const dayTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
};

/** A party date (YYYY-MM-DD) read as a plain date, not shifted by the viewer's zone. */
const partyLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

function toCsv(rows: Signup[]): string {
  const head = ["Name", "Email", "Phone", "Party", "Signed up", "In WhatsApp group", "Tapped join", "Calendar invite", "In GHL"];
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body = rows.map((r) =>
    [
      r.name ?? "",
      r.email,
      r.phone ?? "",
      r.event_date,
      new Date(r.signed_up_at).toISOString(),
      r.in_whatsapp_group === null ? "unknown" : r.in_whatsapp_group ? "yes" : "no",
      r.tapped_whatsapp_at ? "yes" : "no",
      r.invite_status ?? "",
      r.in_ghl ? "yes" : "no",
    ].map(cell).join(","),
  );
  return [head.join(","), ...body].join("\n");
}

export default function ReferralPartyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [party, setParty] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/partners/referral-party", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load.");
        return j as Payload;
      })
      .then((d) => { if (!controller.signal.aborted) setData(d); })
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load."); });
    return () => controller.abort();
  }, []);

  const parties = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of data?.signups ?? []) seen.set(s.event_date, (seen.get(s.event_date) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.signups ?? []).filter((s) => {
      if (party && s.event_date !== party) return false;
      if (!needle) return true;
      return [s.name, s.email, s.phone].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [data, q, party]);

  const stats = useMemo(() => {
    const inGroup = rows.filter((r) => r.in_whatsapp_group === true).length;
    const tapped = rows.filter((r) => r.tapped_whatsapp_at).length;
    return {
      total: rows.length,
      whatsapp: data?.whatsapp_group_read ? inGroup : tapped,
      whatsappLabel: data?.whatsapp_group_read ? "In WhatsApp" : "Tapped WhatsApp",
      onCalendar: rows.filter((r) => r.invite_status === "invited").length,
      queued: rows.filter((r) => r.invite_status === "queued").length,
    };
  }, [rows, data]);

  function downloadCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referral-party-signups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-300/70">Partners</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Referral Party</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Everyone who signed up through the public invite page. Each one is upserted into GoHighLevel, added to
          the leads grid, and queued for the calendar invite.
          {data && <> Next party: <span className="text-zinc-300">{data.next_party.label}</span>.</>}
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Signups", value: stats.total },
            { label: stats.whatsappLabel, value: stats.whatsapp },
            { label: "On the calendar", value: stats.onCalendar },
            { label: "Invite queued", value: stats.queued },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">{label}</div>
              <p className="mt-2 text-xl font-semibold text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
      )}

      {data && !data.whatsapp_group_read && (
        <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-xs leading-5 text-zinc-400">
          The WhatsApp group could not be read, so this shows who <em>tapped</em> the join link rather than who
          actually joined. To get real membership, set
          <code className="mx-1 rounded bg-white/[0.06] px-1">UNIPILE_DSN</code>,
          <code className="mx-1 rounded bg-white/[0.06] px-1">UNIPILE_API_KEY</code> and
          <code className="mx-1 rounded bg-white/[0.06] px-1">WHATSAPP_REFERRAL_PARTY_JID</code>.
        </p>
      )}

      {data && data.signups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or phone"
            className="min-w-[220px] flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-white/20 focus:outline-none"
          />
          <select
            value={party}
            onChange={(e) => setParty(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 focus:border-white/20 focus:outline-none"
          >
            <option value="">All parties</option>
            {parties.map(([date, n]) => (
              <option key={date} value={date}>{partyLabel(date)} ({n})</option>
            ))}
          </select>
          <button
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
          >
            Download CSV
          </button>
        </div>
      )}

      {!data && !error && <p className="py-16 text-center text-sm text-zinc-400">Loading signups…</p>}

      {data && data.signups.length === 0 && (
        <p className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-zinc-400">
          Nobody has signed up through the invite page yet.
        </p>
      )}

      {data && data.signups.length > 0 && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-zinc-400">
          No signups match that search.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Email</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Phone</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">WhatsApp</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Calendar</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Party</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-100">
                      {r.name ?? "—"}
                      {!r.in_ghl && (
                        <span className="ml-2 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200" title="No GoHighLevel contact was created, so they will not have received the confirmation text or email">
                          no CRM
                        </span>
                      )}
                    </td>
                    <td className="min-w-0 break-words px-4 py-2.5 text-zinc-300 [overflow-wrap:anywhere]">
                      <a href={`mailto:${r.email}`} className="hover:text-blue-300">{r.email}</a>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-300">
                      {r.phone ? (
                        <a href={`tel:${r.phone}`} className="tabular-nums hover:text-blue-300">
                          {prettyPhone(r.phone.replace(/\D/g, ""))}
                        </a>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <WhatsAppCell row={r} groupRead={data?.whatsapp_group_read ?? false} />
                    </td>
                    <td className="px-4 py-2.5"><InviteCell status={r.invite_status} /></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">{partyLabel(r.event_date)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400" title={day(r.signed_up_at)}>
                      {dayTime(r.signed_up_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
