/**
 * One-time migration: Airtable SalesCallsOS → Supabase sales_calls
 * Run with: node scripts/migrate-airtable.mjs
 */

import { createClient } from "@supabase/supabase-js";

const AT_PAT = process.env.AIRTABLE_PAT;
const AT_BASE = process.env.AIRTABLE_LEADS_BASE || "appPqR5QXRBoqTZCX";
const AT_TABLE = "tbliiQRS9m0DHb5eb"; // SalesCallsOS

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY;

if (!AT_PAT || !SB_URL || !SB_KEY) {
  console.error("Missing env vars. Make sure .env.local is set.");
  process.exit(1);
}

const db = createClient(SB_URL, SB_KEY);

function mapRecord(r) {
  const f = r.fields;

  // Recording URL
  let recording_url = (f["🎥 Call Recording"]) || null;
  if (!recording_url) {
    const notes = (f["📞 Call Notes"]) || "";
    const m = notes.match(/https:\/\/fathom\.video\/[^\s>)]+/);
    if (m) recording_url = m[0];
  }

  // AI Summary (array or string)
  const aiRaw = f["🧾 AI Summary"];
  const ai_summary = Array.isArray(aiRaw) && aiRaw.length > 0 ? aiRaw[0] : typeof aiRaw === "string" ? aiRaw : null;

  // Result mapping — standardize to our emoji format
  const resultRaw = f["⭐️ Result"] || null;
  let result = resultRaw;
  if (resultRaw) {
    if (resultRaw.includes("Sale") && !resultRaw.startsWith("✅")) result = "✅ Sale";
    else if (resultRaw.includes("Follow Up") && !resultRaw.startsWith("📣")) result = "📣 Follow Up";
    else if (resultRaw.includes("Upcoming") && !resultRaw.startsWith("🔜")) result = "🔜 Upcoming";
    else if (resultRaw.includes("Did Not Close") && !resultRaw.startsWith("❌")) result = "❌ Did Not Close";
    else if (resultRaw.includes("No Show") || resultRaw.includes("Did Not Show")) result = "👻 No Show";
  }

  // Call type
  const typeRaw = f["⭐️ Type"] || null;
  let call_type = null;
  if (typeRaw) {
    if (typeRaw.includes("Sales")) call_type = "📞 Sales Call";
    else if (typeRaw.includes("Triage")) call_type = "🔍 Triage Call";
    else if (typeRaw.includes("Coach")) call_type = "🎓 Coaching Call";
    else if (typeRaw.includes("JV") || typeRaw.includes("Partner")) call_type = "🤝 JV Call";
    else if (typeRaw.includes("Group")) call_type = "👥 Group Call";
    else call_type = typeRaw;
  }

  // Success
  const successRaw = f["✅ Success?"];
  const success = successRaw === true || successRaw === "Yes" || successRaw === "✅ Yes" ? true
    : successRaw === false || successRaw === "No" || successRaw === "❌ No" ? false : null;

  // Showed — look for various field names
  const showedRaw = f["👀 Showed"] || f["Showed"] || f["✅ Showed"] || null;
  const showed = showedRaw === true || showedRaw === "Yes" ? true : showedRaw === false || showedRaw === "No" ? false : null;

  // Offer made
  const offerMadeRaw = f["💰 Offer Made?"] || f["Offer Made?"];
  const offer_made = offerMadeRaw === true || offerMadeRaw === "Yes" ? true : false;

  // Prospect quality — normalize
  const qualityRaw = f["👌 Prospect Quality"] || null;
  let prospect_quality = null;
  if (qualityRaw) {
    if (qualityRaw.includes("High")) prospect_quality = "🔥 High";
    else if (qualityRaw.includes("Medium")) prospect_quality = "👌 Medium";
    else if (qualityRaw.includes("Low")) prospect_quality = "❄️ Low";
    else prospect_quality = qualityRaw;
  }

  // Follow-up status
  const fuRaw = f["📣 Follow Up Status"] || null;
  let follow_up_status = fuRaw;
  if (fuRaw) {
    if (fuRaw.includes("Rebook")) follow_up_status = "🚀 Rebook";
    else if (fuRaw.includes("Payment")) follow_up_status = "💳 Payment Link Sent";
    else if (fuRaw.includes("Message") || fuRaw.includes("Sent")) follow_up_status = "📣 Sent Message";
    else if (fuRaw.includes("Closed")) follow_up_status = "✅ Closed";
    else if (fuRaw.includes("Lost")) follow_up_status = "❌ Lost";
  }

  return {
    name: (f["🔥 Name"]) || (f["👱‍♂️ Name"]) || "Unknown",
    call_date: (f["☎️ Call Date"]) ? new Date(f["☎️ Call Date"]).toISOString() : null,
    call_type,
    booking_source: (f["⭐️ Booking Source"]) || null,
    set_by: "Andrew Kroeze",
    sales_call_by: "Andrew Kroeze",
    prospect_quality,
    phone: (f["☎️ Phone"]) || null,
    email: (f["📧 Email"]) || null,
    ghl_url: (f["⭐️ GHL Link"]) || null,
    result,
    success,
    showed,
    call_notes: (f["📞 Call Notes"]) || null,
    recording_url,
    ai_summary,
    objections: Array.isArray(f["❌ Objection"]) ? f["❌ Objection"] : f["❌ Objection"] ? [f["❌ Objection"]] : [],
    objections_notes: (f["❌ Objections"]) || null,
    offer: (f["🎁Offer"]) || (f["🎁 Offer"]) || null,
    offer_made,
    deal_amount: (f["💰 Deal Amount"]) || null,
    new_revenue: (f["🏦 New Revenue"]) || null,
    cc_upfront: (f["💳 CC Upfront"]) || null,
    enrollment_date: (f["✅ Enrollment Date"]) || null,
    monthly_revenue: (f["📅 Monthly Revenue"]) || (f["💵 Monthly Revenue"]) || null,
    follow_up_status,
    follow_up_date: (f["📣 Follow Up Call"]) || null,
    follow_up_notes: (f["📣 Follow Up Notes"]) || null,
    follow_up_count: (f["📣 # of Follow Ups"]) || null,
  };
}

async function fetchAllRecords() {
  const records = [];
  let offset = null;
  let page = 1;

  do {
    const url = new URL(`https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("sort[0][field]", "☎️ Call Date");
    url.searchParams.set("sort[0][direction]", "asc");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AT_PAT}` },
    });
    const data = await res.json();

    if (!res.ok) {
      console.error("Airtable error:", data.error);
      break;
    }

    records.push(...(data.records || []));
    offset = data.offset || null;
    console.log(`  Page ${page}: fetched ${data.records?.length ?? 0} records (total so far: ${records.length})`);
    page++;
  } while (offset);

  return records;
}

async function main() {
  console.log("🚀 Starting Airtable → Supabase migration...\n");

  // 1. Fetch all records
  console.log("📥 Fetching records from Airtable SalesCallsOS...");
  const records = await fetchAllRecords();
  console.log(`\n✅ Fetched ${records.length} records total\n`);

  // 2. Map to Supabase shape
  const rows = records.map(mapRecord).filter((r) => r.name !== "Unknown");
  console.log(`📝 Mapped ${rows.length} valid records\n`);

  // 3. Insert in batches of 100
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db.from("sales_calls").insert(batch);
    if (error) {
      console.error(`❌ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`  ✅ Inserted batch ${Math.floor(i / BATCH) + 1} (${inserted}/${rows.length})`);
    }
  }

  console.log(`\n🎉 Migration complete! ${inserted} calls now in Supabase.`);
}

main().catch(console.error);
