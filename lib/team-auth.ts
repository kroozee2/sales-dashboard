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

/** A readable temporary password — easy to send, hard to guess. */
export function tempPassword(): string {
  const words = ["Summit", "Anchor", "Harbor", "Beacon", "Compass", "Meridian", "Cascade", "Quarry"];
  const w = words[randomBytes(1)[0] % words.length];
  const n = 1000 + (randomBytes(2).readUInt16BE(0) % 9000);
  return `${w}-${n}-7FC`;
}

// ── Identity cookie ──────────────────────────────────────────────────────────
// "<memberId>.<hmac>" so it can't be forged client-side. Signed with the same
// session secret the gate already relies on.
function secret(): string {
  return process.env.SALESOS_SESSION_TOKEN ?? "";
}

export function signUser(memberId: string): string {
  const sig = createHmac("sha256", secret()).update(memberId).digest("hex").slice(0, 32);
  return `${memberId}.${sig}`;
}

export function readUserCookie(value: string | undefined | null): string | null {
  if (!value) return null;
  const idx = value.lastIndexOf(".");
  if (idx < 1) return null;
  const id = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = createHmac("sha256", secret()).update(id).digest("hex").slice(0, 32);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  return id;
}

/** The signed-in member, or null. */
export async function currentMember(cookieValue: string | undefined | null): Promise<TeamMember | null> {
  const id = readUserCookie(cookieValue);
  if (!id) return null;
  const { data } = await db().from("team_accounts").select("*").eq("id", id).maybeSingle();
  return (data as TeamMember) ?? null;
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
