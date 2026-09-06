import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// GET — all active tasks
export async function GET() {
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("archived", false)
    .order("done", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — create task
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await db.from("tasks").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH — update task
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  updates.updated_at = new Date().toISOString();
  // Keep the done flag and the status column telling the same story, whichever
  // one the client sends, and stamp/clear completion time as it flips.
  if (Object.prototype.hasOwnProperty.call(updates, "status") && !Object.prototype.hasOwnProperty.call(updates, "done")) {
    updates.done = updates.status === "done";
  }
  if (Object.prototype.hasOwnProperty.call(updates, "done")) {
    updates.completed_at = updates.done ? new Date().toISOString() : null;
    if (!Object.prototype.hasOwnProperty.call(updates, "status")) {
      updates.status = updates.done ? "done" : "todo";
    }
  }
  const { data, error } = await db.from("tasks").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove task
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await db.from("tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
