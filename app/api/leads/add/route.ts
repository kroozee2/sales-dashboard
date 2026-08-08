import { NextRequest, NextResponse } from "next/server";

const GHL_BASE = "https://services.leadconnectorhq.com";
const LOCATION_ID = process.env.GHL_LOCATION_ID || "ZJQSLWJWH7OVHVrJjmPj";
const AT_BASE = process.env.AIRTABLE_LEADS_BASE || "appPqR5QXRBoqTZCX";
const AT_TABLE = process.env.AIRTABLE_LEADS_TABLE || "tblDbR7lLnbVZaA1q";

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

function atHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
    "Content-Type": "application/json",
  };
}

// Search GHL contacts by name or phone
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q || !process.env.GHL_API_KEY) return NextResponse.json({ contacts: [] });

  try {
    const res = await fetch(
      `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&query=${encodeURIComponent(q)}&limit=10`,
      { headers: ghlHeaders() }
    );
    const data = await res.json();
    const toTitle = (s: string) => s.replace(/\b\w/g, (ch) => ch.toUpperCase());
    const contacts = ((data.contacts as Record<string, unknown>[]) || []).map((c) => ({
      id: c.id as string,
      name: toTitle(
        (c.firstName
          ? `${c.firstName as string} ${(c.lastName as string) ?? ""}`.trim()
          : (c.name as string) ?? "")
      ),
      email: (c.email as string) ?? null,
      phone: (c.phone as string) ?? null,
      ghlUrl: `https://app.gohighlevel.com/v2/location/${LOCATION_ID}/contacts/detail/${c.id as string}`,
    }));
    return NextResponse.json({ contacts });
  } catch (err) {
    return NextResponse.json({ contacts: [], error: String(err) });
  }
}

// Create lead: upsert in GHL, create in Airtable
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, phone, stage, notes, offer, ghlContactId } = body as {
    name: string;
    email?: string;
    phone?: string;
    stage?: string;
    notes?: string;
    offer?: string;
    ghlContactId?: string; // if importing from existing GHL contact
  };

  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  let resolvedGhlId = ghlContactId ?? null;
  let ghlUrl: string | null = null;

  // Create or use existing GHL contact
  if (!resolvedGhlId && process.env.GHL_API_KEY) {
    try {
      const nameParts = name.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || undefined;
      const res = await fetch(`${GHL_BASE}/contacts/`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({
          locationId: LOCATION_ID,
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
        }),
      });
      const data = await res.json();
      resolvedGhlId = (data.contact?.id as string) ?? null;
    } catch {
      // non-fatal — still create in Airtable
    }
  }

  if (resolvedGhlId) {
    ghlUrl = `https://app.gohighlevel.com/v2/location/${LOCATION_ID}/contacts/detail/${resolvedGhlId}`;
  }

  // Stage value mapping
  const stageMap: Record<string, string> = {
    new: "⭐️ New Lead",
    contacted: "📲 Contacted",
    booked: "☎️ Call Booked",
    proposal: "📋 Proposal",
    won: "✅ Closed Won",
    lost: "❌ Closed Lost",
  };
  const airtableStage = stageMap[stage ?? "new"] ?? "⭐️ New Lead";

  // Create Airtable LeadsOS record
  if (!process.env.AIRTABLE_PAT) {
    return NextResponse.json({ error: "No Airtable PAT" }, { status: 500 });
  }

  const fields: Record<string, string> = {
    "👦 Name": name,
    "Pipeline Stage": airtableStage,
  };
  if (email) fields["📧 Email"] = email;
  if (phone) fields["☎️ Phone"] = phone;
  if (notes) fields["✍️ Notes"] = notes;
  if (resolvedGhlId) fields["📲 GHL Contact ID"] = resolvedGhlId;

  try {
    const atRes = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}`, {
      method: "POST",
      headers: atHeaders(),
      body: JSON.stringify({ fields, typecast: true }),
    });
    const atData = await atRes.json();
    if (!atRes.ok) {
      return NextResponse.json({ error: atData.error?.message ?? "Airtable error" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      lead: {
        id: atData.id as string,
        createdAt: atData.createdTime as string,
        name,
        email: email ?? null,
        phone: phone ?? null,
        stage: airtableStage,
        leadValue: null,
        offer: offer ?? null,
        notes: notes ?? null,
        ghlContactId: resolvedGhlId,
        ghlUrl,
        whatsAppUrl: phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null,
        temperature: null,
        source: null,
        lastUpdate: null,
        prospectStage: null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
