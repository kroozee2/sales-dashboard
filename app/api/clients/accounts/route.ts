import { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_STATUSES, OFF_BOARDED_STATUS, applyStep, isRunbookKey, type OnboardingState,
} from "@/lib/client-accounts";
import {
  ROSTER_COLUMNS, ROSTER_FIELD_COLUMN, helmDb, toMergedClient, type HelmClientRow,
} from "@/lib/helm-clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The client roster: read and written straight onto Helm's `clients` table.
 *
 * This used to write to a separate Sales OS table, which meant a client had two
 * rows and a status changed in one place never reached the other. There is one
 * row per client now, and this is the surface that edits it.
 */

const NUMERIC = new Set(["deal_value", "mrr"]);
const MAX_TEXT = 4_000;
const NOT_CONNECTED: Record<"unconfigured" | "auth", string> = {
  unconfigured: "The client database is not connected. Set NEXT_PUBLIC_SUPABASE_HELM_URL, SUPABASE_HELM_ANON_KEY, HELM_OWNER_EMAIL and HELM_OWNER_PASSWORD.",
  auth: "The client database rejected our sign-in. Check HELM_OWNER_EMAIL and HELM_OWNER_PASSWORD.",
};

/** The connection, or the reason there isn't one, said plainly. */
async function connect() {
  const connection = await helmDb();
  return connection.ok
    ? { db: connection.db, fail: null }
    : { db: null, fail: NextResponse.json({ error: NOT_CONNECTED[connection.reason] }, { status: 503 }) };
}

function cleanField(key: string, value: unknown): unknown {
  if (value === null || value === "") return null;
  if (NUMERIC.has(key)) {
    const n = typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`${key} must be a number`);
    return n;
  }
  // `archived` is the roster's word; the column is `is_active`, so it inverts.
  if (key === "archived") {
    if (typeof value !== "boolean") throw new Error("archived must be true or false");
    return !value;
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

/** Only the roster's own fields, mapped to their columns. One stray key cannot sink a save. */
export function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(ROSTER_FIELD_COLUMN)) {
    if (Object.hasOwn(body, field)) out[column] = cleanField(field, body[field]);
  }
  return out;
}

export async function GET() {
  const { db, fail } = await connect();
  if (!db) return fail;

  const { data, error } = await db
    .from("clients")
    .select(ROSTER_COLUMNS)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: "The client roster is temporarily unavailable" }, { status: 502 });

  const rows = (data ?? []) as unknown as HelmClientRow[];
  return NextResponse.json({ clients: rows.map(toMergedClient) });
}

export async function POST(req: NextRequest) {
  const { db, fail } = await connect();
  if (!db) return fail;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  let record: Record<string, unknown>;
  try { record = pickEditable(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid field" }, { status: 400 }); }

  if (typeof record.name !== "string" || !record.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (record.is_active === undefined) record.is_active = true;

  const { data, error } = await db.from("clients").insert(record).select(ROSTER_COLUMNS).single();
  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "A client with that email already exists" : "Could not create the client" },
      { status: duplicate ? 409 : 500 },
    );
  }
  return NextResponse.json({ client: toMergedClient(data as unknown as HelmClientRow) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { db, fail } = await connect();
  if (!db) return fail;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let update: Record<string, unknown>;
  try { update = pickEditable(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid field" }, { status: 400 }); }

  // A runbook step is patched by key, so two people ticking different steps
  // don't overwrite each other's work.
  if (Object.hasOwn(body, "step")) {
    const step = body.step as { key?: unknown; done?: unknown; note?: unknown } | null;
    if (!step || !isRunbookKey(step.key)) {
      return NextResponse.json({ error: "step.key must be a runbook step" }, { status: 400 });
    }
    const { data: current, error: readError } = await db
      .from("clients").select("onboarding").eq("id", id).maybeSingle();
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

  const { data, error } = await db
    .from("clients").update(update).eq("id", id).select(ROSTER_COLUMNS).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the change" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  return NextResponse.json({ client: toMergedClient(data as unknown as HelmClientRow) });
}

/**
 * Off-boarding, not deletion. Seventy-odd tables reference a client row —
 * calls, check-ins, notes, portal accounts — so removing one would take their
 * history with it. This marks them inactive, which is what "remove" means here.
 */
export async function DELETE(req: NextRequest) {
  const { db, fail } = await connect();
  if (!db) return fail;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await db
    .from("clients")
    .update({ is_active: false, status: OFF_BOARDED_STATUS, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Could not off-board the client" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
