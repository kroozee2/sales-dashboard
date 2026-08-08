import { NextRequest, NextResponse } from "next/server";
import { db, currentMember, hashPassword, tempPassword, logActivity, type TeamMember } from "@/lib/team-auth";

export const runtime = "nodejs";

const safe = (m: TeamMember) => ({
  id: m.id, name: m.name, email: m.email, role: m.role, title: m.title, emoji: m.emoji,
  active: m.active, last_login_at: m.last_login_at, login_count: m.login_count,
  must_change_password: m.must_change_password, has_password: !!m.password_hash,
  created_at: m.created_at,
});

// GET — the roster, the activity feed, and who you are.
export async function GET(req: NextRequest) {
  const me = await currentMember(req.cookies.get("sos_user")?.value);
  const client = db();
  const [{ data: members }, { data: activity }] = await Promise.all([
    client.from("team_accounts").select("*").order("role", { ascending: true }).order("created_at", { ascending: true }),
    client.from("team_activity").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  return NextResponse.json({
    me: me ? safe(me) : null,
    members: (members ?? []).map((m) => safe(m as TeamMember)),
    activity: activity ?? [],
  });
}

// POST — add a teammate. Returns a temporary password ONCE, for you to pass on.
export async function POST(req: NextRequest) {
  const me = await currentMember(req.cookies.get("sos_user")?.value);
  if (!me || me.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can add teammates." }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as { name?: string; email?: string; title?: string; emoji?: string; role?: string };
  const name = (b.name ?? "").trim();
  const email = (b.email ?? "").trim().toLowerCase();
  if (!name || !email.includes("@")) return NextResponse.json({ error: "Name and a real email are required." }, { status: 400 });

  const temp = tempPassword();
  const { data, error } = await db().from("team_accounts").insert({
    name, email, title: b.title ?? null, emoji: b.emoji ?? "🧑",
    role: b.role === "owner" ? "owner" : "member",
    password_hash: hashPassword(temp),
    must_change_password: true,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({ id: me.id, name: me.name }, "team", `${me.name} added ${name} to the team`);
  return NextResponse.json({ member: safe(data as TeamMember), tempPassword: temp });
}

// PATCH — edit a teammate, or reissue a temporary password.
export async function PATCH(req: NextRequest) {
  const me = await currentMember(req.cookies.get("sos_user")?.value);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; resetPassword?: boolean } & Record<string, unknown>;
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // You can edit yourself; only the owner can edit anyone else.
  if (b.id !== me.id && me.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can edit other teammates." }, { status: 403 });
  }

  if (b.resetPassword) {
    if (me.role !== "owner") return NextResponse.json({ error: "Only the owner can reset passwords." }, { status: 403 });
    const temp = tempPassword();
    const { data, error } = await db().from("team_accounts")
      .update({ password_hash: hashPassword(temp), must_change_password: true })
      .eq("id", b.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logActivity({ id: me.id, name: me.name }, "team", `${me.name} issued a new temporary password for ${(data as TeamMember).name}`);
    return NextResponse.json({ member: safe(data as TeamMember), tempPassword: temp });
  }

  const allowed = ["name", "email", "title", "emoji", "active", "role"];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in b) clean[k] = b[k];
  if (!Object.keys(clean).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  if (typeof clean.email === "string") clean.email = clean.email.trim().toLowerCase();

  const { data, error } = await db().from("team_accounts").update(clean).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: safe(data as TeamMember) });
}
