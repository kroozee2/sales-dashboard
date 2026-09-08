import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rankFollowUps, type SalesCallRow } from "@/lib/follow-ups";

// Small, cheap counts for the sidebar badges. Every page renders the sidebar,
// so this stays to head-only counts plus one bounded read, and any failure
// returns zeroes rather than an error — a missing badge must never be able to
// take a page down.

const FOLLOW_UP_WINDOW_DAYS = 90;
const RECORDING_WINDOW_DAYS = 30;

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!, process.env.SUPABASE_CALLS_SERVICE_KEY!);
}

export async function GET() {
  const client = db();
  const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  const counts = { followUps: 0, applications: 0, hotLeads: 0, callsMissingRecording: 0 };

  const [callsResult, applicationsResult, hotLeadsResult] = await Promise.allSettled([
    client
      .from("sales_calls")
      .select("id, name, call_date, call_type, result, showed, success, offer, offer_made, deal_amount, prospect_quality, objections, objections_notes, call_notes, ai_summary, follow_up_status, follow_up_date, follow_up_notes, recording_url, fathom_call_id, email, phone, ghl_url")
      .gte("call_date", since(FOLLOW_UP_WINDOW_DAYS))
      .order("call_date", { ascending: false })
      .limit(400),
    client.from("mastermind_applications").select("*", { count: "exact", head: true }).eq("status", "new"),
    client.from("leads").select("*", { count: "exact", head: true }).eq("prospect_stage", "🔥 Hot Prospect"),
  ]);

  if (callsResult.status === "fulfilled" && !callsResult.value.error) {
    const rows = (callsResult.value.data ?? []) as unknown as SalesCallRow[];
    counts.followUps = rankFollowUps(rows).filter((entry) => entry.band === "hot").length;

    // A call that happened and left no recording behind. Fathom stopped joining
    // one-to-one calls at the end of July and nothing said so for six weeks;
    // this is the number that would have said it.
    const cutoff = since(RECORDING_WINDOW_DAYS);
    const now = new Date().toISOString();
    counts.callsMissingRecording = rows.filter((call) =>
      (call.call_date ?? "") >= cutoff &&
      (call.call_date ?? "") <= now &&
      call.call_type === "📞 Sales Call" &&
      !call.recording_url &&
      !call.fathom_call_id &&
      !/no show/i.test(call.result ?? "")
    ).length;
  }

  if (applicationsResult.status === "fulfilled" && !applicationsResult.value.error) {
    counts.applications = applicationsResult.value.count ?? 0;
  }
  if (hotLeadsResult.status === "fulfilled" && !hotLeadsResult.value.error) {
    counts.hotLeads = hotLeadsResult.value.count ?? 0;
  }

  return NextResponse.json(counts, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
