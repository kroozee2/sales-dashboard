import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export async function GET() {
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from("script_sections")
    .select("*")
    .order("order_index", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sections: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = createLeadsAdminClient();
  const { data: max } = await supabase
    .from("script_sections")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1)
    .single();
  const order_index = (max?.order_index ?? -1) + 1;
  const { data, error } = await supabase
    .from("script_sections")
    .insert({
      order_index,
      emoji: body.emoji ?? "📝",
      title: body.title ?? "New Section",
      transition_text: body.transition_text ?? null,
      questions: body.questions ?? [],
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ section: data });
}
