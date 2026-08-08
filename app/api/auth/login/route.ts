import { NextRequest, NextResponse } from "next/server";
import { db, verifyPassword, signUser, USER_COOKIE, logActivity, type TeamMember } from "@/lib/team-auth";

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

export async function POST(req: NextRequest) {
  const masterPassword = process.env.SALESOS_PASSWORD;
  const sessionToken = process.env.SALESOS_SESSION_TOKEN;
  if (!sessionToken) {
    return NextResponse.json({ error: "Server misconfigured: SALESOS_SESSION_TOKEN not set." }, { status: 503 });
  }

  let email = "", password = "";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!password) return NextResponse.json({ error: "Enter your password" }, { status: 400 });

  // 1. Team account
  if (email) {
    const { data } = await db().from("team_accounts").select("*").ilike("email", email).maybeSingle();
    const member = data as TeamMember | null;

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
    // Fall through to the master password — an email typo shouldn't hard-block.
  }

  // 2. Master password (owner fallback)
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
