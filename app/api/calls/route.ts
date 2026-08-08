import { NextRequest, NextResponse } from "next/server";

// ─── Airtable config ──────────────────────────────────────────────────────────
const BASE_ID = process.env.AIRTABLE_LEADS_BASE || "appPqR5QXRBoqTZCX";
const TABLE_ID = "tbliiQRS9m0DHb5eb"; // SalesCallsOS
const PAT = process.env.AIRTABLE_PAT;

function atHeaders() {
  return {
    Authorization: `Bearer ${PAT}`,
    "Content-Type": "application/json",
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AirtableCall {
  id: string;
  name: string;
  callDate: string | null;
  result: string | null;
  callType: string | null;
  offer: string | null;
  callNotes: string | null;
  followUpNotes: string | null;
  phone: string | null;
  email: string | null;
  bookingSource: string | null;
  objections: string[];
  followUpStatus: string | null;
  followUpDate: string | null;
  dealAmount: number | null;
  newRevenue: number | null;
  recording: string | null;
  prospectQuality: string | null;
  ghlLink: string | null;
  aiSummary: string | null;
  month: string | null;
}

// Fathom-only calls (not yet in Airtable) — shown in "Recent Recordings" section
export interface FathomRecording {
  id: string;
  title: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ghlContactId: string | null;
  scheduledAt: string;
  durationMinutes: number;
  fathomUrl: string;
  fathomShareUrl: string;
  summaryText: string;
  nextSteps: string[];
  budget: string | null;
  offer: string | null;
  callType: "discovery" | "coaching" | "workshop" | "jv" | "group";
}

// ─── Field map ────────────────────────────────────────────────────────────────
function mapRecord(r: { id: string; fields: Record<string, unknown> }): AirtableCall {
  const f = r.fields;

  // Recording URL — try dedicated field first, then extract from call notes
  let recording = (f["🎥 Call Recording"] as string) || null;
  if (!recording) {
    const notes = (f["📞 Call Notes"] as string) || "";
    const match = notes.match(/https:\/\/fathom\.video\/[^\s>)]+/);
    if (match) recording = match[0];
  }

  // AI Summary from FathomOS lookup (comes as array)
  const aiSummaryRaw = f["🧾 AI Summary"];
  const aiSummary = Array.isArray(aiSummaryRaw) && aiSummaryRaw.length > 0
    ? (aiSummaryRaw[0] as string)
    : typeof aiSummaryRaw === "string" ? aiSummaryRaw : null;

  return {
    id: r.id,
    name: (f["🔥 Name"] as string) || (f["👱‍♂️ Name"] as string) || "Unknown",
    callDate: (f["☎️ Call Date"] as string) || null,
    result: (f["⭐️ Result"] as string) || null,
    callType: (f["⭐️ Type"] as string) || null,
    offer: (f["🎁Offer"] as string) || null,
    callNotes: (f["📞 Call Notes"] as string) || null,
    followUpNotes: (f["📣 Follow Up Notes"] as string) || null,
    phone: (f["☎️ Phone"] as string) || null,
    email: (f["📧 Email"] as string) || null,
    bookingSource: (f["⭐️ Booking Source"] as string) || null,
    objections: (f["❌ Objection"] as string[]) || [],
    followUpStatus: (f["📣 Follow Up Status"] as string) || null,
    followUpDate: (f["📣 Follow Up Call"] as string) || null,
    dealAmount: (f["💰 Deal Amount"] as number) || null,
    newRevenue: (f["🏦 New Revenue"] as number) || null,
    recording,
    prospectQuality: (f["👌 Prospect Quality"] as string) || null,
    ghlLink: (f["⭐️ GHL Link"] as string) || null,
    aiSummary,
    month: (f["🌕Month"] as string) || (f["🌕 Month"] as string) || null,
  };
}

// ─── Fathom-only recordings (not yet in Airtable) ────────────────────────────
const FATHOM_RECORDINGS: FathomRecording[] = [
  {
    id: "fathom-155702046",
    title: "Discovery Call — Mark Stulzer",
    callType: "discovery",
    contactName: "Mark Stulzer",
    contactEmail: "markstulzer@gmail.com",
    contactPhone: "+12046981614",
    ghlContactId: "t32ZQcLIm3SelQ9d1ucx",
    scheduledAt: "2026-06-16T21:01:00Z",
    durationMinutes: 30,
    fathomUrl: "https://fathom.video/calls/713812426",
    fathomShareUrl: "https://fathom.video/share/yLKn13M6TyXxdvFSk73iWMPBFubz9EYr",
    summaryText:
      "Mark Stulzer — Winnipeg, Canada. Father of four, 9–5 with paid traffic skills. Wants $30K/month in 4–6 months working 10–15 hrs/week. Reached out via Instagram after seeing Cole Gordon testimonial. Considering $5K/6mo (most likely) or $9K/12mo. Follow-up call booked for June 17 at 4pm. Objections: Skool hesitancy (addressed), time constraints (addressed with Luke example ~$19k MRR in ~4 weeks).",
    nextSteps: [
      "Follow-up call today June 17 at 4pm — convert to onboarding if payment received",
      "Sent checkout links for $5K and $9K options",
    ],
    budget: "$5,000–$9,000",
    offer: "7-Figure CEO LAUNCH",
  },
  {
    id: "fathom-155625961",
    title: "Claude AI for Founders — Group Onboarding",
    callType: "group",
    contactName: "Brian Parana, Keith Alpert, Fillipe Silvas, Sammy Taggett",
    contactEmail: null,
    contactPhone: null,
    ghlContactId: null,
    scheduledAt: "2026-06-16T18:03:00Z",
    durationMinutes: 65,
    fathomUrl: "https://fathom.video/calls/713626029",
    fathomShareUrl: "https://fathom.video/share/LZ_ywsK-Zg91AejV8NuD-HyejSeWNQvt",
    summaryText:
      "Group onboarding session for Claude AI for Founders community. Brian and Keith joined for the year. Covered Claude + Supabase + Vercel app building, Appify, GoHighLevel MCP, content systems.",
    nextSteps: [
      "Share Miro board + recording in Skool",
      "Keith: book 1:1 next week",
      "Fillipe: build GoHighLevel MCP",
    ],
    budget: "All enrolled — yearly",
    offer: "Claude AI for Founders",
  },
  {
    id: "fathom-154439897",
    title: "JV Intro — Peter Sandeen",
    callType: "jv",
    contactName: "Peter Sandeen",
    contactEmail: "peter@petersandeen.com",
    contactPhone: null,
    ghlContactId: null,
    scheduledAt: "2026-06-11T18:31:00Z",
    durationMinutes: 29,
    fathomUrl: "https://fathom.video/calls/708271553",
    fathomShareUrl: "https://fathom.video/share/wn4Qcx_9UYB112rjH_Hz9GbQs78hgzG1",
    summaryText:
      "15-year independent advisor. Intro call ahead of Cabo mastermind. Wants to refer clients our way once he understands the organic systems. Reviewed JV Partners dashboard. Near-term referral unlikely (client cutting costs) but strong long-term partnership potential.",
    nextSteps: [
      "Send School access + case studies + YouTube workshop",
      "Meet at Cabo mastermind",
    ],
    budget: null,
    offer: null,
  },
];

// ─── GET — fetch all calls ────────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  if (!PAT) return NextResponse.json({ calls: [], recordings: FATHOM_RECORDINGS, error: "No Airtable PAT" });

  // Filter: call date in past 60 days or in the future (upcoming)
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const cutoff = sixtyDaysAgo.toISOString().split("T")[0];

  const filterFormula = encodeURIComponent(`IS_AFTER({☎️ Call Date}, "${cutoff}")`);
  const sort = `sort[0][field]=${encodeURIComponent("☎️ Call Date")}&sort[0][direction]=desc`;
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${filterFormula}&${sort}&maxRecords=50`;

  try {
    const res = await fetch(url, { headers: atHeaders(), cache: "no-store" });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ calls: [], recordings: FATHOM_RECORDINGS, error: err });
    }
    const data = await res.json();
    const calls: AirtableCall[] = (data.records || []).map(mapRecord);

    return NextResponse.json({ calls, recordings: FATHOM_RECORDINGS });
  } catch (err) {
    return NextResponse.json({ calls: [], recordings: FATHOM_RECORDINGS, error: String(err) });
  }
}

// ─── PATCH — update a call record ────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!PAT) return NextResponse.json({ error: "No Airtable PAT" }, { status: 500 });

  const body = await req.json();
  const { recordId, result, followUpStatus, callNotes, followUpNotes, dealAmount } = body as {
    recordId: string;
    result?: string;
    followUpStatus?: string;
    callNotes?: string;
    followUpNotes?: string;
    dealAmount?: number | null;
  };

  if (!recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (result !== undefined) fields["⭐️ Result"] = result;
  if (followUpStatus !== undefined) fields["📣 Follow Up Status"] = followUpStatus;
  if (callNotes !== undefined) fields["📞 Call Notes"] = callNotes;
  if (followUpNotes !== undefined) fields["📣 Follow Up Notes"] = followUpNotes;
  if (dealAmount !== undefined) fields["💰 Deal Amount"] = dealAmount;

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
    method: "PATCH",
    headers: atHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });

  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.error?.message ?? "Airtable error" }, { status: 500 });

  return NextResponse.json({ success: true, record: mapRecord(data) });
}
