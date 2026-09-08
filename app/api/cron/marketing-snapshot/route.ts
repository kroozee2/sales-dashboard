import { NextRequest, NextResponse } from "next/server";
import { captureSnapshot } from "@/app/api/marketing/platforms/route";

// Daily follower reading, so Week/Month/Quarter growth becomes answerable.
//
// Vercel Cron sends a GET with `Authorization: Bearer $CRON_SECRET`, which is
// also what gets it past the app-wide gate in proxy.ts. The agent key is
// accepted too, so the job can be triggered by hand without a second secret.

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const supplied = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!supplied) return false;
  return [process.env.CRON_SECRET, process.env.SALESOS_AGENT_KEY]
    .filter((k): k is string => !!k)
    .some((k) => k.length === supplied.length && k === supplied);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "This endpoint is for the scheduled job." }, { status: 401 });
  }
  const result = await captureSnapshot();
  return NextResponse.json({ ran_at: new Date().toISOString(), ...result.body }, { status: result.status });
}
