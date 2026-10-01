import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import {
  MAX_QUEUED_REFERRAL_INVITES,
  ReferralInviteInputError,
  agentBearerAuthorized,
  projectQueuedInvite,
  readInviteCompletionBody,
} from "@/lib/referral-party-invites";

export const runtime = "nodejs";

const INVITE_FIELDS = "id, lead_id, name, email, event_date, status, created_at, event_id";

function authorized(req: NextRequest): boolean {
  return agentBearerAuthorized(req.headers.get("authorization"), process.env.SALESOS_AGENT_KEY);
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const db = createLeadsAdminClient();
    const invites: ReturnType<typeof projectQueuedInvite>[] = [];
    const seen = new Set<string>();
    let quarantinedInvalid = 0;
    for (let batch = 0; batch < 20 && invites.length < MAX_QUEUED_REFERRAL_INVITES; batch += 1) {
      const { data, error } = await db.from("referral_party_invites")
        .select(INVITE_FIELDS)
        .eq("status", "queued")
        .order("event_date", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(MAX_QUEUED_REFERRAL_INVITES);
      if (error) throw error;
      if (!data?.length) break;

      const invalidIds: string[] = [];
      for (const row of data) {
        try {
          const invite = projectQueuedInvite(row);
          if (!seen.has(invite.id)) { seen.add(invite.id); invites.push(invite); }
        } catch {
          if (typeof row.id !== "string") throw new Error("Queued invite has no usable id");
          invalidIds.push(row.id);
        }
      }
      if (invalidIds.length === 0) break;
      const { error: quarantineError } = await db.from("referral_party_invites")
        .update({ status: "failed" })
        .in("id", invalidIds)
        .eq("status", "queued");
      if (quarantineError) throw quarantineError;
      quarantinedInvalid += invalidIds.length;
    }
    return json({ invites, limit: MAX_QUEUED_REFERRAL_INVITES, quarantined_invalid: quarantinedInvalid });
  } catch (error) {
    console.error("Referral Party invite worker GET failed", error);
    return json({ error: "Unable to load queued Referral Party invites" }, 500);
  }
}

export async function PATCH(req: NextRequest) {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const completion = await readInviteCompletionBody(req);
    const invitedAt = completion.status === "invited" ? new Date().toISOString() : null;
    const update = completion.status === "invited"
      ? { status: "invited", invited_at: invitedAt, event_id: completion.actual_event_id }
      : { status: "failed" };
    const { data, error } = await createLeadsAdminClient()
      .from("referral_party_invites")
      .update(update)
      .eq("id", completion.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Invite was already completed or does not exist" }, 409);
    if (completion.status === "invited") {
      return json({ invite: { id: completion.id, status: "invited", event_id: completion.actual_event_id, invited_at: invitedAt } });
    }
    return json({ invite: { id: completion.id, status: "failed" } });
  } catch (error) {
    if (error instanceof ReferralInviteInputError) return json({ error: error.message }, error.status);
    console.error("Referral Party invite worker PATCH failed", error);
    return json({ error: "Unable to update Referral Party invite" }, 500);
  }
}
