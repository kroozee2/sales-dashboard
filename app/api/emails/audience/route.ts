import { NextResponse } from "next/server";

// Who can actually be emailed.
//
// This exists because the delivery numbers on their own mislead. A send reports
// "15,781 targeted, 5,767 delivered", which reads like a 37% deliverability
// disaster. It is not. 7,008 of those contacts have no email address at all,
// and 2,803 have unsubscribed. Against the list that can genuinely receive
// email, delivery runs about 98%.
//
// Every number here is a server-side count from GoHighLevel, not a sample.

export const runtime = "nodejs";
export const maxDuration = 60;

const SEARCH = "https://services.leadconnectorhq.com/contacts/search";

type Filter = { field: string; operator: string; value?: unknown };

async function count(filters: Filter[], key: string, location: string): Promise<number | null> {
  const res = await fetch(SEARCH, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Version: "2021-07-28", "Content-Type": "application/json" },
    body: JSON.stringify({ locationId: location, pageLimit: 1, ...(filters.length ? { filters } : {}) }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { total?: number };
  return typeof body.total === "number" ? body.total : null;
}

export async function GET() {
  const key = process.env.GHL_API_KEY;
  const location = process.env.GHL_LOCATION_ID;
  if (!key || !location) return NextResponse.json({ error: "GoHighLevel is not configured." }, { status: 503 });

  try {
    const [contacts, withEmail, noEmail, validEmail, invalidEmail, unsubscribed, mailable] = await Promise.all([
      count([], key, location),
      count([{ field: "email", operator: "exists" }], key, location),
      count([{ field: "email", operator: "not_exists" }], key, location),
      count([{ field: "validEmail", operator: "eq", value: true }], key, location),
      count([{ field: "validEmail", operator: "eq", value: false }], key, location),
      count([{ field: "dndSettings.Email.status", operator: "eq", value: "active" }], key, location),
      count([
        { field: "validEmail", operator: "eq", value: true },
        { field: "dndSettings.Email.status", operator: "not_eq", value: "active" },
      ], key, location),
    ]);

    return NextResponse.json({
      contacts, with_email: withEmail, no_email: noEmail,
      valid_email: validEmail, invalid_email: invalidEmail,
      unsubscribed, mailable,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[emails/audience]", e);
    return NextResponse.json({ error: "GoHighLevel unreachable." }, { status: 502 });
  }
}
