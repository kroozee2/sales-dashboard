import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findLeadForCall, isBookedSalesCall, persistLeadUpdateWithCas, type LeadCandidate, type SalesCallLeadFields } from "@/lib/sales-call-leads";
import type { SalesCall } from "@/lib/supabase-calls";
import { MutationInputError, parseSalesCallDelete, parseSalesCallMutation, readBoundedJson, type BookedViewAction } from "@/lib/sales-call-mutation";
import { BOOKED_VIEW_MOVED_OFF_STATUS, inspectBookedViewMarker, moveOffBookedView, sanitizeBookedViewCall } from "@/lib/sales-call-booked-view";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
    process.env.SUPABASE_CALLS_SERVICE_KEY!
  );
}

function reportBackendFailure(operation: string, error: unknown): void {
  const candidate = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : null;
  const errorType = typeof candidate?.name === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(candidate.name) ? candidate.name : "BackendError";
  const code = typeof candidate?.code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(candidate.code) ? candidate.code : undefined;
  console.error("[sales-calls] backend failure", { operation, errorType, ...(code ? { code } : {}) });
}

type LeadSyncResult = {
  status: "updated" | "unchanged" | "unmatched" | "ambiguous" | "error";
  method?: "email" | "phone" | "name";
  count?: number;
  leadId?: string;
  stage?: string;
  message?: string;
};

async function syncLeadFromCall(
  client: ReturnType<typeof db>,
  previousCall: SalesCallLeadFields | null,
  nextCall: SalesCallLeadFields,
): Promise<LeadSyncResult> {
  if (nextCall.call_type !== "📞 Sales Call") return { status: "unchanged" };

  const queryLeads = async (column: "email" | "phone" | "full_name", pattern: string): Promise<LeadCandidate[]> => {
    const pageSize = 500;
    const maxPages = 4;
    const found: LeadCandidate[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      const from = page * pageSize;
      let query = client.from("leads").select("id, full_name, email, phone, prospect_stage, notes");
      query = column === "phone" ? query.not("phone", "is", null) : query.ilike(column, pattern);
      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      found.push(...(data ?? []));
      if (!data || data.length < pageSize) return found;
    }
    throw new Error("lead-candidate-limit");
  };

  try {
    const match = await findLeadForCall(nextCall, {
      byEmail: (email) => queryLeads("email", email),
      byPhone: (lastTenDigits) => queryLeads("phone", lastTenDigits),
      byName: (name) => queryLeads("full_name", name),
    });
    if (match.status === "ambiguous") return { status: "ambiguous", method: match.method, count: match.count };
    if (match.status === "unmatched") return { status: "unmatched" };

    const loadLead = async () => {
      const { data, error } = await client.from("leads").select("id, full_name, email, phone, prospect_stage, notes").eq("id", match.lead.id).single();
      if (error || !data) throw new Error(error?.message ?? "Lead read-back unavailable");
      return data;
    };
    const persisted = await persistLeadUpdateWithCas(previousCall, nextCall, loadLead, async (expected, updates) => {
      let mutation = client.from("leads").update(updates).eq("id", expected.id);
      mutation = expected.notes === null || expected.notes === undefined ? mutation.is("notes", null) : mutation.eq("notes", expected.notes);
      mutation = expected.prospect_stage === null || expected.prospect_stage === undefined ? mutation.is("prospect_stage", null) : mutation.eq("prospect_stage", expected.prospect_stage);
      const { data, error } = await mutation.select("id, full_name, email, phone, prospect_stage, notes").maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    });
    return {
      status: persisted.status,
      method: match.method,
      leadId: persisted.lead.id,
      stage: persisted.lead.prospect_stage ?? undefined,
    };
  } catch (error) {
    reportBackendFailure("lead-sync", error);
    return { status: "error", message: "Lead synchronization failed" };
  }
}


function mutationError(error: unknown) {
  if (error instanceof MutationInputError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}

// ─── GET — list calls ─────────────────────────────────────────────────────────
export async function GET() {
  try {
    const { data, error } = await db()
      .from("sales_calls")
      .select("*")
      .order("call_date", { ascending: false });

    if (error) {
      reportBackendFailure("list", error);
      return NextResponse.json({ error: "Unable to load sales calls" }, { status: 500 });
    }
    try { return NextResponse.json({ calls: (data ?? []).map((call) => sanitizeBookedViewCall(call)) }); }
    catch (error) { reportBackendFailure("list-marker", error); return NextResponse.json({ error: "Unable to load sales calls" }, { status: 500 }); }
  } catch (error) {
    reportBackendFailure("list", error);
    return NextResponse.json({ error: "Unable to load sales calls" }, { status: 500 });
  }
}

// ─── POST — create call ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let fields: Partial<SalesCall>;
  try { ({ fields } = parseSalesCallMutation(await readBoundedJson(req), "POST")); }
  catch (error) { return mutationError(error); }
  try {
    const client = db();
    const { data, error } = await client
      .from("sales_calls")
      .insert([fields])
      .select()
      .single();

    if (error || !data) {
      reportBackendFailure("create", error);
      return NextResponse.json({ error: "Unable to create sales call" }, { status: 500 });
    }
    const leadSync = await syncLeadFromCall(client, null, data);
    return NextResponse.json({ call: sanitizeBookedViewCall(data), leadSync });
  } catch (error) {
    reportBackendFailure("create", error);
    return NextResponse.json({ error: "Unable to create sales call" }, { status: 500 });
  }
}

// ─── PATCH — update call ──────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  let id: string;
  let requestedFields: Partial<SalesCall>;
  let bookedViewAction: BookedViewAction | undefined;
  try {
    const parsed = parseSalesCallMutation(await readBoundedJson(req), "PATCH");
    id = parsed.id!; requestedFields = parsed.fields; bookedViewAction = parsed.bookedViewAction;
  } catch (error) { return mutationError(error); }

  {
    const client = db();
    const { data: existing, error: readError } = await client
      .from("sales_calls")
      .select("id, name, email, phone, call_type, call_date, confirmed, result, showed, success, offer, deal_amount, follow_up_status, follow_up_date, follow_up_notes, call_notes, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      reportBackendFailure("update-read", readError);
      return NextResponse.json({ error: "Unable to load sales call" }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Sales call not found" }, { status: 404 });

    const marker = inspectBookedViewMarker(existing.call_notes);
    const hasMovedStatus = existing.follow_up_status === BOOKED_VIEW_MOVED_OFF_STATUS;
    const markerIsBound = hasMovedStatus && marker.status === "moved";
    if (hasMovedStatus && marker.status !== "moved") {
      return NextResponse.json({ error: "Booked-view marker conflict" }, { status: 409 });
    }

    if (bookedViewAction) {
      if (existing.updated_at !== bookedViewAction.expectedUpdatedAt) return NextResponse.json({ error: "Sales call changed; reload and retry" }, { status: 409 });
      let actionFields: { call_notes: string | null; follow_up_status?: string | null };
      if (bookedViewAction.action === "move_off") {
        if (marker.status !== "none" || hasMovedStatus) return NextResponse.json({ error: "Sales call has a booked-view marker conflict" }, { status: 409 });
        if (!isBookedSalesCall(existing)) return NextResponse.json({ error: "Sales call is not eligible for the booked view" }, { status: 409 });
        try {
          actionFields = {
            call_notes: moveOffBookedView(existing.call_notes, existing.follow_up_status).storedNotes,
            follow_up_status: BOOKED_VIEW_MOVED_OFF_STATUS,
          };
        }
        catch { return NextResponse.json({ error: "Unable to preserve booked-view state" }, { status: 409 }); }
      } else {
        if (!markerIsBound || marker.status !== "moved" || marker.revision !== bookedViewAction.revision) return NextResponse.json({ error: "Booked-view revision conflict" }, { status: 409 });
        actionFields = { call_notes: marker.visibleNotes, follow_up_status: marker.priorStatus };
      }
      let actionMutation = client.from("sales_calls").update(actionFields).eq("id", id).eq("updated_at", existing.updated_at);
      actionMutation = existing.call_notes === null || existing.call_notes === undefined ? actionMutation.is("call_notes", null) : actionMutation.eq("call_notes", existing.call_notes);
      actionMutation = existing.follow_up_status === null || existing.follow_up_status === undefined ? actionMutation.is("follow_up_status", null) : actionMutation.eq("follow_up_status", existing.follow_up_status);
      const { data: actionData, error: actionError } = await actionMutation.select().maybeSingle();
      if (actionError) { reportBackendFailure("booked-view-write", actionError); return NextResponse.json({ error: "Unable to update booked view" }, { status: 500 }); }
      if (!actionData) return NextResponse.json({ error: "Sales call changed; reload and retry" }, { status: 409 });
      return NextResponse.json({ call: sanitizeBookedViewCall(actionData), leadSync: { status: "unchanged" } });
    }

    const fields = { ...requestedFields };
    if (markerIsBound && marker.status === "moved") {
      if (Object.hasOwn(fields, "follow_up_status")) return NextResponse.json({ error: "Restore the booked view before changing follow-up status" }, { status: 409 });
      if (Object.hasOwn(fields, "call_notes")) {
        const visible = fields.call_notes ?? "";
        const combined = `${visible}${visible ? "\n\n" : ""}${marker.rawMarker}`;
        if (combined.length > 10_000) return NextResponse.json({ error: "Invalid call_notes" }, { status: 400 });
        fields.call_notes = combined;
      }
    }
    if (fields.result === "📣 Follow Up" && !fields.follow_up_date && !existing.follow_up_date) {
      fields.follow_up_date = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    }

    const changesMarkerStorage = Object.hasOwn(fields, "call_notes") || Object.hasOwn(fields, "follow_up_status");
    let updateMutation = client.from("sales_calls").update(fields).eq("id", id);
    if (changesMarkerStorage) {
      updateMutation = updateMutation.eq("updated_at", existing.updated_at);
      updateMutation = existing.call_notes === null || existing.call_notes === undefined
        ? updateMutation.is("call_notes", null)
        : updateMutation.eq("call_notes", existing.call_notes);
      updateMutation = existing.follow_up_status === null || existing.follow_up_status === undefined
        ? updateMutation.is("follow_up_status", null)
        : updateMutation.eq("follow_up_status", existing.follow_up_status);
    }
    const { data, error } = await updateMutation.select().maybeSingle();

    if (error) {
      reportBackendFailure("update-write", error);
      return NextResponse.json({ error: "Unable to update sales call" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Sales call changed; reload and retry" }, { status: 409 });
    const leadSync = await syncLeadFromCall(client, existing, data);
    return NextResponse.json({ call: sanitizeBookedViewCall(data), leadSync });
  }
}

// ─── DELETE — retained for the existing Sales Calls workspace only ────────────
export async function DELETE(req: NextRequest) {
  let id: string;
  try { id = parseSalesCallDelete(await readBoundedJson(req)); }
  catch (error) { return mutationError(error); }

  try {
    const { error } = await db().from("sales_calls").delete().eq("id", id);
    if (error) {
      reportBackendFailure("delete", error);
      return NextResponse.json({ error: "Unable to delete sales call" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    reportBackendFailure("delete", error);
    return NextResponse.json({ error: "Unable to delete sales call" }, { status: 500 });
  }
}
