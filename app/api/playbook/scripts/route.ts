import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const channel = searchParams.get("channel");

  const supabase = createLeadsAdminClient();
  let q = supabase.from("message_scripts").select("*").order("order_index", { ascending: true });
  if (category) q = q.eq("category", category);
  if (channel) q = q.eq("channel", channel);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scripts: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = createLeadsAdminClient();
  const { data: max } = await supabase
    .from("message_scripts")
    .select("order_index")
    .eq("category", body.category ?? "nurture")
    .order("order_index", { ascending: false })
    .limit(1)
    .single();
  const order_index = (max?.order_index ?? -1) + 1;
  const { data, error } = await supabase
    .from("message_scripts")
    .insert({ ...body, order_index })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ script: data });
}
