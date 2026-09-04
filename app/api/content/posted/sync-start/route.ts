import { NextRequest, NextResponse } from "next/server";
import { startPlatform, startYouTubeRun, findRecentInstagramRuns, findRecentYouTubeRuns, ALL_PLATFORMS, type Platform } from "@/lib/posted-sources";
import type { YouTubeContentType } from "@/lib/youtube";
import { claimInstagramSyncStart, saveInstagramSyncRuns } from "@/lib/instagram-sync-state";
import { claimYouTubeSyncStart, saveYouTubeSyncRuns } from "@/lib/youtube-sync-state";
import { readBoundedRequestBody } from "@/lib/messaging";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { platform } — kick off the Apify run(s) for one platform and return
// their run/dataset ids immediately (starting a run is a fast API call). The
// client then polls /sync-poll. This keeps every request well under any
// function-timeout, so even the slow YouTube pull never times out.
export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not configured" }, { status: 500 });
  let body: Record<string, unknown>;
  try {
    const text = await readBoundedRequestBody(req, 2_048);
    body = JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: message === "Request body is too large" ? 413 : 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "platform")) {
    return NextResponse.json({ error: "Only platform is supported" }, { status: 400 });
  }
  const platform = body.platform as Platform | undefined;
  if (!platform || !ALL_PLATFORMS.includes(platform)) return NextResponse.json({ error: "valid platform required" }, { status: 400 });

  try {
    if (platform === "instagram") {
      const claim = await claimInstagramSyncStart();
      if (claim.kind === "reuse") return NextResponse.json({ platform, started: true, reused: true });
      if (claim.kind === "wait") return NextResponse.json({ platform, pendingStart: true }, { status: 202 });

      const recentRuns = await findRecentInstagramRuns(token);
      const runs = recentRuns.length ? recentRuns : await startPlatform(platform, token);
      await saveInstagramSyncRuns(claim.nonce, runs);
      return NextResponse.json({ platform, started: true, reused: recentRuns.length > 0 });
    }
    if (platform === "youtube") {
      const claim = await claimYouTubeSyncStart();
      if (claim.kind === "reuse") return NextResponse.json({ platform, started: true, reused: true });
      if (claim.kind === "wait") return NextResponse.json({ platform, pendingStart: true }, { status: 202 });

      const recentRuns = await findRecentYouTubeRuns(token);
      const runs = [...recentRuns];
      for (const contentType of ["videos", "shorts"] as YouTubeContentType[]) {
        if (!runs.some((run) => run.contentType === contentType)) runs.push(await startYouTubeRun(contentType, token));
      }
      await saveYouTubeSyncRuns(claim.nonce, runs);
      return NextResponse.json({ platform, started: true, reused: recentRuns.length > 0 });
    }
    const runs = await startPlatform(platform, token);
    return NextResponse.json({ platform, runs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "start failed" }, { status: 502 });
  }
}
