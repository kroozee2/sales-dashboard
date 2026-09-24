import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await createLeadsAdminClient()
    .from("agent_skills").select("*").order("source").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ skills: data ?? [], count: data?.length ?? 0 });
}
