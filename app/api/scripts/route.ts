import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  let q = db().from("dm_scripts").select("*").eq("active", true).order("category").order("sort");
  if (category) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scripts: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { category: string; title: string; body?: string; kind?: string; media_url?: string; favorite?: boolean; sort?: number };
  if (!body.category || !body.title) {
    return NextResponse.json({ error: "category and title required" }, { status: 400 });
  }
  // A script needs body; voice/gif/resource need a media_url instead
  const kind = body.kind ?? "script";
  if (kind === "script" && !body.body) {
    return NextResponse.json({ error: "body required for a script" }, { status: 400 });
  }
  if (kind !== "script" && !body.media_url) {
    return NextResponse.json({ error: "media_url required for a voice note, gif, or resource" }, { status: 400 });
  }
  const insert = {
    category: body.category,
    title: body.title,
    body: body.body ?? "",
    kind,
    media_url: body.media_url ?? null,
    favorite: body.favorite ?? false,
    sort: body.sort ?? 0,
  };
  const { data, error } = await db().from("dm_scripts").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ script: data });
}

export async function PATCH(req: NextRequest) {
  const { id, ...fields } = await req.json() as { id: string } & Record<string, unknown>;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await db().from("dm_scripts").update(fields).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ script: data });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // soft delete — keep history
  const { error } = await db().from("dm_scripts").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
