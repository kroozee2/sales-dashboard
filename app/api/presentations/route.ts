import { NextRequest, NextResponse } from "next/server";
import { invalidateSettings } from "@/lib/settings";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { currentMember, identitySigningConfiguredWithSettings } from "@/lib/team-auth";
import { agentWorkforceAuthorization } from "@/lib/agent-workforce-auth";
import { parseJsonWithUniqueKeys } from "@/lib/agent-workforce";
import {
  PRESENTATIONS_MAX_BODY_BYTES,
  createSeedPresentationsDocument,
  parsePresentationsDocument,
  readBoundedPresentationsBody,
  seedPresentationsDocument,
  updatePresentationsDocument,
} from "@/lib/presentations";

const PRESENTATIONS_KEY = "PRESENTATIONS_V1";

function storageError(context: string, error: { code?: unknown }) {
  const code = typeof error.code === "string" ? error.code.slice(0, 32) : "unknown";
  console.error("Presentations storage failure", { context, code });
  return NextResponse.json({ error: "Presentation storage is temporarily unavailable" }, { status: 500 });
}

async function requireOwner(req: NextRequest) {
  if (!await identitySigningConfiguredWithSettings()) {
    return NextResponse.json({ error: "Owner identity service unavailable." }, { status: 503 });
  }
  const member = await currentMember(req.cookies.get("sos_user")?.value);
  const denied = agentWorkforceAuthorization(member);
  return denied ? NextResponse.json({ error: denied.error }, { status: denied.status }) : null;
}

function loadDocument(value: unknown) {
  if (!value) return createSeedPresentationsDocument();
  return seedPresentationsDocument(parsePresentationsDocument(String(value)));
}

export async function GET(req: NextRequest) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const db = createLeadsAdminClient();
  const { data: stored, error } = await db
    .from("settings")
    .select("value, updated_at")
    .eq("key", PRESENTATIONS_KEY)
    .maybeSingle();
  if (error) return storageError("read", error);
  try {
    return NextResponse.json(
      { document: loadDocument(stored?.value), row_updated_at: stored?.updated_at ?? null },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    console.error("Stored presentations failed validation", { context: "read" });
    return NextResponse.json({ error: "Stored presentations are unavailable" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > PRESENTATIONS_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Presentations document is too large" }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await readBoundedPresentationsBody(req);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "Presentations document is too large";
    return NextResponse.json(
      { error: tooLarge ? "Presentations document is too large" : "Request body must use valid UTF-8" },
      { status: tooLarge ? 413 : 400 },
    );
  }

  let input: unknown;
  try {
    input = parseJsonWithUniqueKeys(raw);
  } catch (error) {
    const duplicate = error instanceof Error && error.message === "Duplicate JSON field";
    return NextResponse.json({ error: duplicate ? "Request body contains duplicate fields" : "Request body must be valid JSON" }, { status: 400 });
  }

  const db = createLeadsAdminClient();
  const { data: stored, error: readError } = await db
    .from("settings")
    .select("value, updated_at")
    .eq("key", PRESENTATIONS_KEY)
    .maybeSingle();
  if (readError) return storageError("update-read", readError);

  let current;
  let next;
  try {
    current = loadDocument(stored?.value);
    next = updatePresentationsDocument(current, input, new Date().toISOString(), stored?.updated_at ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid presentation request";
    const conflict = /stale/i.test(message);
    return NextResponse.json({ error: conflict ? "Presentations changed in another tab. Reload and reconcile before saving." : message }, { status: conflict ? 409 : 400 });
  }

  let persistedRowUpdatedAt: string;
  if (stored) {
    let query = db
      .from("settings")
      .update({ value: JSON.stringify(next), updated_at: next.updated_at })
      .eq("key", PRESENTATIONS_KEY);
    query = stored.updated_at ? query.eq("updated_at", stored.updated_at) : query.is("updated_at", null);
    const { data, error } = await query.select("updated_at").maybeSingle();
    if (error) return storageError("update", error);
    if (!data) return NextResponse.json({ error: "Presentations changed in another tab. Reload and reconcile before saving." }, { status: 409 });
    if (typeof data.updated_at !== "string" || !data.updated_at) return storageError("update-read-back", {});
    persistedRowUpdatedAt = data.updated_at;
  } else {
    const { data, error } = await db.from("settings").insert({
      key: PRESENTATIONS_KEY,
      value: JSON.stringify(next),
      updated_at: next.updated_at,
    }).select("updated_at").maybeSingle();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Presentations were created in another tab. Reload and reconcile before saving." }, { status: 409 });
      return storageError("insert", error);
    }
    if (typeof data?.updated_at !== "string" || !data.updated_at) return storageError("insert-read-back", {});
    persistedRowUpdatedAt = data.updated_at;
  }

  invalidateSettings();
  return NextResponse.json(
    { document: next, row_updated_at: persistedRowUpdatedAt },
    { headers: { "cache-control": "private, no-store" } },
  );
}
