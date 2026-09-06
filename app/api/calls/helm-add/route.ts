import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Add this prospect to the Helm app as a new client (name / phone / email).
export async function POST(req: NextRequest) {
  const { name, email, phone } = await req.json() as { name?: string; email?: string; phone?: string };
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!process.env.HELM_ENROLL_URL || !process.env.HELM_ENROLL_SECRET) {
    return NextResponse.json({ error: "Helm not configured" }, { status: 500 });
  }
  try {
    const res = await fetch(process.env.HELM_ENROLL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-enroll-secret": process.env.HELM_ENROLL_SECRET },
      body: JSON.stringify({ name, email: email ?? "", phone: phone ?? "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) return NextResponse.json({ error: data.error || `Helm returned ${res.status}` }, { status: 502 });
    return NextResponse.json({ ok: true, formUrl: data.formUrl ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to reach Helm" }, { status: 502 });
  }
}
