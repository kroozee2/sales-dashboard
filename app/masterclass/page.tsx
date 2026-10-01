"use client";

import { useEffect, useState } from "react";
import { looksMistyped, seatLine, type Buyer, type SeatCount } from "@/lib/masterclass";
import { prettyPhone } from "@/lib/phone-format";

type Payload = { buyers: Buyer[]; seats: SeatCount; generated_at: string; whatsapp_group_read?: boolean };

/** Three states, never two: in, not in, or could not be checked. */
function JoinedCell({ joined, hasPhone }: { joined: boolean | null; hasPhone: boolean }) {
  if (joined === true) {
    return <span className="whitespace-nowrap rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/25">joined</span>;
  }
  if (joined === false) {
    return <span className="whitespace-nowrap rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-400/25">not yet</span>;
  }
  return (
    <span
      className="whitespace-nowrap rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-500 ring-1 ring-white/10"
      title={hasPhone ? "The group could not be read, so this is unknown" : "No phone number on file, and WhatsApp can only be matched by number"}
    >
      {hasPhone ? "unknown" : "no number"}
    </span>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

export default function MasterclassPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/masterclass", { cache: "no-store", signal: controller.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not load."); return j as Payload; })
      .then((d) => { if (!controller.signal.aborted) setData(d); })
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load."); });
    return () => controller.abort();
  }, []);

  const seats = data?.seats;

  return (
    <div className="space-y-4">
      <header>
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-300/70">Leads</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Masterclass</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Everyone who bought the AI Employee Masterclass, read live from Stripe. The same count drives the seats left on the sales page.
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {seats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Bought", value: seats.sold },
            { label: "Seats left", value: seats.remaining },
            { label: "Revenue", value: `$${(seats.sold * 97).toLocaleString()}` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-400">{label}</div>
              <p className="mt-2 text-xl font-semibold text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
      )}

      {seats && <p className="text-xs text-zinc-400">The page currently reads: “{seatLine(seats)}”.</p>}

      {data && data.whatsapp_group_read === false && (
        <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-xs text-zinc-400">
          The WhatsApp group could not be read, so the join column is unknown for everyone. Set
          <code className="mx-1 rounded bg-white/[0.06] px-1">UNIPILE_DSN</code>,
          <code className="mx-1 rounded bg-white/[0.06] px-1">UNIPILE_API_KEY</code> and
          <code className="mx-1 rounded bg-white/[0.06] px-1">WHATSAPP_MASTERCLASS_JID</code>.
        </p>
      )}

      {!data && !error && <p className="py-16 text-center text-sm text-zinc-400">Loading from Stripe…</p>}

      {data && data.buyers.length === 0 && (
        <p className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-zinc-400">Nobody has bought it yet.</p>
      )}

      {data && data.buyers.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Email</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Phone</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">WhatsApp</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Bought</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap text-right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.buyers.map((b) => (
                  <tr key={b.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-zinc-100">{b.name ?? "—"}</td>
                    <td className="min-w-0 break-words px-4 py-2.5 text-zinc-300 [overflow-wrap:anywhere]">
                      {b.email ? (
                        <a href={`mailto:${b.email}`} className="hover:text-blue-300">{b.email}</a>
                      ) : "—"}
                      {looksMistyped(b.email) && (
                        <span className="ml-2 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200" title="This address looks mistyped, so anything sent to it will bounce">
                          check address
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-300">
                      {b.phone ? (
                        <a href={`tel:+${b.phone}`} className="tabular-nums hover:text-blue-300" title={b.phone_source === "ghl" ? "From GoHighLevel" : "From Stripe checkout"}>
                          {prettyPhone(b.phone)}
                        </a>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <JoinedCell joined={b.in_whatsapp_group} hasPhone={Boolean(b.phone)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">{when(b.purchased_at)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-300">${(b.amount / 100).toFixed(0)}</td>
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
