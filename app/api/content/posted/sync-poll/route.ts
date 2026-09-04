import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { runStatus, ingestDataset, type Platform } from "@/lib/posted-sources";
import { finishInstagramSync, getReservedInstagramSyncRuns } from "@/lib/instagram-sync-state";
import { finishYouTubeSync, getReservedYouTubeSyncRuns } from "@/lib/youtube-sync-state";
import { readBoundedRequestBody } from "@/lib/messaging";

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
  let body: { platform?: Platform; runs?: RunRef[] };
  try {
    const text = await readBoundedRequestBody(req, 4_096);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request body must be an object");
    if (Object.keys(parsed).some((key) => key !== "platform" && key !== "runs")) throw new Error("Unsupported request field");
    body = parsed as { platform?: Platform; runs?: RunRef[] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: message === "Request body is too large" ? 413 : 400 });
  }
  const { platform } = body;
  if (!platform) return NextResponse.json({ error: "platform required" }, { status: 400 });
  if (platform !== "facebook" && body.runs !== undefined) return NextResponse.json({ error: "Provider run references are server-owned" }, { status: 400 });
  if (platform === "facebook" && (!Array.isArray(body.runs) || body.runs.length !== 1 || body.runs.some((run) =>
    !run || typeof run.runId !== "string" || typeof run.datasetId !== "string" || run.runId.length > 100 || run.datasetId.length > 100
  ))) return NextResponse.json({ error: "valid runs required" }, { status: 400 });

  try {
    const youtubeRuns = platform === "youtube" ? await getReservedYouTubeSyncRuns() : null;
    const runs = platform === "instagram"
      ? await getReservedInstagramSyncRuns()
      : youtubeRuns ?? body.runs;
    if (!runs?.length) return NextResponse.json({ error: "runs required" }, { status: 400 });
    const statuses = await Promise.all(runs.map((r) => runStatus(r.runId, token)));
    if (statuses.some((s) => TERMINAL_BAD.has(s))) {
      if (platform === "instagram") await finishInstagramSync(runs);
      if (youtubeRuns) await finishYouTubeSync(youtubeRuns);
      return NextResponse.json({ error: `A scrape run ${statuses.find((s) => TERMINAL_BAD.has(s))}. Try again.`, terminal: true }, { status: 502 });
    }
    if (!statuses.every((s) => s === "SUCCEEDED")) {
      return NextResponse.json({ done: false, statuses });
    }
    // All finished — ingest each dataset, then hand back the fresh table.
    let synced = 0;
    for (const r of runs) synced += await ingestDataset(platform, r.datasetId, token);
    if (platform === "instagram") await finishInstagramSync(runs);
    if (youtubeRuns) await finishYouTubeSync(youtubeRuns);
    const { data } = await contentDb().from("posted_content").select("*").order("posted_at", { ascending: false });
    return NextResponse.json({ done: true, synced, posted: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "poll failed";
    const noReservation = message === "No active Instagram sync reservation" || message === "No active YouTube sync reservation";
    return NextResponse.json(
      { error: message, terminal: noReservation },
      { status: noReservation ? 409 : 502 },
    );
  }
}
