import { NextRequest, NextResponse } from "next/server";
import { startPlatform, ALL_PLATFORMS, type Platform } from "@/lib/posted-sources";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { syncEligibility } from "@/lib/instagram-command";
import { BoundedBodyError, readBoundedJsonObject } from "@/lib/http-bounds";
import { parseSyncReservation, reservationTimestamp, syncKey, type SyncReservation } from "@/lib/social-sync-reservation";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BODY_BYTES = 2_000;
const MAX_CLAIM_ATTEMPTS = 3;

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform") as Platform | null;
  if (!platform || !ALL_PLATFORMS.includes(platform)) return NextResponse.json({ error: "valid platform required" }, { status: 400 });
  const { data, error } = await createLeadsAdminClient().from("settings").select("value").eq("key", syncKey(platform)).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const last = reservationTimestamp(data?.value);
  return NextResponse.json({ platform, lastSyncAt: last, ...syncEligibility(last, "profile") });
}

export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not configured" }, { status: 500 });
  let body: { platform?: Platform };
  try { body = await readBoundedJsonObject(req, MAX_BODY_BYTES) as typeof body; }
  catch (error) {
    const bounded = error instanceof BoundedBodyError ? error : new BoundedBodyError(400, "Invalid JSON object");
    return NextResponse.json({ error: bounded.message }, { status: bounded.status });
  }
  const { platform } = body;
  if (!platform || !ALL_PLATFORMS.includes(platform)) return NextResponse.json({ error: "valid platform required" }, { status: 400 });

  const db = createLeadsAdminClient();
  let claimValue = "";
  let claimState: SyncReservation | null = null;
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    const current = await db.from("settings").select("value").eq("key", syncKey(platform)).maybeSingle();
    if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
    const previous = typeof current.data?.value === "string" ? current.data.value : null;
    const last = reservationTimestamp(previous);
    const eligibility = syncEligibility(last, "profile");
    if (!eligibility.eligible) {
      const existing = parseSyncReservation(previous);
      if (existing?.status === "running" && existing.platform === platform) {
        return NextResponse.json({ platform, started: true, resumed: true, lastSyncAt: existing.startedAt, ...eligibility });
      }
      if (existing?.status === "starting" && existing.platform === platform) {
        return NextResponse.json({ error: "A provider start is already reserved but not yet ready to poll.", code: "SYNC_STARTING", lastSyncAt: existing.startedAt, ...eligibility }, { status: 409 });
      }
      return NextResponse.json({ error: "Credit guard: this profile was synced recently.", code: "SYNC_COOLDOWN", lastSyncAt: last, ...eligibility }, { status: 409 });
    }

    claimState = { status: "starting", token: crypto.randomUUID(), platform, startedAt: new Date().toISOString() };
    claimValue = JSON.stringify(claimState);
    const write = { key: syncKey(platform), value: claimValue, updated_at: claimState.startedAt };
    if (previous === null) {
      const claim = await db.from("settings").insert(write).select("value").maybeSingle();
      if (claim.data) break;
      if (claim.error?.code === "23505") { claimState = null; continue; }
      return NextResponse.json({ error: claim.error?.message || "Could not reserve sync" }, { status: 500 });
    }
    const claim = await db.from("settings").update(write).eq("key", syncKey(platform)).eq("value", previous).select("value").maybeSingle();
    if (claim.error) return NextResponse.json({ error: claim.error.message }, { status: 500 });
    if (claim.data) break;
    claimState = null;
  }
  if (!claimState || !claimValue) return NextResponse.json({ error: "Another sync started first. Please retry later.", code: "SYNC_CONFLICT" }, { status: 409 });

  try {
    const runs = await startPlatform(platform, token);
    if (!runs.length || runs.length > 5 || runs.some((run) => !/^[A-Za-z0-9_-]{1,100}$/.test(run.runId) || !/^[A-Za-z0-9_-]{1,100}$/.test(run.datasetId))) throw new Error("Provider returned invalid run references");
    const running: SyncReservation = { ...claimState, status: "running", runs };
    const runningValue = JSON.stringify(running);
    let stored = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const updated = await db.from("settings").update({ value: runningValue, updated_at: new Date().toISOString() }).eq("key", syncKey(platform)).eq("value", claimValue).select("value").maybeSingle();
      if (updated.error) continue;
      if (updated.data) { stored = true; break; }
    }
    if (!stored) return NextResponse.json({ error: "Sync started but its references could not be secured. Credit guard remains active." }, { status: 502 });
    return NextResponse.json({ platform, started: true, lastSyncAt: running.startedAt, ...syncEligibility(running.startedAt, "profile") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "start failed" }, { status: 502 });
  }
}
