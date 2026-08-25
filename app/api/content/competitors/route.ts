import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import {
  normalizeCompetitorResearch,
  parseCompetitorResearch,
  sanitizeEditableCompetitor,
  upsertCompetitorResearch,
  type ContentCompetitor,
} from "@/lib/content-competitors";
import { BoundedBodyError, readBoundedJsonObject } from "@/lib/http-bounds";

const LEGACY_KEY = "CONTENT_COMPETITOR_RESEARCH";
const ITEM_PREFIX = "CONTENT_COMPETITOR_ITEM_";
const EVIDENCE_PREFIX = "CONTENT_COMPETITOR_EVIDENCE_";
const MAX_BODY_BYTES = 220_000;

type EvidenceSnapshot = Pick<ContentCompetitor, "id" | "instagramUrl" | "instagramHandle" | "followers" | "researchedAt" | "sampledPostsCount" | "evidence">;

function parseObject(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

export async function GET() {
  const { data, error } = await createLeadsAdminClient()
    .from("settings")
    .select("key,value,updated_at")
    .or(`key.eq.${LEGACY_KEY},key.like.${ITEM_PREFIX}%,key.like.${EVIDENCE_PREFIX}%`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const legacy = data?.find((row) => row.key === LEGACY_KEY);
  let creators = parseCompetitorResearch(legacy?.value);
  for (const row of data ?? []) {
    if (!row.key.startsWith(ITEM_PREFIX)) continue;
    const creator = normalizeCompetitorResearch({ ...(parseObject(row.value) as object), revision: row.updated_at });
    if (creator) creators = upsertCompetitorResearch(creators, creator);
  }
  for (const row of data ?? []) {
    if (!row.key.startsWith(EVIDENCE_PREFIX)) continue;
    const snapshot = parseObject(row.value) as EvidenceSnapshot | null;
    if (!snapshot || typeof snapshot.id !== "string") continue;
    const creator = creators.find((item) => item.id === snapshot.id);
    if (!creator || !snapshot.instagramUrl || snapshot.instagramUrl !== creator.instagramUrl) continue;
    const merged = normalizeCompetitorResearch({ ...creator, ...snapshot });
    if (merged) creators = upsertCompetitorResearch(creators, merged);
  }
  return NextResponse.json({ creators });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await readBoundedJsonObject(req, MAX_BODY_BYTES); }
  catch (error) {
    const bounded = error instanceof BoundedBodyError ? error : new BoundedBodyError(400, "Valid JSON object required");
    return NextResponse.json({ error: bounded.message }, { status: bounded.status });
  }
  const submitted = body.creator;
  const creator = sanitizeEditableCompetitor(submitted);
  if (!creator) return NextResponse.json({ error: "valid creator required" }, { status: 400 });
  const requestedRevision = submitted && typeof submitted === "object" && !Array.isArray(submitted) && typeof (submitted as Record<string, unknown>).revision === "string"
    ? String((submitted as Record<string, unknown>).revision)
    : null;

  const db = createLeadsAdminClient();
  const key = `${ITEM_PREFIX}${creator.id}`;
  const current = await db.from("settings").select("updated_at").eq("key", key).maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  const now = new Date().toISOString();
  const value = JSON.stringify(creator);

  if (!current.data) {
    const inserted = await db.from("settings").insert({ key, value, updated_at: now }).select("updated_at").maybeSingle();
    if (inserted.error?.code === "23505") return NextResponse.json({ error: "This creator changed in another tab. Reload before saving." }, { status: 409 });
    if (inserted.error || !inserted.data) return NextResponse.json({ error: inserted.error?.message || "Could not save creator" }, { status: 500 });
    return NextResponse.json({ creator: { ...creator, revision: inserted.data.updated_at } });
  }

  if (!requestedRevision || requestedRevision !== current.data.updated_at) {
    return NextResponse.json({ error: "This creator changed in another tab. Reload before saving." }, { status: 409 });
  }
  const updated = await db.from("settings").update({ value, updated_at: now }).eq("key", key).eq("updated_at", requestedRevision).select("updated_at").maybeSingle();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
  if (!updated.data) return NextResponse.json({ error: "This creator changed in another tab. Reload before saving." }, { status: 409 });
  return NextResponse.json({ creator: { ...creator, revision: updated.data.updated_at } });
}
