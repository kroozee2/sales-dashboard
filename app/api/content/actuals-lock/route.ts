import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { leaseTransition } from "@/lib/content-actuals-lock";

export const runtime = "nodejs";

const LOCK_KEY = "CONTENT_ACTUALS_SYNC_LOCK";
const MAX_LOCK_BODY_BYTES = 1_024;

async function readLockBody(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: 400 | 413; error: string }> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_LOCK_BODY_BYTES) return { ok: false, status: 413, error: "request body too large" };
  if (!req.body) return { ok: false, status: 400, error: "invalid lease request" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_LOCK_BODY_BYTES) {
      await reader.cancel();
      return { ok: false, status: 413, error: "request body too large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const memberCount = (name: "action" | "owner") => text.match(new RegExp(`"${name}"\\s*:`, "g"))?.length ?? 0;
    if (text.includes("\\") || memberCount("action") !== 1 || memberCount("owner") !== 1) return { ok: false, status: 400, error: "invalid lease request" };
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "invalid lease request" };
    const keys = Object.keys(body);
    if (keys.length !== 2 || !keys.includes("action") || !keys.includes("owner")) return { ok: false, status: 400, error: "invalid lease request" };
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "invalid lease request" };
  }
}

export async function POST(req: NextRequest) {
  const parsed = await readLockBody(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const action = typeof body?.action === "string" ? body.action : "";
  const owner = typeof body?.owner === "string" ? body.owner : "";
  const db = createLeadsAdminClient();
  const currentResult = await db.from("settings").select("value").eq("key", LOCK_KEY).maybeSingle();
  if (currentResult.error) return NextResponse.json({ error: "lock read failed" }, { status: 500 });
  const currentValue = typeof currentResult.data?.value === "string" ? currentResult.data.value : null;
  const transition = leaseTransition(currentValue, action, owner, Date.now());
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });

  const nextRow = { key: LOCK_KEY, value: transition.value, updated_at: new Date().toISOString() };
  if (currentValue === null) {
    const inserted = await db.from("settings").insert(nextRow).select("value").maybeSingle();
    if (inserted.error || !inserted.data) return NextResponse.json({ error: "lock changed; retry" }, { status: 409 });
  } else {
    const updated = await db.from("settings").update(nextRow).eq("key", LOCK_KEY).eq("value", currentValue).select("value").maybeSingle();
    if (updated.error) return NextResponse.json({ error: "lock update failed" }, { status: 500 });
    if (!updated.data) return NextResponse.json({ error: "lock changed; retry" }, { status: 409 });
  }
  const lease = JSON.parse(transition.value) as { expires_at: string };
  return NextResponse.json({ ok: true, expires_at: lease.expires_at });
}
