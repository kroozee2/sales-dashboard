import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export async function GET() {
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from("training_videos")
    .select("*")
    .order("category")
    .order("order_index", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ videos: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from("training_videos")
    .insert(body)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data });
}
