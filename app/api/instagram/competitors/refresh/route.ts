import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { normalizeCompetitorResearch, parseCompetitorResearch, type ContentCompetitor } from "@/lib/content-competitors";
import { extractCompetitorProfileStats, INSTAGRAM_CREDIT_GUARD, mapCompetitorEvidence, normalizeInstagramProfileUrl, syncEligibility } from "@/lib/instagram-command";
import { runActorSync } from "@/lib/apify-http";
import { BoundedBodyError, readBoundedJsonObject } from "@/lib/http-bounds";

export const runtime = "nodejs";
export const maxDuration = 180;
const LEGACY_KEY = "CONTENT_COMPETITOR_RESEARCH";
const ITEM_PREFIX = "CONTENT_COMPETITOR_ITEM_";
const EVIDENCE_PREFIX = "CONTENT_COMPETITOR_EVIDENCE_";
const LOCK_PREFIX = "CONTENT_COMPETITOR_REFRESH_";
const ACTOR = "apify~instagram-scraper";
const MAX_BODY_BYTES = 3_000;

type Db = ReturnType<typeof createLeadsAdminClient>;
type LockState = { status: "running" | "done"; token: string; profileUrl: string; startedAt: string; researchedAt?: string };

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

async function loadCreator(db: Db, creatorId: string): Promise<ContentCompetitor | null> {
  const item = await db.from("settings").select("value,updated_at").eq("key", `${ITEM_PREFIX}${creatorId}`).maybeSingle();
  if (item.error) throw new Error(item.error.message);
  const parsed = parseJson(item.data?.value);
  let saved = normalizeCompetitorResearch(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed, revision: item.data?.updated_at } : parsed);
  if (!saved) {
    const legacy = await db.from("settings").select("value").eq("key", LEGACY_KEY).maybeSingle();
    if (legacy.error) throw new Error(legacy.error.message);
    saved = parseCompetitorResearch(legacy.data?.value).find((creator) => creator.id === creatorId) || null;
  }
  if (!saved) return null;
  const evidence = await db.from("settings").select("value").eq("key", `${EVIDENCE_PREFIX}${creatorId}`).maybeSingle();
  if (evidence.error) throw new Error(evidence.error.message);
  const rawSnapshot = parseJson(evidence.data?.value);
  const snapshot = rawSnapshot && typeof rawSnapshot === "object" && !Array.isArray(rawSnapshot) ? rawSnapshot as Record<string, unknown> : null;
  const snapshotProfileUrl = typeof snapshot?.instagramUrl === "string" ? snapshot.instagramUrl : "";
  if (!snapshot || normalizeInstagramProfileUrl(snapshotProfileUrl) !== normalizeInstagramProfileUrl(saved.instagramUrl || "")) return saved;
  return normalizeCompetitorResearch({ ...saved, ...snapshot, revision: saved.revision }) || saved;
}

async function reserveRefresh(db: Db, creatorId: string, profileUrl: string) {
  const key = `${LOCK_PREFIX}${creatorId}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await db.from("settings").select("value").eq("key", key).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const currentRaw = typeof current.data?.value === "string" ? current.data.value : null;
    const state = parseJson(currentRaw) as LockState | null;
    if (state?.status === "done") {
      const eligibility = syncEligibility(state.researchedAt || state.startedAt, "competitor");
      if (!eligibility.eligible) return { conflict: "cooldown" as const, ...eligibility };
    }
    if (state?.status === "running") {
      const eligibility = syncEligibility(state.startedAt, "competitor");
      if (!eligibility.eligible) return { conflict: "running" as const, nextEligibleAt: eligibility.nextEligibleAt };
    }
    const claim: LockState = { status: "running", token: crypto.randomUUID(), profileUrl, startedAt: new Date().toISOString() };
    const value = JSON.stringify(claim);
    if (currentRaw === null) {
      const inserted = await db.from("settings").insert({ key, value, updated_at: claim.startedAt }).select("value").maybeSingle();
      if (inserted.data) return { key, claim, value };
      if (inserted.error?.code === "23505") continue;
      throw new Error(inserted.error?.message || "Could not reserve refresh");
    }
    const updated = await db.from("settings").update({ value, updated_at: claim.startedAt }).eq("key", key).eq("value", currentRaw).select("value").maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (updated.data) return { key, claim, value };
  }
  return { conflict: "running" as const, nextEligibleAt: null };
}

export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not configured" }, { status: 500 });
  let body: { creatorId?: string; profileUrl?: string };
  try { body = await readBoundedJsonObject(req, MAX_BODY_BYTES) as typeof body; }
  catch (error) {
    const bounded = error instanceof BoundedBodyError ? error : new BoundedBodyError(400, "Valid JSON object required");
    return NextResponse.json({ error: bounded.message }, { status: bounded.status });
  }
  if (!body.creatorId || !/^[a-z0-9-]{1,80}$/i.test(body.creatorId)) return NextResponse.json({ error: "valid creatorId required" }, { status: 400 });
  const profileUrl = normalizeInstagramProfileUrl(body.profileUrl || "");
  if (!profileUrl) return NextResponse.json({ error: "valid Instagram profile URL required" }, { status: 400 });

  const db = createLeadsAdminClient();
  let creator: ContentCompetitor | null;
  try { creator = await loadCreator(db, body.creatorId); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "research read failed" }, { status: 500 }); }
  if (!creator) return NextResponse.json({ error: "creator not found" }, { status: 404 });
  if (normalizeInstagramProfileUrl(creator.instagramUrl || "") !== profileUrl) return NextResponse.json({ error: "Save this Instagram profile on the creator before refreshing." }, { status: 409 });

  let reservation: Awaited<ReturnType<typeof reserveRefresh>>;
  try { reservation = await reserveRefresh(db, creator.id, profileUrl); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "refresh reservation failed" }, { status: 500 }); }
  if ("conflict" in reservation) {
    const message = reservation.conflict === "cooldown" ? "Credit guard: cached competitor research is still fresh." : "Research is already running for this creator.";
    return NextResponse.json({ error: message, code: reservation.conflict === "cooldown" ? "COMPETITOR_COOLDOWN" : "COMPETITOR_RUNNING", nextEligibleAt: reservation.nextEligibleAt }, { status: 409 });
  }

  const finishLock = async (researchedAt: string) => {
    const done: LockState = { ...reservation.claim, status: "done", researchedAt };
    const result = await db.from("settings").update({ value: JSON.stringify(done), updated_at: researchedAt }).eq("key", reservation.key).eq("value", reservation.value).select("value").maybeSingle();
    if (result.error) throw new Error(`Could not finalize paid-run lock: ${result.error.message}`);
    if (!result.data) throw new Error("Could not finalize paid-run lock because its reservation changed");
  };

  try {
    const posts = await runActorSync(ACTOR, {
      directUrls: [profileUrl], resultsType: "posts",
      resultsLimit: INSTAGRAM_CREDIT_GUARD.maxSamplePosts, addParentData: true,
    }, token, 8_000_000, INSTAGRAM_CREDIT_GUARD.maxSamplePosts);
    const researchedAt = new Date().toISOString();
    const latest = await loadCreator(db, creator.id);
    if (!latest || normalizeInstagramProfileUrl(latest.instagramUrl || "") !== profileUrl) {
      await finishLock(researchedAt);
      return NextResponse.json({ error: "The creator profile changed while research was running. The paid result was not attached." }, { status: 409 });
    }
    const expectedHandle = new URL(profileUrl).pathname.split("/").filter(Boolean)[0];
    const profileStats = extractCompetitorProfileStats(posts, expectedHandle);
    const snapshot = {
      id: latest.id,
      instagramUrl: profileUrl,
      instagramHandle: profileStats.handle ?? latest.instagramHandle,
      followers: profileStats.followers ?? latest.followers,
      researchedAt,
      sampledPostsCount: Math.min(posts.length, INSTAGRAM_CREDIT_GUARD.maxSamplePosts),
      evidence: mapCompetitorEvidence(posts),
    };
    const persisted = await db.from("settings").upsert({
      key: `${EVIDENCE_PREFIX}${latest.id}`,
      value: JSON.stringify(snapshot),
      updated_at: researchedAt,
    }, { onConflict: "key" });
    await finishLock(researchedAt);
    if (persisted.error) return NextResponse.json({ error: `Paid research completed but evidence persistence failed: ${persisted.error.message}` }, { status: 500 });
    const updated = normalizeCompetitorResearch({ ...latest, ...snapshot });
    if (!updated) return NextResponse.json({ error: "Persisted evidence was invalid" }, { status: 500 });
    return NextResponse.json({
      creator: updated,
      sampledPostsCount: snapshot.sampledPostsCount,
      persistedEvidenceCount: snapshot.evidence.length,
      nextEligibleAt: syncEligibility(researchedAt, "competitor").nextEligibleAt,
    });
  } catch (error) {
    const researchedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "competitor refresh failed";
    try { await finishLock(researchedAt); }
    catch (lockError) {
      return NextResponse.json({
        error: `${message}. ${lockError instanceof Error ? lockError.message : "Paid-run lock finalization failed"}. The existing reservation remains blocked to prevent duplicate spend.`,
        nextEligibleAt: syncEligibility(reservation.claim.startedAt, "competitor").nextEligibleAt,
      }, { status: 500 });
    }
    return NextResponse.json({ error: `${message}. Credit guard kept the reservation to prevent a duplicate paid run.`, nextEligibleAt: syncEligibility(researchedAt, "competitor").nextEligibleAt }, { status: message.includes("timed out") ? 504 : 502 });
  }
}
