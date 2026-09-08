import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CLIENT_STATUSES, EDITABLE_FIELDS, applyStep, isRunbookKey,
  type ClientAccount, type OnboardingState,
} from "@/lib/client-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The writable half of a client record.
 *
 * Helm's proxy is GET-only, so this is where every edit lands. Nothing here
 * touches Helm; the two are merged when the clients page reads them.
 */

const db = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
    process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!,
  );

const NUMERIC = new Set(["deal_value", "mrr"]);
const MAX_TEXT = 4_000;

function cleanField(key: string, value: unknown): unknown {
  if (value === null || value === "") return null;
  if (NUMERIC.has(key)) {
    const n = typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`${key} must be a number`);
    return n;
  }
  if (key === "archived") {
    if (typeof value !== "boolean") throw new Error("archived must be true or false");
    return value;
  }
  if (key === "status") {
    if (typeof value !== "string" || !(CLIENT_STATUSES as readonly string[]).includes(value)) {
      throw new Error(`status must be one of: ${CLIENT_STATUSES.join(", ")}`);
    }
    return value;
  }
  if (typeof value !== "string") throw new Error(`${key} must be text`);
  if (value.length > MAX_TEXT) throw new Error(`${key} is too long`);
  return value.trim();
}

/** Keep only what a client may send, so one stray key can't sink a save. */
function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (Object.hasOwn(body, key)) out[key] = cleanField(key, body[key]);
  }
  return out;
}

export async function GET() {
  const { data, error } = await db()
    .from("client_accounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Client records are temporarily unavailable" }, { status: 502 });
  return NextResponse.json({ accounts: (data ?? []) as ClientAccount[] });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  let record: Record<string, unknown>;
  try { record = pickEditable(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid field" }, { status: 400 }); }

  if (typeof record.name !== "string" || !record.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await db().from("client_accounts").insert(record).select().single();
  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "That client is already linked to a Helm record" : "Could not create the client" },
      { status: duplicate ? 409 : 500 },
    );
  }
  return NextResponse.json({ account: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let update: Record<string, unknown>;
  try { update = pickEditable(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid field" }, { status: 400 }); }

  // A runbook step is patched by key so two people ticking different steps
  // don't overwrite each other's work.
  if (Object.hasOwn(body, "step")) {
    const step = body.step as { key?: unknown; done?: unknown; note?: unknown } | null;
    if (!step || !isRunbookKey(step.key)) {
      return NextResponse.json({ error: "step.key must be a runbook step" }, { status: 400 });
    }
    const { data: current, error: readError } = await db()
      .from("client_accounts").select("onboarding").eq("id", id).maybeSingle();
    if (readError || !current) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    update.onboarding = applyStep(
      (current.onboarding ?? {}) as OnboardingState,
      step.key,
      {
        done: typeof step.done === "boolean" ? step.done : undefined,
        note: typeof step.note === "string" ? step.note.slice(0, MAX_TEXT) : undefined,
      },
    );
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await db()
    .from("client_accounts").update(update).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the change" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  return NextResponse.json({ account: data });
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await db().from("client_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not remove the client" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
