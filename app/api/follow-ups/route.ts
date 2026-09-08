import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { intelSourceFor, parseCallIntel, rankFollowUps, type CallIntel, type SalesCallRow } from "@/lib/follow-ups";

const CALL_FIELDS = [
  "id", "name", "call_date", "call_type", "result", "showed", "success", "offer", "offer_made",
  "deal_amount", "prospect_quality", "objections", "objections_notes", "call_notes", "ai_summary",
  "follow_up_status", "follow_up_date", "follow_up_notes", "recording_url", "fathom_call_id",
  "email", "phone", "ghl_url",
].join(", ");

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!, process.env.SUPABASE_CALLS_SERVICE_KEY!);
}

function backendFailure(operation: string, error: { code?: unknown }) {
  const code = typeof error.code === "string" ? error.code.slice(0, 32) : "unknown";
  console.error("[follow-ups] backend failure", { operation, code });
  return NextResponse.json({ error: "Follow-ups are temporarily unavailable" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const client = db();
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? "90") || 90));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: calls, error } = await client
    .from("sales_calls")
    .select(CALL_FIELDS)
    .gte("call_date", since)
    .order("call_date", { ascending: false })
    .limit(400);
  if (error) return backendFailure("read-calls", error);

  const rows = (calls ?? []) as unknown as SalesCallRow[];
  const ranked = rankFollowUps(rows);

  const { data: intelRows, error: intelError } = await client
    .from("sales_call_intel")
    .select("call_id, intel, source, generated_at")
    .in("call_id", ranked.slice(0, 200).map((entry) => entry.call.id));
  if (intelError) return backendFailure("read-intel", intelError);

  const intelById = new Map<string, { intel: CallIntel; generated_at: string }>();
  for (const row of intelRows ?? []) {
    try {
      intelById.set(String(row.call_id), {
        intel: parseCallIntel(row.intel, row.source),
        generated_at: String(row.generated_at),
      });
    } catch {
      // A stored readout that no longer validates is skipped, not fatal: the
      // page simply offers to run the analysis again.
      console.error("[follow-ups] stored intel failed validation", { call_id: String(row.call_id) });
    }
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    window_days: days,
    items: ranked.map((entry) => {
      const cached = intelById.get(entry.call.id);
      return {
        id: entry.call.id,
        name: entry.call.name,
        call_date: entry.call.call_date,
        call_type: entry.call.call_type,
        result: entry.call.result,
        offer: entry.call.offer,
        deal_amount: entry.call.deal_amount,
        recording_url: entry.call.recording_url,
        email: entry.call.email,
        phone: entry.call.phone,
        ghl_url: entry.call.ghl_url,
        follow_up_date: entry.call.follow_up_date,
        follow_up_notes: entry.call.follow_up_notes,
        objections: entry.call.objections ?? [],
        score: entry.score,
        band: entry.band,
        reasons: entry.reasons,
        // What we could analyse if asked, versus what has already been analysed.
        available_source: intelSourceFor(entry.call),
        intel: cached?.intel ?? null,
        intel_generated_at: cached?.generated_at ?? null,
      };
    }),
  });
}
