import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { runStatus, ingestDataset, type Platform } from "@/lib/posted-sources";

export const runtime = "nodejs";
export const maxDuration = 60;

type RunRef = { runId: string; datasetId: string };
const TERMINAL_BAD = new Set(["FAILED", "ABORTED", "TIMED-OUT"]);

// POST { platform, runs:[{runId,datasetId}] } — check every run. While any is
// still going, return { done:false }. Once all have SUCCEEDED, ingest each
// dataset (map → date-guard → upsert) and return the refreshed list.
export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not configured" }, { status: 500 });
  const { platform, runs } = (await req.json().catch(() => ({}))) as { platform?: Platform; runs?: RunRef[] };
  if (!platform || !runs?.length) return NextResponse.json({ error: "platform and runs required" }, { status: 400 });

  try {
    const statuses = await Promise.all(runs.map((r) => runStatus(r.runId, token)));
    if (statuses.some((s) => TERMINAL_BAD.has(s))) {
      return NextResponse.json({ error: `A scrape run ${statuses.find((s) => TERMINAL_BAD.has(s))}. Try again.` }, { status: 502 });
    }
    if (!statuses.every((s) => s === "SUCCEEDED")) {
      return NextResponse.json({ done: false, statuses });
    }
    // All finished — ingest each dataset, then hand back the fresh table.
    let synced = 0;
    for (const r of runs) synced += await ingestDataset(platform, r.datasetId, token);
    const { data } = await contentDb().from("posted_content").select("*").order("posted_at", { ascending: false });
    return NextResponse.json({ done: true, synced, posted: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "poll failed" }, { status: 502 });
  }
}
