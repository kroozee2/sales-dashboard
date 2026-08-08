import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export async function GET() {
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from("team_sops")
    .select("*")
    .order("cadence")
    .order("order_index", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sops: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from("team_sops")
    .insert(body)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sop: data });
}
