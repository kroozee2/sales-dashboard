import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { applyHotInstagramPatch, HOT_INSTAGRAM_MAX_BODY_BYTES, publicHotInstagramContext } from "@/lib/hot-leads";
import { isHotLeadsOwner, isHotLeadsWorker } from "@/lib/hot-leads-auth";
import { HotLeadContextNotFoundError, HotLeadsStoreConflictError, mutateHotInstagram } from "@/lib/hot-leads-store";

async function boundedJson(req: NextRequest): Promise<Record<string, unknown>> {
  const length = req.headers.get("content-length");
  if (length && Number(length) > HOT_INSTAGRAM_MAX_BODY_BYTES) throw new RangeError("Request body is too large");
  const reader = req.body?.getReader();
  if (!reader) throw new SyntaxError("Request body must be valid JSON");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > HOT_INSTAGRAM_MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError("Request body is too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new SyntaxError("Request body must be valid JSON"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Request body must be an object");
  return value as Record<string, unknown>;
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ date: string; id: string }> }) {
  try {
    const { date, id } = await context.params;
    if (date !== "current") return NextResponse.json({ error: "Hot Lead context not found" }, { status: 404 });
    const worker = isHotLeadsWorker(req);
    if (!worker && !(await isHotLeadsOwner(req))) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    const patch = await boundedJson(req);
    const { data: lead, error: leadError } = await createLeadsAdminClient().from("leads").select("hot, prospect_stage").eq("id", id).maybeSingle();
    if (leadError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (lead.hot !== true && lead.prospect_stage !== "🔥 Hot Prospect") return NextResponse.json({ error: "Lead is no longer Hot" }, { status: 409 });
    const actor = worker ? "worker" : "browser";
    const saved = await mutateHotInstagram((current) => {
      const index = current.contexts.findIndex((row) => row.lead_id === id);
      if (index < 0) throw new HotLeadContextNotFoundError("Hot Lead Instagram context not found");
      const contexts = [...current.contexts];
      contexts[index] = applyHotInstagramPatch(contexts[index], { ...patch, actor });
      return { ...current, contexts };
    });
    const savedContext = saved.contexts.find((row) => row.lead_id === id);
    return NextResponse.json(worker || !savedContext ? savedContext : publicHotInstagramContext(savedContext));
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError || error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof HotLeadContextNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof HotLeadsStoreConflictError || (error instanceof Error && /stale/i.test(error.message))) return NextResponse.json({ error: error instanceof Error ? error.message : "Conflict" }, { status: 409 });
    if (error instanceof Error && /must|invalid|unexpected|required|transition|cannot|only|requires/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Hot Lead Instagram PATCH error", error);
    return NextResponse.json({ error: "Unable to update Hot Lead Instagram message" }, { status: 500 });
  }
}
