import { NextRequest, NextResponse } from "next/server";
import { db, currentMember } from "@/lib/team-auth";

export const runtime = "nodejs";

// POST { path, label } — record that the signed-in person opened a page.
// Deliberately quiet: no session, no row. Repeat views of the same page inside
// 10 minutes collapse into one, so the feed reads as "what they worked on"
// rather than every stray click.
export async function POST(req: NextRequest) {
  const me = await currentMember(req.cookies.get("sos_user")?.value);
  if (!me) return NextResponse.json({ ok: false });

  const { path, label } = (await req.json().catch(() => ({}))) as { path?: string; label?: string };
  if (!path) return NextResponse.json({ ok: false });

  const client = db();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await client.from("team_activity")
    .select("id").eq("member_id", me.id).eq("path", path).eq("type", "view")
    .gte("created_at", since).limit(1).maybeSingle();
  if (recent) return NextResponse.json({ ok: true, deduped: true });

  await client.from("team_activity").insert({
    member_id: me.id, member_name: me.name, type: "view",
    summary: `Opened ${label || path}`, path,
  });
  return NextResponse.json({ ok: true });
}
