// The client roster, read and written where it actually lives.
//
// Until now Sales OS saw clients through a GET-only HTTP proxy and kept its own
// `client_accounts` table for the few fields Helm had no column for. That meant
// two rows per client and no single source of truth: a status changed here did
// not reach Helm, and a status changed in Helm did not reach here.
//
// So Sales OS now talks to Helm's `clients` table directly. One row per client.
// Helm and the Mastermind Portal read the same row, so an edit made here is the
// edit everywhere, and nothing had to be copied between databases.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MergedClient, OnboardingState } from "@/lib/client-accounts";

/** Columns the roster reads. Named rather than `*`, so a schema change here is deliberate. */
export const ROSTER_COLUMNS = [
  "id", "name", "email", "phone", "status", "membership", "is_active", "phase",
  "start_date", "last_contact_at", "headshot_url", "notes", "ai_next_action",
  "deal_value", "mrr", "owner", "source", "whatsapp", "onboarding",
  "created_at", "updated_at",
].join(",");

export type HelmClientRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  membership: string | null;
  is_active: boolean | null;
  phase: string | null;
  start_date: string | null;
  last_contact_at: string | null;
  headshot_url: string | null;
  notes: string | null;
  ai_next_action: string | null;
  deal_value: number | null;
  mrr: number | null;
  owner: string | null;
  source: string | null;
  whatsapp: string | null;
  onboarding: OnboardingState | null;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * Signed in as the owner, which is how Helm itself reaches this database.
 *
 * Helm holds no service key: it signs in with the owner's credentials so RLS
 * sees an `authenticated` admin. Copying that is better than minting a
 * service_role key for Sales OS, because it goes through the same policies
 * Helm and the Portal go through rather than bypassing them.
 *
 * The session is reused until it is nearly expired, so a page of edits is one
 * sign-in and not one per keystroke.
 */
export type HelmConnection =
  | { ok: true; db: SupabaseClient }
  | { ok: false; reason: "unconfigured" | "auth" };

let session: { db: SupabaseClient; expiresAt: number } | null = null;

/** Exported for tests; a fresh sign-in on the next call. */
export function resetHelmSession() {
  session = null;
}

export async function helmDb(now = Date.now()): Promise<HelmConnection> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_HELM_URL;
  const key = process.env.SUPABASE_HELM_ANON_KEY;
  const email = process.env.HELM_OWNER_EMAIL;
  const password = process.env.HELM_OWNER_PASSWORD;
  if (!url || !key || !email || !password) return { ok: false, reason: "unconfigured" };

  // A minute of headroom, so a request never starts on a token that expires
  // while it is in flight.
  if (session && session.expiresAt > now + 60_000) return { ok: true, db: session.db };

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    session = null;
    return { ok: false, reason: "auth" };
  }
  session = {
    db,
    expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : now + 1_800_000,
  };
  return { ok: true, db };
}

/**
 * One Helm row, in the shape the roster UI already speaks.
 *
 * `editable` is always true now: there is no such thing as a client we can see
 * but cannot change, which is what the old two-table split produced.
 */
export function toMergedClient(row: HelmClientRow): MergedClient {
  return {
    key: row.id,
    accountId: row.id,
    helmId: row.id,
    name: row.name ?? "Unnamed client",
    email: row.email,
    phone: row.phone,
    program: row.membership,
    status: row.status,
    owner: row.owner ?? "Andrew",
    dealValue: row.deal_value,
    mrr: row.mrr,
    startDate: row.start_date,
    addedAt: row.created_at,
    notes: row.notes,
    whatsapp: row.whatsapp,
    onboarding: row.onboarding ?? {},
    helm: {
      membership: row.membership,
      isActive: row.is_active ?? false,
      lastContactAt: row.last_contact_at,
      portalStatus: null,
      callsAttended: null,
      headshotUrl: row.headshot_url,
    },
    editable: true,
  };
}

/** What the roster is allowed to write, mapped to the column it lands in. */
export const ROSTER_FIELD_COLUMN: Record<string, string> = {
  name: "name",
  email: "email",
  phone: "phone",
  whatsapp: "whatsapp",
  program: "membership",
  status: "status",
  owner: "owner",
  source: "source",
  notes: "notes",
  deal_value: "deal_value",
  mrr: "mrr",
  start_date: "start_date",
  archived: "is_active",
};
