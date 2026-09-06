import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!;

export const callsDb = createClient(url, key);

export type CallResult = "✅ Sale" | "📣 Follow Up" | "🔜 Upcoming" | "❌ Did Not Close" | "👻 No Show";
export type CallType = "📞 Sales Call" | "🔍 Triage Call" | "🤙 Connection Call" | "🧑‍💼 Client Call" | "🤝 Partnership Call" | "🎓 Coaching Call" | "🤝 JV Call" | "👥 Group Call";
export type ProspectQuality = "🔥 High" | "👌 Medium" | "❄️ Low";
export type FollowUpStatus = "🚀 Rebook" | "💳 Payment Link Sent" | "📣 Sent Message" | "✅ Closed" | "❌ Lost";

export interface SalesCall {
  id: string;
  // Details
  name: string;
  call_date: string | null;
  call_type: CallType | null;
  booking_source: string | null;
  set_by: string | null;
  confirmed: string | null;
  prospect_quality: ProspectQuality | null;
  // Contact
  phone: string | null;
  email: string | null;
  ghl_contact_id: string | null;
  ghl_url: string | null;
  // Call
  result: CallResult | null;
  success: boolean | null;
  showed: boolean | null;
  call_notes: string | null;
  recording_url: string | null;
  fathom_call_id: string | null;
  ai_summary: string | null;
  // Objections
  objections: string[];
  objections_notes: string | null;
  // Offer
  offer: string | null;
  offer_brief_id: string | null;
  offer_made: boolean;
  enrollment_date: string | null;
  cc_upfront: number | null;
  deal_amount: number | null;
  new_revenue: number | null;
  // Follow-Up
  follow_up_status: FollowUpStatus | null;
  follow_up_by: string | null;
  follow_up_date: string | null;
  follow_up_count: number | null;
  follow_up_notes: string | null;
  // Extra
  booking_date: string | null;
  sales_call_by: string | null;
  monthly_revenue: number | null;
  // Meta
  created_at: string;
  updated_at: string;
}
