import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export async function POST(req: Request) {
  const { order }: { order: { id: string; order_index: number }[] } = await req.json();
  const supabase = createLeadsAdminClient();
  const updates = order.map(({ id, order_index }) =>
    supabase.from("script_sections").update({ order_index }).eq("id", id)
  );
  await Promise.all(updates);
  return NextResponse.json({ success: true });
}
