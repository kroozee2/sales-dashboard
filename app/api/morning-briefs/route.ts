import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import {
  MORNING_BRIEFS_KEY,
  createBriefFromInput,
  parseBriefDocument,
  toggleChecklistItem,
  upsertBrief,
  type MorningBriefDocument,
} from "@/lib/morning-brief";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 45_000;
const MAX_RETRIES = 3;

type StoredRow = { value: string; updated_at: string };

async function readRow(): Promise<StoredRow | null> {
  const db = createLeadsAdminClient();
  const { data, error } = await db.from("settings").select("value, updated_at").eq("key", MORNING_BRIEFS_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  return data as StoredRow | null;
}

async function compareAndSwap(
  mutate: (document: MorningBriefDocument) => MorningBriefDocument,
): Promise<MorningBriefDocument> {
  const db = createLeadsAdminClient();
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const row = await readRow();
    const current = parseBriefDocument(row?.value);
    const next = mutate(current);
    const value = JSON.stringify(next);
    if (new TextEncoder().encode(value).byteLength > 1_000_000) throw new Error("morning brief archive is too large");
    const updatedAt = new Date(Date.now() + attempt).toISOString();

    if (!row) {
      const { error } = await db.from("settings").insert({ key: MORNING_BRIEFS_KEY, value, updated_at: updatedAt });
      if (!error) return next;
      if (error.code === "23505") continue;
      throw new Error(error.message);
    }

    const { data, error } = await db
      .from("settings")
      .update({ value, updated_at: updatedAt })
      .eq("key", MORNING_BRIEFS_KEY)
      .eq("updated_at", row.updated_at)
      .select("key");
    if (error) throw new Error(error.message);
    if (data?.length === 1) return next;
  }
  throw new Error("morning brief changed while saving, please retry");
}

async function readJson(req: NextRequest): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new Error("request body is too large");
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("request body is too large");
  try { return JSON.parse(text); } catch { throw new Error("request body must be valid JSON"); }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = /stale|changed while saving/.test(message) ? 409 : /required|invalid|unknown|must|too long|too large|not found|cannot exceed/.test(message) ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const row = await readRow();
    return NextResponse.json(parseBriefDocument(row?.value));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const incoming = createBriefFromInput(await readJson(req));
    const document = await compareAndSwap((current) => upsertBrief(current, incoming));
    return NextResponse.json({ brief: document.briefs.find((brief) => brief.id === incoming.id) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const raw = await readJson(req);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("request body must be an object");
    const body = raw as Record<string, unknown>;
    const allowed = new Set(["brief_id", "item_id", "done", "expected_revision"]);
    const unknown = Object.keys(body).find((key) => !allowed.has(key));
    if (unknown) throw new Error(`request contains unknown field: ${unknown}`);
    if (typeof body.brief_id !== "string" || typeof body.item_id !== "string" || typeof body.expected_revision !== "string" || typeof body.done !== "boolean") {
      throw new Error("brief_id, item_id, done, and expected_revision are required");
    }
    let updatedId = "";
    const document = await compareAndSwap((current) => {
      const index = current.briefs.findIndex((brief) => brief.id === body.brief_id);
      if (index < 0) throw new Error("brief not found");
      const updated = toggleChecklistItem(current.briefs[index], body.item_id as string, body.done as boolean, body.expected_revision as string);
      updatedId = updated.id;
      return { ...current, briefs: current.briefs.map((brief, briefIndex) => briefIndex === index ? updated : brief) };
    });
    return NextResponse.json({ brief: document.briefs.find((brief) => brief.id === updatedId) });
  } catch (error) {
    return errorResponse(error);
  }
}
