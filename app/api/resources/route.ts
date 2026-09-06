import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY!
);

export async function GET() {
  const { data, error } = await db().from("resources").select("*").eq("active", true).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resources: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { title: string; type: string; about?: string; url?: string; value_scripts?: unknown };
  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const { data, error } = await db().from("resources").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resource: data });
}

export async function PATCH(req: NextRequest) {
  const { id, ...fields } = await req.json() as { id: string } & Record<string, unknown>;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await db().from("resources").update(fields).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resource: data });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await db().from("resources").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
