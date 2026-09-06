import { createClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";

// Team accounts for the Sales OS. Two people today (Andrew, Jameson), but the
// shape is a normal users table so adding a third is just a row.
//
// IMPORTANT: the access gate in proxy.ts still turns on the single shared
// SALESOS_SESSION_TOKEN. Login sets that cookie on success, so signing in with
// your own email/password gets you the same gate as before — plus a second
// signed cookie that says WHO you are, which is what the Team activity feed and
// the password screens read. Keeping the gate untouched means a bug in here can
// never lock anyone out of the app.

export const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

export const USER_COOKIE = "sos_user";

export type TeamMember = {
  id: string; name: string; email: string; role: string; title: string | null;
  emoji: string | null; password_hash: string | null; must_change_password: boolean;
  active: boolean; last_login_at: string | null; login_count: number; created_at: string;
};

// ── Passwords ────────────────────────────────────────────────────────────────
// scrypt with a per-password salt. Format: scrypt$<salt hex>$<hash hex>.
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length);
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** A high-entropy temporary credential. It must be changed after first login. */
export function tempPassword(): string {
  return `7FC-${randomBytes(24).toString("base64url")}`;
}

// ── Identity cookie ──────────────────────────────────────────────────────────
// Identity signatures use a dedicated server-only secret. The shared browser
// session token is intentionally never accepted as signing material.
export const IDENTITY_SECRET_CONFLICT_ENV_NAMES = [
  "AIRTABLE_PAT",
  "ANTHROPIC_API_KEY",
  "APIFY_TOKEN",
  "CARTESIA_API_KEY",
  "CFF_ADMIN_PASSWORD",
  "FATHOM_API_KEY",
  "FIRECRAWL_API_KEY",
  "FLOW_ADMIN_SECRET",
  "GEMINI_API_KEY",
  "GOOGLE_CALENDAR_ICAL_URL",
  "GHL_API_KEY",
  "HELM_ENROLL_SECRET",
  "HELM_SALESOS_SECRET",
  "INSTAGRAM_HOT_LEADS_WORKER_KEY",
  "NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY",
  "PANDADOC_API_KEY",
  "SALESOS_AGENT_KEY",
  "SALESOS_PASSWORD",
  "SALESOS_SESSION_TOKEN",
  "SKOOL_ADMIN_SECRET",
  "STRIPE_SECRET_KEY",
  "SUPABASE_CALLS_SERVICE_KEY",
] as const;

export const IDENTITY_SECRET_CONFLICT_SETTING_KEYS = [
  "ANTHROPIC_API_KEY",
  "GHL_API_KEY",
  "GOOGLE_CALENDAR_ICAL_URL",
  "STRIPE_SECRET_KEY",
] as const;

function identitySecret(): string | null {
  const value = process.env.SALESOS_IDENTITY_SECRET;
  if (!value || value.length < 32) return null;
  if (IDENTITY_SECRET_CONFLICT_ENV_NAMES.some((name) => process.env[name] === value)) return null;
  return value;
}

export function identitySigningConfigured(): boolean {
  return identitySecret() !== null;
}

export function identitySecretConflictsWithStoredValues(secret: string, values: unknown[]): boolean {
  return values.some((value) => typeof value === "string" && value === secret);
}

export async function identitySigningConfiguredWithSettings(): Promise<boolean> {
  const secret = identitySecret();
  if (!secret) return false;
  // Compare against every stored setting value. The manageable API is allowlisted,
  // but legacy/manual rows must not create an identity-signing collision either.
  const { data, error } = await db().from("settings").select("value");
  if (error) return false;
  return !identitySecretConflictsWithStoredValues(secret, (data ?? []).map((row) => row.value));
}

export function signUser(memberId: string): string {
  const secret = identitySecret();
  if (!secret) throw new Error("SALESOS_IDENTITY_SECRET is not configured");
  const payload = `v1.${memberId}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function readUserCookie(value: string | undefined | null): string | null {
  const secret = identitySecret();
  if (!secret || !value) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !/^[a-f0-9]{64}$/.test(parts[2])) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(parts[2], "hex"), Buffer.from(expected, "hex"))) return null;
  } catch { return null; }
  return parts[1];
}

/** The signed-in member, or null. */
export async function currentMember(cookieValue: string | undefined | null): Promise<TeamMember | null> {
  if (!await identitySigningConfiguredWithSettings()) return null;
  const id = readUserCookie(cookieValue);
  if (!id) return null;
  const { data } = await db().from("team_accounts").select("*").eq("id", id).maybeSingle();
  return (data as TeamMember) ?? null;
}


export function teamAccountMutationAllowed(member: Pick<TeamMember, "id" | "role" | "active">, targetId: string, fields: Iterable<string>): boolean {
  if (!member.active) return false;
  const owner = member.role === "owner";
  if (targetId !== member.id && !owner) return false;
  for (const field of fields) if ((field === "role" || field === "active") && !owner) return false;
  return true;
}

// ── Activity ─────────────────────────────────────────────────────────────────
export async function logActivity(member: { id: string; name: string } | null, type: string, summary: string, path?: string) {
  try {
    await db().from("team_activity").insert({
      member_id: member?.id ?? null,
      member_name: member?.name ?? "Unknown",
      type, summary, path: path ?? null,
    });
  } catch {
    // Activity is a nice-to-have; never let it break a real request.
  }
}
