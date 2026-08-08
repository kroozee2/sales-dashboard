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

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  const name  = req.nextUrl.searchParams.get("name");

  if (!process.env.GHL_API_KEY) {
    return NextResponse.json({ contact: null, isDemo: true });
  }

  try {
    // Try email first, then name
    const queries = [
      email ? `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&query=${encodeURIComponent(email)}&limit=5` : null,
      name  ? `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&query=${encodeURIComponent(name)}&limit=5`  : null,
    ].filter(Boolean) as string[];

    for (const url of queries) {
      const res  = await fetch(url, { headers: ghlHeaders() });
      const data = await res.json();
      const hit  = (data.contacts as any[])?.[0];
      if (hit) {
        const phone = hit.phone ? normalizePhone(hit.phone) : null;
        return NextResponse.json({
          contact: {
            id:    hit.id,
            name:  hit.firstName ? `${hit.firstName} ${hit.lastName ?? ""}`.trim() : hit.name ?? null,
            email: hit.email ?? null,
            phone,
            ghlUrl: `https://app.gohighlevel.com/v2/location/${LOCATION_ID}/contacts/detail/${hit.id}`,
          },
        });
      }
    }

    return NextResponse.json({ contact: null });
  } catch (err) {
    return NextResponse.json({ contact: null, error: String(err) });
  }
}
