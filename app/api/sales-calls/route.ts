import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SalesCall } from "@/lib/supabase-calls";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
    process.env.SUPABASE_CALLS_SERVICE_KEY!
  );
}

// ─── Auto-sync: call result → lead record ─────────────────────────────────────
// When a call outcome is saved, find the matching lead (email → phone → name)
// and update its stage + prepend a call recap to its notes. Fire-and-forget.
const RESULT_TO_STAGE: Record<string, string> = {
  "✅ Sale": "🔗 Pay Link Sent",
  "📣 Follow Up": "🔥 Hot Prospect",
};

async function syncLeadFromCall(call: {
  name?: string | null; email?: string | null; phone?: string | null;
  result?: string | null; call_date?: string | null; offer?: string | null;
  deal_amount?: number | null; follow_up_date?: string | null; follow_up_notes?: string | null;
}) {
  if (!call.result || call.result === "🔜 Upcoming") return;
  const client = db();

  let lead: { id: string; prospect_stage: string | null; notes: string | null } | null = null;
  if (call.email) {
    const { data } = await client.from("leads").select("id, prospect_stage, notes").ilike("email", call.email).limit(1).maybeSingle();
    lead = data;
  }
  if (!lead && call.phone) {
    const digits = call.phone.replace(/\D/g, "").slice(-10);
    if (digits.length === 10) {
      const { data } = await client.from("leads").select("id, prospect_stage, notes").ilike("phone", `%${digits}%`).limit(1).maybeSingle();
      lead = data;
    }
  }
  if (!lead && call.name) {
    const { data } = await client.from("leads").select("id, prospect_stage, notes").ilike("full_name", call.name.trim()).order("last_update", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    lead = data;
  }
  if (!lead) return;

  const dateStr = (call.call_date ?? new Date().toISOString()).split("T")[0];
  const recapBits = [
    `${dateStr} - Sales call: ${call.result}`,
    call.deal_amount ? `$${call.deal_amount.toLocaleString()}` : null,
    call.offer || null,
    call.follow_up_date ? `follow up ${call.follow_up_date}` : null,
    call.follow_up_notes || null,
  ].filter(Boolean).join(" · ");

  const updates: Record<string, unknown> = {
    notes: `${recapBits}\n\n${lead.notes ?? ""}`.trim(),
    last_update: new Date().toISOString(),
  };
  const newStage = RESULT_TO_STAGE[call.result];
  // Only move the stage forward — never demote a lead that's already further along
  const STAGE_RANK: Record<string, number> = {
    "👨 Prospect": 0, "📣 Reached Out": 1, "📞 Call Booked": 2,
    "🔥 Hot Prospect": 3, "🔗 Pay Link Sent": 4, "🏦 Payment Received": 5,
  };
  if (newStage && (STAGE_RANK[newStage] ?? 0) > (STAGE_RANK[lead.prospect_stage ?? ""] ?? -1)) {
    updates.prospect_stage = newStage;
  }

  await client.from("leads").update(updates).eq("id", lead.id);
}

// ─── GET — list calls ─────────────────────────────────────────────────────────
export async function GET() {
  const { data, error } = await db()
    .from("sales_calls")
    .select("*")
    .order("call_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calls: data });
}

// ─── POST — create call ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await db()
    .from("sales_calls")
    .insert([body])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.result) await syncLeadFromCall(data).catch(() => {});
  return NextResponse.json({ call: data });
}

// ─── PATCH — update call ──────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body as Partial<SalesCall> & { id: string };

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Auto-default: a Follow Up result must never be orphaned without a due date.
  // If result is being set to Follow Up and no follow_up_date is provided, default +3 days.
  if (fields.result === "📣 Follow Up" && !fields.follow_up_date) {
    const { data: existing } = await db()
      .from("sales_calls")
      .select("follow_up_date")
      .eq("id", id)
      .single();
    if (!existing?.follow_up_date) {
      fields.follow_up_date = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    }
  }

  const { data, error } = await db()
    .from("sales_calls")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // If the outcome changed, sync it to the lead record (stage + note)
  if (fields.result) await syncLeadFromCall(data).catch(() => {});
  return NextResponse.json({ call: data });
}

// ─── DELETE — remove call ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await db().from("sales_calls").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
