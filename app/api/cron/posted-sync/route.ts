import { NextRequest, NextResponse } from "next/server";
import {
  ALL_PLATFORMS, ingestDataset, runStatus, startPlatform, startYouTubeRun,
  findRecentInstagramRuns, findRecentYouTubeRuns,
  type Platform,
} from "@/lib/posted-sources";

// Refreshes what actually went out, once a day.
//
// The Posted data was only ever collected when somebody opened the page and
// pressed sync, so the calendar could show an empty month while five reels had
// gone out in it. This runs on a schedule instead.
//
// Apify runs take minutes, which is longer than a cron invocation should wait.
// So each run does two things: ingest whatever finished since yesterday, then
// start today's scrape. Tomorrow's run collects it. Nothing is lost if a scrape
// is slow, and nothing blocks waiting on one.

export const runtime = "nodejs";
export const maxDuration = 300;

const POLL_BUDGET_MS = 180_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function authorised(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  const agent = process.env.SALESOS_AGENT_KEY;
  if (secret && header === `Bearer ${secret}`) return true;
  if (agent && header === `Bearer ${agent}`) return true;
  // Vercel Cron identifies itself when no secret is configured.
  return !secret && req.headers.get("user-agent")?.includes("vercel-cron") === true;
}

type Result = { platform: string; ingested: number; started: boolean; note?: string };

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not configured" }, { status: 503 });

  const started = Date.now();
  const results: Result[] = [];

  for (const platform of ALL_PLATFORMS as Platform[]) {
    try {
      // 1. Anything already finished gets ingested, whoever started it.
      let runs: { runId: string; datasetId: string }[] = [];
      if (platform === "instagram") runs = await findRecentInstagramRuns(token);
      else if (platform === "youtube") runs = await findRecentYouTubeRuns(token);

      let ingested = 0;
      for (const run of runs) {
        if (Date.now() - started > POLL_BUDGET_MS) break;
        if ((await runStatus(run.runId, token)) === "SUCCEEDED") {
          ingested += await ingestDataset(platform, run.datasetId, token);
        }
      }

      // 2. Start a fresh scrape for tomorrow. Facebook has no reuse helper, so
      //    it is started and polled within this invocation.
      let didStart = false;
      if (platform === "youtube") {
        for (const contentType of ["videos", "shorts"] as const) {
          if (!runs.some((r) => (r as { contentType?: string }).contentType === contentType)) {
            await startYouTubeRun(contentType, token);
            didStart = true;
          }
        }
      } else {
        const fresh = await startPlatform(platform, token);
        didStart = true;
        if (platform === "facebook") {
          for (const run of fresh) {
            while (Date.now() - started < POLL_BUDGET_MS) {
              const status = await runStatus(run.runId, token);
              if (status === "SUCCEEDED") { ingested += await ingestDataset(platform, run.datasetId, token); break; }
              if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) break;
              await sleep(10_000);
            }
          }
        }
      }

      results.push({ platform, ingested, started: didStart });
    } catch (e) {
      results.push({ platform, ingested: 0, started: false, note: e instanceof Error ? e.message : "failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    results,
    took_seconds: Math.round((Date.now() - started) / 1000),
    ran_at: new Date().toISOString(),
  });
}
