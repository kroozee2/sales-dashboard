import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_AGENT_WORKFORCE } from "@/lib/agent-workforce-default";
import {
  AGENT_WORKFORCE_MAX_BODY_BYTES,
  parseAgentWorkforceDocument,
  parseJsonWithUniqueKeys,
  readBoundedAgentWorkforceBody,
  updateAgentWorkforceDocument,
} from "@/lib/agent-workforce";
import { agentWorkforceAuthorization } from "@/lib/agent-workforce-auth";
import { invalidateSettings } from "@/lib/settings";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { currentMember, identitySigningConfiguredWithSettings } from "@/lib/team-auth";

const AGENT_WORKFORCE_KEY = "AI_WORKFORCE_V1";

function databaseError(context: string, error: { code?: unknown }) {
  const code = typeof error.code === "string" ? error.code.slice(0, 32) : "unknown";
  console.error("Agent workforce database failure", { context, code });
  return NextResponse.json({ error: "Agent workforce storage is temporarily unavailable" }, { status: 500 });
}

async function ownerError(req: NextRequest) {
  if (!await identitySigningConfiguredWithSettings()) return NextResponse.json({ error: "Owner identity service unavailable." }, { status: 503 });
  const member = await currentMember(req.cookies.get("sos_user")?.value);
  const denied = agentWorkforceAuthorization(member);
  return denied ? NextResponse.json({ error: denied.error }, { status: denied.status }) : null;
}

export async function GET(req: NextRequest) {
  const denied = await ownerError(req);
  if (denied) return denied;
  const db = createLeadsAdminClient();
  const { data, error } = await db
    .from("settings")
    .select("value")
    .eq("key", AGENT_WORKFORCE_KEY)
    .maybeSingle();

  if (error) return databaseError("read", error);
  if (!data?.value) return NextResponse.json({ document: DEFAULT_AGENT_WORKFORCE });

  try {
    return NextResponse.json({ document: parseAgentWorkforceDocument(String(data.value)) });
  } catch {
    console.error("Agent workforce stored document failed validation", { context: "read" });
    return NextResponse.json({ error: "Stored agent workforce is unavailable" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await ownerError(req);
  if (denied) return denied;
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > AGENT_WORKFORCE_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Agent workforce is too large" }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await readBoundedAgentWorkforceBody(req);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "Agent workforce is too large";
    return NextResponse.json({ error: tooLarge ? "Agent workforce is too large" : "Request body must use valid UTF-8" }, { status: tooLarge ? 413 : 400 });
  }

  let input: unknown;
  try { input = parseJsonWithUniqueKeys(raw); } catch (error) {
    const duplicate = error instanceof Error && error.message === "Duplicate JSON field";
    return NextResponse.json({ error: duplicate ? "Request body contains duplicate fields" : "Request body must be valid JSON" }, { status: 400 });
  }
  if (!input || typeof input !== "object" || !("expected_revision" in input)) {
    return NextResponse.json({ error: "expected_revision is required" }, { status: 400 });
  }

  const db = createLeadsAdminClient();
  const { data: stored, error: readError } = await db
    .from("settings")
    .select("value, updated_at")
    .eq("key", AGENT_WORKFORCE_KEY)
    .maybeSingle();
  if (readError) return databaseError("update-read", readError);

  let current = DEFAULT_AGENT_WORKFORCE;
  try {
    if (stored?.value) current = parseAgentWorkforceDocument(String(stored.value));
  } catch {
    console.error("Agent workforce stored document failed validation", { context: "update-read" });
    return NextResponse.json({ error: "Stored agent workforce is unavailable" }, { status: 500 });
  }

  let next;
  try {
    next = updateAgentWorkforceDocument(current, input, new Date().toISOString(), stored?.updated_at ?? current.revision);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid agent workforce";
    return NextResponse.json({ error: message }, { status: /stale/i.test(message) ? 409 : 400 });
  }

  if (stored) {
    let query = db
      .from("settings")
      .update({ value: JSON.stringify(next), updated_at: next.updated_at })
      .eq("key", AGENT_WORKFORCE_KEY);
    query = stored.updated_at ? query.eq("updated_at", stored.updated_at) : query.is("updated_at", null);
    const { data, error } = await query.select("key").maybeSingle();
    if (error) return databaseError("update", error);
    if (!data) {
      return NextResponse.json({ error: "The workforce changed in another tab. Reload before saving again." }, { status: 409 });
    }
  } else {
    const { error } = await db.from("settings").insert({
      key: AGENT_WORKFORCE_KEY,
      value: JSON.stringify(next),
      updated_at: next.updated_at,
    });
    if (error) {
      const conflict = error.code === "23505";
      if (conflict) return NextResponse.json({ error: "The workforce was created in another tab. Reload and try again." }, { status: 409 });
      return databaseError("insert", error);
    }
  }

  invalidateSettings();
  return NextResponse.json({ document: next });
}
