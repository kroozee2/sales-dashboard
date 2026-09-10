import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateClientRange, type CalendarEvent } from "@/lib/clients";
import { ROSTER_COLUMNS, helmDb, type HelmClientRow } from "@/lib/helm-clients";
import { buildClientsPayload, buildGrowth, type CallRow, type CheckInRow, type PortalRow } from "@/lib/helm-roster";
import { CLIENT_CALL_TYPES } from "@/lib/call-lanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

const db = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
    process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!,
  );

/**
 * Client and coaching calls are booked in the sales table but belong to
 * delivery, so they're pulled out of the sales pipeline and shown here next to
 * the fulfilment calls on the client's own record.
 */
async function clientCallEvents(range: { from: string; to: string }): Promise<CalendarEvent[]> {
  try {
    const { data, error } = await db()
      .from("sales_calls")
      .select("id,name,call_type,call_date,result")
      .in("call_type", CLIENT_CALL_TYPES as unknown as string[])
      .gte("call_date", range.from)
      .lte("call_date", `${range.to}T23:59:59`)
      .order("call_date", { ascending: true });
    if (error || !data) return [];

    return data
      .filter((c) => c.call_date)
      .map((c) => ({
        id: `sales-call:${c.id}`,
        title: `${c.call_type ?? "🧑‍💼 Client Call"} — ${c.name ?? "Client"}`,
        clientId: null,
        clientName: c.name ?? null,
        startsAt: c.call_date as string,
        callDate: String(c.call_date).slice(0, 10),
        isGroup: c.call_type === "👥 Group Call",
        status: c.result ?? null,
        source: "sales-os",
      }));
  } catch {
    // The client calendar is still useful without these — never fail the page.
    return [];
  }
}

export async function GET(request: Request) {
  const range = validateClientRange(new URL(request.url).searchParams);
  if (!range) return json({ error: "Use a valid from/to range of up to 124 inclusive days." }, 400);

  const [connection, ownCalls] = await Promise.all([helmDb(), clientCallEvents(range)]);

  if (!connection.ok) {
    // The roster is unreachable, but calls booked in Sales OS live in our own
    // table. A call moved out of the sales lane must still be somewhere.
    return json({
      generatedAt: new Date().toISOString(),
      dashboard: {
        activeClients: 0, onboarding: 0, atRisk: 0, offTrack: 0, overdueContact: 0,
        portalActive: 0, portalInvited: 0, upcoming7Days: 0, openSupport: 0, attention: [],
      },
      members: [],
      calendar: ownCalls,
      degraded: connection.reason === "auth"
        ? "The client database rejected our sign-in — showing calls booked in Sales OS only."
        : "The client database is not connected — showing calls booked in Sales OS only.",
    });
  }

  const helm = connection.db;
  const [clients, portal, calls, tickets, checkIns] = await Promise.all([
    helm.from("clients").select(ROSTER_COLUMNS).order("name", { ascending: true }),
    helm.from("portal_accounts").select("client_id,last_login_at"),
    helm.from("calls")
      .select("id,title,client_id,call_date,starts_at,is_group,status,attended,attendee_name")
      .gte("call_date", range.from)
      .lte("call_date", range.to)
      .order("call_date", { ascending: true }),
    helm.from("support_tickets").select("id", { count: "exact", head: true }).is("resolved_at", null),
    // Every check-in, because the money charts are across the whole book.
    helm.from("check_ins").select("client_id,month_label,month_date,cash_collected,new_revenue,nps,sales_calls_booked").limit(2000),
  ]);

  if (clients.error) return json({ error: "Client data is temporarily unavailable." }, 502);

  const payload = buildClientsPayload(
    (clients.data ?? []) as unknown as HelmClientRow[],
    (portal.data ?? []) as PortalRow[],
    (calls.data ?? []) as unknown as CallRow[],
    tickets.count ?? 0,
  );

  const calendar = [...payload.calendar, ...ownCalls].sort((a, b) => a.callDate.localeCompare(b.callDate));
  const growth = buildGrowth(
    (clients.data ?? []) as unknown as HelmClientRow[],
    (checkIns.data ?? []) as CheckInRow[],
  );
  return json({ ...payload, calendar, growth });
}
