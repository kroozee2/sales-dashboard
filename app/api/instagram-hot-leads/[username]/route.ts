import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  applyInstagramHotLeadPatch,
  INSTAGRAM_HOT_LEADS_MAX_BODY_BYTES,
} from "@/lib/instagram-hot-leads";
import {
  InstagramHotLeadNotFoundError,
  InstagramHotLeadsConflictError,
  mutateInstagramHotLeads,
} from "@/lib/instagram-hot-leads-store";

function workerRequest(req: NextRequest): boolean {
  const key = process.env.INSTAGRAM_HOT_LEADS_WORKER_KEY;
  const authorization = req.headers.get("authorization");
  if (!key || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(key);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function boundedJson(req: NextRequest): Promise<Record<string, unknown>> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > INSTAGRAM_HOT_LEADS_MAX_BODY_BYTES) throw new RangeError("Request body is too large");
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > INSTAGRAM_HOT_LEADS_MAX_BODY_BYTES) throw new RangeError("Request body is too large");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SyntaxError("Request body must be valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Request body must be an object");
  return value as Record<string, unknown>;
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await context.params;
    const patch = await boundedJson(req);
    const actor = workerRequest(req) ? "worker" : "browser";
    const now = new Date().toISOString();
    const saved = await mutateInstagramHotLeads((current) => {
      const index = current.leads.findIndex((row) => row.username.toLowerCase() === username.toLowerCase());
      if (index < 0) throw new InstagramHotLeadNotFoundError("Instagram hot lead not found");
      const leads = [...current.leads];
      leads[index] = applyInstagramHotLeadPatch(leads[index], { ...patch, actor }, now);
      return { ...current, leads };
    });
    return NextResponse.json(saved.leads.find((row) => row.username.toLowerCase() === username.toLowerCase()));
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError || error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof InstagramHotLeadNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof InstagramHotLeadsConflictError || (error instanceof Error && /stale/i.test(error.message))) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Conflict" }, { status: 409 });
    }
    if (error instanceof Error && /must|invalid|unexpected|required|transition|cannot|only|requires/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Instagram hot lead PATCH error", error);
    return NextResponse.json({ error: "Unable to update Instagram hot lead" }, { status: 500 });
  }
}
