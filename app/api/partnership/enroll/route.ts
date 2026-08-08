import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FLOW_URL = process.env.FLOW_PARTNER_ENROLL_URL || "https://rruzgmiauexvbxspkyuz.supabase.co/functions/v1/partner-enroll";

// Mark this person as enrolled in the Partnership (Flow) app so their referrer
// sees the update.
export async function POST(req: NextRequest) {
  const { name, email, offer, amount } = await req.json() as { name?: string; email?: string; offer?: string; amount?: number };
  const secret = process.env.FLOW_ADMIN_SECRET;
  if (!secret) return NextResponse.json({ error: "Partnership app not configured" }, { status: 500 });
  if (!name && !email) return NextResponse.json({ error: "name or email required" }, { status: 400 });
  try {
    const res = await fetch(FLOW_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ name, email, offer, amount }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.error) return NextResponse.json({ error: data.error }, { status: 502 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to reach Partnership app" }, { status: 502 });
  }
}
