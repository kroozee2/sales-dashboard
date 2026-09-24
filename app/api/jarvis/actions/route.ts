import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// The approval queue. Jarvis proposes a change, it waits here, and it only
// happens once Andrew says so.
//
// Approval is a conditional update: the row moves pending -> approved only if it
// is still pending, and the update returns nothing if somebody already did it.
// That is the idempotency guarantee, so a double click or a retried request
// cannot apply the same change twice.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  const db = createLeadsAdminClient();
  const query = db.from("jarvis_actions").select("*").order("created_at", { ascending: false }).limit(40);
  const { data, error } = status === "all" ? await query : await query.eq("status", status);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; decision?: string };
  const { id, decision } = body;
  if (!id || (decision !== "approve" && decision !== "discard")) {
    return NextResponse.json({ error: "id and decision (approve | discard) are required" }, { status: 400 });
  }

  const db = createLeadsAdminClient();

  if (decision === "discard") {
    const { data, error } = await db.from("jarvis_actions")
      .update({ status: "discarded", decided_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending").select("*").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "That action is no longer pending." }, { status: 409 });
    return NextResponse.json({ action: data });
  }

  // Claim it first. If this returns nothing the action was already handled.
  const { data: claimed, error: claimError } = await db.from("jarvis_actions")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending").select("*").maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: "That action is no longer pending." }, { status: 409 });

  try {
    const { runWriteTool } = await import("@/lib/jarvis-writes");
    const { result, ok } = await runWriteTool(
      claimed.tool as string,
      (claimed.input ?? {}) as Record<string, unknown>,
    );
    const failed = !ok;
    const { data } = await db.from("jarvis_actions")
      .update({ status: failed ? "failed" : "executed", result, executed_at: new Date().toISOString() })
      .eq("id", id).select("*").maybeSingle();
    return NextResponse.json({ action: data, ok: !failed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Execution failed";
    await db.from("jarvis_actions").update({ status: "failed", result: message, executed_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
