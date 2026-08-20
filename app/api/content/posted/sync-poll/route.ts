import { NextRequest, NextResponse } from "next/server";
import { runStatus, ingestDataset, ALL_PLATFORMS, type Platform } from "@/lib/posted-sources";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { BoundedBodyError, readBoundedJsonObject } from "@/lib/http-bounds";
import { parseSyncReservation, syncKey, type SyncReservation } from "@/lib/social-sync-reservation";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BODY_BYTES = 2_000;
const TERMINAL_BAD = new Set(["FAILED", "ABORTED", "TIMED-OUT"]);

export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not configured" }, { status: 500 });
  let body: { platform?: Platform };
  try { body = await readBoundedJsonObject(req, MAX_BODY_BYTES) as typeof body; }
  catch (error) {
    const bounded = error instanceof BoundedBodyError ? error : new BoundedBodyError(400, "Invalid JSON object");
    return NextResponse.json({ error: bounded.message }, { status: bounded.status });
  }
  const platform = body.platform;
  if (!platform || !ALL_PLATFORMS.includes(platform)) return NextResponse.json({ error: "valid platform required" }, { status: 400 });

  const db = createLeadsAdminClient();
  const current = await db.from("settings").select("value").eq("key", syncKey(platform)).maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  const currentValue = typeof current.data?.value === "string" ? current.data.value : "";
  const reservation = parseSyncReservation(currentValue);
  if (!reservation || reservation.platform !== platform) return NextResponse.json({ error: "No secured sync reservation exists for this platform" }, { status: 409 });
  if (reservation.status === "completed") return NextResponse.json({ done: true, synced: reservation.synced ?? 0 });
  if (reservation.status === "starting") return NextResponse.json({ done: false, statuses: ["STARTING"] });
  if (!reservation.runs?.length) return NextResponse.json({ error: "Sync reservation is missing provider references" }, { status: 409 });

  try {
    const statuses = await Promise.all(reservation.runs.map((run) => runStatus(run.runId, token)));
    if (statuses.some((status) => TERMINAL_BAD.has(status))) {
      return NextResponse.json({ error: `A scrape run ${statuses.find((status) => TERMINAL_BAD.has(status))}. Try again after the credit guard expires.` }, { status: 502 });
    }
    if (!statuses.every((status) => status === "SUCCEEDED")) return NextResponse.json({ done: false, statuses });

    let synced = 0;
    for (const run of reservation.runs) synced += await ingestDataset(platform, run.datasetId, token);
    const completed: SyncReservation = { ...reservation, status: "completed", completedAt: new Date().toISOString(), synced };
    const write = await db.from("settings").update({ value: JSON.stringify(completed), updated_at: completed.completedAt }).eq("key", syncKey(platform)).eq("value", currentValue).select("value").maybeSingle();
    if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 });
    if (!write.data) {
      const latest = await db.from("settings").select("value").eq("key", syncKey(platform)).maybeSingle();
      const latestState = parseSyncReservation(latest.data?.value);
      if (latestState?.status === "completed" && latestState.token === reservation.token) return NextResponse.json({ done: true, synced: latestState.synced ?? synced });
      return NextResponse.json({ error: "Sync state changed while results were being ingested" }, { status: 409 });
    }
    return NextResponse.json({ done: true, synced });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "poll failed" }, { status: 502 });
  }
}
