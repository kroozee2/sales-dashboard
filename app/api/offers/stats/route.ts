import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// Normalize an offer string for fuzzy name matching (strip emoji, lowercase, trim)
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Most sales_calls store the offer as an Airtable linked-record id, e.g. ["recAbc123"].
// Pull the record id out when present.
function recId(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/rec[A-Za-z0-9]{14,}/);
  return m ? m[0] : null;
}

export async function GET() {
  const [offersRes, callsRes, paymentsRes] = await Promise.all([
    db.from("offers").select("id, airtable_id, name"),
    db.from("sales_calls").select("offer, deal_amount, result").eq("result", "✅ Sale"),
    db.from("manual_payments").select("offer, amount, status").eq("status", "collected"),
  ]);

  const offers = offersRes.data ?? [];
  const sales = callsRes.data ?? [];
  const payments = paymentsRes.data ?? [];

  // Index offers by airtable id/id and by normalized name
  const byRec: Record<string, string> = {};   // recId -> offer.id
  const byName: Record<string, string> = {};   // normName -> offer.id
  for (const o of offers) {
    if (o.airtable_id) byRec[o.airtable_id] = o.id;
    if (o.id) byRec[o.id] = o.id;
    const n = norm(o.name);
    if (n) byName[n] = o.id;
  }

  const stats: Record<string, { revenue: number; count: number }> = {};
  for (const o of offers) stats[o.id] = { revenue: 0, count: 0 };

  function attribute(rawOffer: string | null | undefined, amount: number) {
    if (!rawOffer) return;
    // 1) match by Airtable record id (where the real data lives)
    const rid = recId(rawOffer);
    if (rid && byRec[rid]) {
      stats[byRec[rid]].revenue += amount;
      stats[byRec[rid]].count += 1;
      return;
    }
    // 2) fall back to name match
    const n = norm(rawOffer);
    if (n && byName[n]) {
      stats[byName[n]].revenue += amount;
      stats[byName[n]].count += 1;
    }
  }

  for (const s of sales) attribute(s.offer, s.deal_amount ?? 0);
  for (const p of payments) attribute(p.offer, p.amount ?? 0);

  return NextResponse.json({ stats });
}
