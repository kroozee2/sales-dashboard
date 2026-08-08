import { NextRequest, NextResponse } from "next/server";

const GHL_BASE = "https://services.leadconnectorhq.com";
const LOCATION_ID = process.env.GHL_LOCATION_ID || "ZJQSLWJWH7OVHVrJjmPj";

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function shapeContact(c: Record<string, unknown>) {
  return {
    id: c.id as string,
    name: c.firstName
      ? `${c.firstName} ${(c.lastName as string) ?? ""}`.trim()
      : (c.name as string) ?? null,
    email: (c.email as string) ?? null,
    phone: c.phone ? normalizePhone(c.phone as string) : null,
    ghlUrl: `https://app.gohighlevel.com/v2/location/${LOCATION_ID}/contacts/detail/${c.id}`,
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!process.env.GHL_API_KEY || process.env.GHL_API_KEY === "your_ghl_api_key_here") {
    return NextResponse.json({ contacts: [], isDemo: true });
  }
  try {
    const url = q
      ? `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&query=${encodeURIComponent(q)}&limit=8`
      : `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&limit=100`;
    const res = await fetch(url, { headers: ghlHeaders() });
    const data = await res.json();
    return NextResponse.json({
      contacts: (data.contacts || []).map(shapeContact),
      isDemo: false,
    });
  } catch {
    return NextResponse.json({ contacts: [], isDemo: true });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!process.env.GHL_API_KEY || process.env.GHL_API_KEY === "your_ghl_api_key_here") {
    return NextResponse.json({ success: true, isDemo: true, id: `demo-${Date.now()}` });
  }
  try {
    const res = await fetch(`${GHL_BASE}/contacts/`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({ ...body, locationId: LOCATION_ID }),
    });
    const data = await res.json();
    return NextResponse.json({ success: true, contact: data.contact });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
