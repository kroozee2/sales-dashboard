import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// GET — all active projects, each with its task counts (for live progress)
export async function GET() {
  const [{ data: projects, error }, { data: tasks }] = await Promise.all([
    db
      .from("projects")
      .select("*")
      .eq("archived", false)
      .order("sort_order", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    db.from("tasks").select("project_id, done").eq("archived", false),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, { total: number; done: number }>();
  for (const t of tasks ?? []) {
    if (!t.project_id) continue;
    const c = counts.get(t.project_id) ?? { total: 0, done: 0 };
    c.total++;
    if (t.done) c.done++;
    counts.set(t.project_id, c);
  }

  const enriched = (projects ?? []).map((p) => {
    const c = counts.get(p.id) ?? { total: 0, done: 0 };
    return { ...p, task_total: c.total, task_done: c.done };
  });
  return NextResponse.json(enriched);
}

// POST — create project
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await db.from("projects").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH — update project
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db.from("projects").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove project (its tasks stay, unlinked)
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await db.from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
