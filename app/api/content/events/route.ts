import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";

/**
 * Events, as the Marketing board reads and writes them.
 *
 * Writes go through an allowlist. The previous version spread the request body
 * straight into the update, so any key a caller invented reached the table —
 * `id` and `created_at` included.
 */
const EDITABLE = new Set([
  "title", "event_type", "start_date", "end_date", "price",
  "spots_goal", "signups", "page_url", "location", "notes",
]);

const NUMERIC = new Set(["price", "spots_goal", "signups"]);
const DATES = new Set(["start_date", "end_date"]);
const MAX_TEXT = 4_000;

function clean(key: string, value: unknown): unknown {
  if (value === null || value === "") return key === "signups" ? 0 : null;
  if (NUMERIC.has(key)) {
    const n = typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) throw new Error(`${key} must be a number that is not negative`);
    return key === "price" ? n : Math.floor(n);
  }
  if (DATES.has(key)) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} must be a date`);
    return value;
  }
  if (typeof value !== "string") throw new Error(`${key} must be text`);
  if (value.length > MAX_TEXT) throw new Error(`${key} is too long`);
  return value.trim();
}

function pick(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE) if (Object.hasOwn(body, key)) out[key] = clean(key, body[key]);
  return out;
}

export async function GET() {
  const { data } = await contentDb().from("content_events").select("*").order("start_date", { ascending: true });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  let record: Record<string, unknown>;
  try { record = pick(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid field" }, { status: 400 }); }

  if (typeof record.title !== "string" || !record.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const { data, error } = await contentDb().from("content_events").insert(record).select().single();
  if (error) return NextResponse.json({ error: "Could not create the event" }, { status: 500 });
  return NextResponse.json({ event: data });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let update: Record<string, unknown>;
  try { update = pick(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid field" }, { status: 400 }); }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const { data, error } = await contentDb().from("content_events").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Could not save the change" }, { status: 500 });
  return NextResponse.json({ event: data });
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await contentDb().from("content_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not remove the event" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
