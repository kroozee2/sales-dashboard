import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

interface IncomingSignup {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  app?: "claude" | "skool" | "flow";
}

const SOURCE_LABEL: Record<string, string> = {
  claude: "Claude for Founders",
  skool: "Skool Blueprint",
  flow: "Partnership System",
};

// POST — add one or more Claude for Founders signups into our Leads (idempotent by email)
export async function POST(req: NextRequest) {
  const { signups } = await req.json() as { signups: IncomingSignup[] };
  if (!Array.isArray(signups) || signups.length === 0) {
    return NextResponse.json({ error: "signups array required" }, { status: 400 });
  }
  const db = createLeadsAdminClient();

  // Skip anyone already in Leads (by email)
  const emails = signups.map((s) => (s.email ?? "").toLowerCase()).filter(Boolean);
  const existing = new Set<string>();
  if (emails.length) {
    const { data } = await db.from("leads").select("email").in("email", emails);
    for (const l of data ?? []) if (l.email) existing.add(String(l.email).toLowerCase());
  }

  const now = new Date().toISOString();
  const toInsert = signups
    .filter((s) => s.email && !existing.has(s.email.toLowerCase()))
    .map((s) => ({
      id: crypto.randomUUID(),
      full_name: s.name ?? s.email ?? "Unknown",
      email: s.email ?? null,
      phone: s.phone ?? null,
      source: SOURCE_LABEL[s.app ?? "claude"] ?? "Claude for Founders",
      prospect_stage: "👨 Prospect",
      notes: `Created a free login on ${SOURCE_LABEL[s.app ?? "claude"] ?? "Claude for Founders"}.`,
      opt_in_date: s.created_at ?? now,
      last_update: now,
    }));

  let inserted = 0;
  if (toInsert.length) {
    const { data, error } = await db.from("leads").insert(toInsert).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = data?.length ?? 0;
  }

  return NextResponse.json({ inserted, skipped: signups.length - toInsert.length });
}
