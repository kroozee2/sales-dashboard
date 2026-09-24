import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { callsDb } from "@/lib/supabase-calls";

// The changes Jarvis is allowed to make, once Andrew has approved them.
//
// These run from the approval queue only. Jarvis itself never calls them; it
// proposes, and /api/jarvis/actions executes on approval. Keeping them here
// rather than inside the chat route means there is exactly one place where a
// write can happen.

export type WriteResult = { result: string; ok: boolean };

const fail = (message: string): WriteResult => ({ result: `Error: ${message}`, ok: false });

export async function runWriteTool(tool: string, input: Record<string, unknown>): Promise<WriteResult> {
  const leads = createLeadsAdminClient();
  const now = new Date().toISOString();

  switch (tool) {
    case "create_lead": {
      const { data, error } = await leads.from("leads")
        .insert({ id: crypto.randomUUID(), ...input, opt_in_date: now, last_update: now })
        .select().single();
      return error ? fail(error.message) : { result: `Created lead ${data.full_name ?? data.id}`, ok: true };
    }

    case "update_lead": {
      const { id, ...updates } = input as { id: string } & Record<string, unknown>;
      if (!id) return fail("no lead id");
      const { error } = await leads.from("leads").update({ ...updates, last_update: now }).eq("id", id);
      return error ? fail(error.message) : { result: `Updated ${Object.keys(updates).join(", ") || "lead"}`, ok: true };
    }

    case "add_lead_note": {
      const { lead_id, text } = input as { lead_id: string; text: string };
      if (!lead_id || !text) return fail("lead_id and text are required");
      const { error } = await leads.from("lead_notes").insert({ lead_id, text });
      if (error) return fail(error.message);
      await leads.from("leads").update({ last_update: now }).eq("id", lead_id);
      return { result: "Note added", ok: true };
    }

    case "update_sales_call": {
      const { id, ...updates } = input as { id: string } & Record<string, unknown>;
      if (!id) return fail("no call id");
      const { error } = await callsDb.from("sales_calls").update(updates).eq("id", id);
      return error ? fail(error.message) : { result: `Updated ${Object.keys(updates).join(", ") || "call"}`, ok: true };
    }

    default:
      return fail(`${tool} cannot be applied from the approval queue`);
  }
}

/** Which proposals the queue knows how to carry out. */
export const APPLIABLE_TOOLS = new Set(["create_lead", "update_lead", "add_lead_note", "update_sales_call"]);
