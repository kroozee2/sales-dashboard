import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { HOT_INSTAGRAM_MAX_BODY_BYTES, mergeHotInstagramSync, parseHotInstagramDocument, publicHotInstagramContext } from "@/lib/hot-leads";
import { isHotLeadsAgent, isHotLeadsOwner } from "@/lib/hot-leads-auth";
import { HotLeadsStoreConflictError, mutateHotInstagram, readHotInstagram } from "@/lib/hot-leads-store";

async function boundedJson(req: NextRequest): Promise<unknown> {
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
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new SyntaxError("Request body must be valid JSON"); }
}

function errorResponse(error: unknown) {
  if (error instanceof HotLeadsStoreConflictError || (error instanceof Error && /in flight/i.test(error.message))) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 413 });
  if (error instanceof SyntaxError || (error instanceof Error && /must|invalid|unexpected|required|duplicate|at most/i.test(error.message))) return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  console.error("Hot Leads API error", error);
  return NextResponse.json({ error: "Unable to process Hot Leads" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const agent = isHotLeadsAgent(req);
    if (!agent && !(await isHotLeadsOwner(req))) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    const db = createLeadsAdminClient();
    const [{ data, error, count }, instagram] = await Promise.all([
      db.from("leads")
        .select("id, full_name, email, phone, prospect_stage, quality, source, notes, ongoing_message_feed, ghl_contact_id, instagram_url, linkedin_url, facebook_url, social_url, ghl_url, last_update, hot", { count: "exact" })
        .or("hot.eq.true,prospect_stage.eq.🔥 Hot Prospect")
        .order("last_update", { ascending: false, nullsFirst: false })
        .limit(50),
      readHotInstagram(),
    ]);
    if (error) throw new Error("Unable to load Hot leads");
    const contextByLead = new Map(instagram.contexts.map((row) => [row.lead_id, agent ? row : publicHotInstagramContext(row)]));
    const leads = (data ?? []).map((row) => {
      const { ghl_contact_id, ghl_url, ...publicLead } = row;
      return { ...publicLead, ghl_connected: Boolean(ghl_contact_id), ghl_open_available: Boolean(ghl_url), instagram: contextByLead.get(row.id) ?? null };
    });
    return NextResponse.json({ leads, total: count ?? leads.length, limit: 50, instagram_synced_at: instagram.synced_at });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(req: NextRequest) {
  if (!isHotLeadsAgent(req)) return NextResponse.json({ error: "Agent access required" }, { status: 403 });
  try {
    const incoming = parseHotInstagramDocument(await boundedJson(req));
    const { data, error } = await createLeadsAdminClient().from("leads").select("id").or("hot.eq.true,prospect_stage.eq.🔥 Hot Prospect").order("last_update", { ascending: false, nullsFirst: false }).limit(50);
    if (error) throw new Error("Unable to validate active Hot leads");
    const activeLeadIds = new Set((data ?? []).map((row) => row.id));
    if (incoming.contexts.some((row) => !activeLeadIds.has(row.lead_id))) return NextResponse.json({ error: "Instagram sync contains a lead that is no longer Hot" }, { status: 409 });
    return NextResponse.json(await mutateHotInstagram((current) => mergeHotInstagramSync(current, incoming, new Date().toISOString(), activeLeadIds)));
  } catch (error) { return errorResponse(error); }
}
