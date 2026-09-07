import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { db, verifyPassword, signUser, identitySigningConfiguredWithSettings, USER_COOKIE, logActivity, type TeamMember } from "@/lib/team-auth";
import { parseJsonWithUniqueKeys } from "@/lib/agent-workforce";

export const runtime = "nodejs";

/**
 * Sign in and get a session cookie.
 *
 * Two ways in:
 *   1. Team account — email + your own password (what Andrew and Jameson use).
 *   2. Master password — the original shared SALESOS_PASSWORD, no email needed.
 *      Kept deliberately: if the team table or a password hash is ever wrong,
 *      this is the door that still opens. It signs you in as the owner.
 *
 * On success we set:
 *   sos_session — the gate cookie proxy.ts checks (unchanged behaviour)
 *   sos_user    — signed "who am I", for the Team feed and password screens
 */
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 90, // 90 days
};

/** Constant-time-ish compare. */
function slowEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function readLoginBody(req: NextRequest): Promise<{ email: string; password: string }> {
  if (!req.body) throw new Error("Bad request");
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > 8_192) { await reader.cancel(); throw new Error("Bad request"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const parsed = parseJsonWithUniqueKeys(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Bad request");
  const input = parsed as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "email" && key !== "password")) throw new Error("Bad request");
  const email = input.email === undefined ? "" : input.email;
  if (typeof email !== "string" || email.length > 320 || /[\u0000-\u001f\u007f-\u009f]/.test(email)) throw new Error("Bad request");
  if (typeof input.password !== "string" || !input.password || input.password.length > 1_024 || /[\u0000-\u001f\u007f-\u009f]/.test(input.password)) throw new Error("Bad request");
  return { email: email.trim().toLowerCase(), password: input.password };
}

async function loginRateLimited(req: NextRequest, email: string, memberId: string | null): Promise<boolean> {
  const secret = process.env.SALESOS_IDENTITY_SECRET!;
  const source = (req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const digest = (scope: string, value: string) => createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
  const paths = [`login:source:${digest("source", source)}`, `login:account:${digest("account", email || "<master>")}`];
  if (memberId) paths.push(`login:member:${digest("member", memberId)}`);
  const client = db();
  const { error: insertError } = await client.from("team_activity").insert(paths.map((path) => ({ member_id: null, member_name: "Unknown", type: "login_attempt", summary: "Login attempt", path })));
  if (insertError) throw new Error("Login protection unavailable");
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const counts = await Promise.all(paths.map((path) => client.from("team_activity").select("id", { count: "exact", head: true }).eq("type", "login_attempt").eq("path", path).gte("created_at", cutoff)));
  if (counts.some((result) => result.error)) throw new Error("Login protection unavailable");
  return counts.some((result) => (result.count ?? 0) > 10);
}

export async function POST(req: NextRequest) {
  const masterPassword = process.env.SALESOS_PASSWORD;
  const sessionToken = process.env.SALESOS_SESSION_TOKEN;
  if (!sessionToken) {
    return NextResponse.json({ error: "Server misconfigured: SALESOS_SESSION_TOKEN not set." }, { status: 503 });
  }
  if (!await identitySigningConfiguredWithSettings()) {
    return NextResponse.json({ error: "Server identity signing is not configured." }, { status: 503 });
  }

  let email = "", password = "";
  try {
    ({ email, password } = await readLoginBody(req));
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  let member: TeamMember | null = null;
  if (email) {
    const { data, error } = await db().from("team_accounts").select("*").eq("email", email).maybeSingle();
    if (error) return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 503 });
    member = data as TeamMember | null;
  }
  try {
    if (await loginRateLimited(req, email, member?.id ?? null)) return NextResponse.json({ error: "Too many login attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": "900" } });
  } catch {
    return NextResponse.json({ error: "Login protection is temporarily unavailable." }, { status: 503 });
  }

  // 1. Team account, resolved by exact normalized email.
  if (email) {
    if (member && member.active && verifyPassword(password, member.password_hash)) {
      await db().from("team_accounts").update({
        last_login_at: new Date().toISOString(),
        login_count: (member.login_count ?? 0) + 1,
      }).eq("id", member.id);
      await logActivity({ id: member.id, name: member.name }, "login", `${member.name} signed in`);

      const res = NextResponse.json({
        ok: true,
        mustChangePassword: member.must_change_password,
        member: { id: member.id, name: member.name, email: member.email, role: member.role },
      });
      res.cookies.set({ name: "sos_session", value: sessionToken, ...COOKIE_OPTS });
      res.cookies.set({ name: USER_COOKIE, value: signUser(member.id), ...COOKIE_OPTS });
      return res;
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
  }

  // 2. Master password (owner fallback). It is reachable only without an email,
  // so every attempt shares the stable <master> account throttle bucket.
  if (masterPassword && slowEqual(password, masterPassword)) {
    const { data } = await db().from("team_accounts").select("*").eq("role", "owner").eq("active", true).limit(1).maybeSingle();
    const owner = data as TeamMember | null;
    const res = NextResponse.json({ ok: true, mustChangePassword: false, member: owner ? { id: owner.id, name: owner.name, email: owner.email, role: owner.role } : null });
    res.cookies.set({ name: "sos_session", value: sessionToken, ...COOKIE_OPTS });
    if (owner) {
      res.cookies.set({ name: USER_COOKIE, value: signUser(owner.id), ...COOKIE_OPTS });
      await logActivity({ id: owner.id, name: owner.name }, "login", `${owner.name} signed in (master password)`);
    }
    return res;
  }

  // Small delay blunts trivial online guessing without hurting real logins.
  await new Promise((r) => setTimeout(r, 600));
  return NextResponse.json({ error: email ? "That email and password don't match." : "Incorrect password" }, { status: 401 });
}
