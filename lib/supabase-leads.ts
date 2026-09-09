import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!;
const supabaseServiceKey = process.env.SUPABASE_CALLS_SERVICE_KEY!;

// Server-side client. Everything that touches leads runs in a route handler, so
// there is no browser-side client here; the one that existed was never called
// and only served to keep the published anon key in reach.
export function createLeadsAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export type Lead = {
  id: string;
  airtable_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  social_url: string | null;
  prospect_stage: string | null;
  dm_stage: string | null;
  follow_up_date: string | null;
  quality: string | null;
  source: string | null;
  revenue_level: string | null;
  notes: string | null;
  offer_brief_id: string | null;
  ongoing_message_feed: string | null;
  ghl_contact_id: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  ghl_url: string | null;
  setter: string | null;
  sales_person: string | null;
  tags: string[] | null;
  opt_in_date: string | null;
  last_update: string | null;
  created_at: string | null;
  synced_at: string | null;
  hot?: boolean;
};
