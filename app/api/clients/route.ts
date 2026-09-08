import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchClientsUpstream, validateClientRange, type CalendarEvent } from "@/lib/clients";
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
 * the group calls that come from Helm.
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

  const [result, ownCalls] = await Promise.all([
    fetchClientsUpstream(range, {
      base: process.env.HELM_SALESOS_URL,
      secret: process.env.HELM_SALESOS_SECRET,
    }),
    clientCallEvents(range),
  ]);

  if (!result.ok) {
    return result.status === 503
      ? json({ error: "Client data connection is not configured." }, 503)
      : json({ error: "Client data is temporarily unavailable." }, 502);
  }

  const calendar = [...result.payload.calendar, ...ownCalls].sort((a, b) =>
    a.callDate.localeCompare(b.callDate),
  );
  return json({ ...result.payload, calendar });
}
