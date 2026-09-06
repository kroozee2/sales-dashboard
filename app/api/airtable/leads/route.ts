import { NextRequest, NextResponse } from "next/server";

const BASE_ID = process.env.AIRTABLE_LEADS_BASE || "appPqR5QXRBoqTZCX";
const TABLE_ID = process.env.AIRTABLE_LEADS_TABLE || "tblDbR7lLnbVZaA1q";
const PAT = process.env.AIRTABLE_PAT;

const AT_HEADERS = () => ({
  Authorization: `Bearer ${PAT}`,
  "Content-Type": "application/json",
});

function extractName(fields: Record<string, unknown>): string {
  const full =
    (fields["🧔‍♂️ Full Name"] as string) ||
    (fields["👦 Name"] as string) ||
    null;
  if (full) return full;
  const first = (fields["First Name"] as string) || "";
  const last = (fields["Last Name"] as string) || "";
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  return "Unknown";
}

function extractPhone(fields: Record<string, unknown>): string | null {
  // "☎️ Phone" has clean numbers; "Phone" formula has tel:// prefix
  const clean = (fields["☎️ Phone"] as string) || "";
  if (clean.trim()) return clean.trim();
  const formula = ((fields["Phone"] as string) || "").replace(/^tel:\/\//, "").trim();
  if (formula) return formula;
  return null;
}

function extractGhlUrl(fields: Record<string, unknown>): string | null {
  const ghlField = fields["📲 Open In GHL"] as { url?: string } | string | null;
  if (!ghlField) return null;
  const url = typeof ghlField === "object" ? ghlField.url : ghlField;
  // Only return if it ends with a real contact ID (not just the location path)
  if (url && !url.endsWith("/contacts/detail/")) return url;
  return null;
}

function extractWhatsAppUrl(fields: Record<string, unknown>): string | null {
  const wa = fields["📲 Text from Computer"] as { url?: string } | string | null;
  if (!wa) return null;
  const url = typeof wa === "object" ? wa.url : wa;
  // Reject bogus URLs where phone part is empty or "tel://"
  if (!url || url.includes("phone=tel://") || url.endsWith("phone=")) return null;
  return url;
}

function isIgHandle(name: string): boolean {
  if (name.startsWith("@")) return true;
  if (!name.includes(" ") && /^[a-z0-9._]+$/.test(name)) return true;
  return false;
}

function mapRecord(record: { id: string; createdTime: string; fields: Record<string, unknown> }) {
  const f = record.fields;
  return {
    id: record.id,
    createdAt: record.createdTime || null,
    name: extractName(f),
    email: (f["📧 Email"] as string) || (f["Email"] as string) || null,
    phone: extractPhone(f),
    stage: (f["Pipeline Stage"] as string) || null,
    leadValue: (f["Lead Value"] as number) || (f["💵 Lead Value"] as number) || null,
    offer: (f["🎁 Offer"] as string) || null,
    notes: (f["✍️ Notes"] as string) || null,
    ghlContactId: (f["📲 GHL Contact ID"] as string) || null,
    ghlUrl: extractGhlUrl(f),
    whatsAppUrl: extractWhatsAppUrl(f),
    temperature: (f["🌡️ Temperature"] as string) || null,
    source: (f["🔗 Source"] as string) || null,
    lastUpdate: (f["⭐️ Last Update"] as string) || null,
    prospectStage: (f["💰 Prospect Stage"] as string) || null,
  };
}

export async function GET(req: NextRequest) {
  if (!PAT) return NextResponse.json({ leads: [], error: "No Airtable PAT" });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  // Pinned record IDs — always included regardless of view filters
  const PINNED_IDS = [
    "receRi0mi2MrpYgY4", // Luis Noriega
    "recCN2rrajiIdIAbN", // Tucker Beadles
    "reclcsRx1yEGz6hxR", // Alexis Stoniea
  ];

  try {
    // Primary: fetch from the curated view
    const viewUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?pageSize=100&view=viws6b6kcjk8THrLx`;
    const res = await fetch(viewUrl, { headers: AT_HEADERS(), cache: "no-store" });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ leads: [], error: err });
    }
    const data = await res.json();
    const viewRecords: ReturnType<typeof mapRecord>[] = (data.records || []).map(mapRecord);

    // Fetch any pinned records not already in the view
    const viewIds = new Set(viewRecords.map((l) => l.id));
    const missingIds = PINNED_IDS.filter((id) => !viewIds.has(id));
    let pinnedRecords: ReturnType<typeof mapRecord>[] = [];
    if (missingIds.length > 0) {
      const pinnedFetches = await Promise.all(
        missingIds.map((id) =>
          fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}`, {
            headers: AT_HEADERS(), cache: "no-store",
          }).then((r) => r.json()).then((r) => mapRecord(r))
        )
      );
      pinnedRecords = pinnedFetches;
    }

    const allRecords = [...pinnedRecords, ...viewRecords];
    const leads = allRecords.filter(
      (l: ReturnType<typeof mapRecord>) => l.name !== "Unknown" && !isIgHandle(l.name)
    );

    return NextResponse.json({ leads, offset: data.offset || null });
  } catch (err) {
    return NextResponse.json({ leads: [], error: String(err) });
  }
}

export async function PATCH(req: NextRequest) {
  if (!PAT) return NextResponse.json({ error: "No Airtable PAT" }, { status: 500 });

  const body = await req.json();
  const { recordId, action, stage, note } = body;

  if (!recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });

  try {
    if (action === "updateStage") {
      const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
        method: "PATCH",
        headers: AT_HEADERS(),
        body: JSON.stringify({ fields: { "Pipeline Stage": stage }, typecast: true }),
      });
      const data = await res.json();
      return NextResponse.json({ success: true, record: data });
    }

    if (action === "appendNote") {
      // First get existing note
      const getRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`,
        { headers: AT_HEADERS() }
      );
      const existing = await getRes.json();
      const existingNote = (existing.fields?.["✍️ Notes"] as string) || "";
      const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const newNote = `[${today}] ${note}${existingNote ? "\n\n" + existingNote : ""}`;

      const patchRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
        method: "PATCH",
        headers: AT_HEADERS(),
        body: JSON.stringify({ fields: { "✍️ Notes": newNote } }),
      });
      const data = await patchRes.json();
      return NextResponse.json({ success: true, record: data });
    }

    if (action === "updateField") {
      const fieldMap: Record<string, string> = {
        name:  "👦 Name",
        email: "📧 Email",
        phone: "☎️ Phone",
      };
      const airtableField = fieldMap[body.field as string];
      if (!airtableField) return NextResponse.json({ error: "Unknown field" }, { status: 400 });
      const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
        method: "PATCH",
        headers: AT_HEADERS(),
        body: JSON.stringify({ fields: { [airtableField]: body.value } }),
      });
      const data = await res.json();
      return NextResponse.json({ success: true, record: data });
    }

    if (action === "updateOffer") {
      // "🎁Offer" (richText, no space) accepts plain strings; "🎁 Offer" is a linked-records field
      const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
        method: "PATCH",
        headers: AT_HEADERS(),
        body: JSON.stringify({ fields: { "🎁Offer": body.offer } }),
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ error: data.error?.message ?? "Airtable error" }, { status: 500 });
      return NextResponse.json({ success: true, record: data });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
