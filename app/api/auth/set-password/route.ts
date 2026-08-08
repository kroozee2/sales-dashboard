import { NextRequest, NextResponse } from "next/server";
import { db, hashPassword, verifyPassword, currentMember, logActivity } from "@/lib/team-auth";

export const runtime = "nodejs";

/**
 * Set your own password. Used two ways:
 *   - first sign-in, replacing the temporary password we handed out
 *   - any later change from the Team page
 *
 * Requires a signed-in session (the sos_user cookie) AND the current password,
 * so a borrowed browser can't silently take over the account.
 */
export async function POST(req: NextRequest) {
  const me = await currentMember(req.cookies.get("sos_user")?.value);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { currentPassword, newPassword } = (await req.json().catch(() => ({}))) as {
    currentPassword?: string; newPassword?: string;
  };

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "Pick a password of at least 8 characters." }, { status: 400 });
  }
  // Verify what they have now — unless no password is set at all yet.
  if (me.password_hash && !verifyPassword(currentPassword ?? "", me.password_hash)) {
    return NextResponse.json({ error: "That current password isn't right." }, { status: 401 });
  }

  const { error } = await db().from("team_accounts").update({
    password_hash: hashPassword(newPassword),
    must_change_password: false,
  }).eq("id", me.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({ id: me.id, name: me.name }, "password", `${me.name} set a new password`);
  return NextResponse.json({ ok: true });
}
