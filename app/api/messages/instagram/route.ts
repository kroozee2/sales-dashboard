import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export const runtime = "nodejs";

function handleFromUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const m = u.match(/instagram\.com\/(?:_u\/)?([A-Za-z0-9_.]+)/i);
  const h = m?.[1];
  if (!h || ["p", "reel", "stories", "explore"].includes(h.toLowerCase())) return null;
  return h.replace(/\/$/, "");
}

// Resolve the person's Instagram so Andrew can DM them directly when GHL's
// 24-hour Instagram window has closed. Looks the handle up from the matching
// lead (we store instagram_url / social_url on leads).
export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get("contactId");
  const name = req.nextUrl.searchParams.get("name") ?? "";

  let handle: string | null = null;
  if (contactId) {
    const db = createLeadsAdminClient();
    const { data } = await db
      .from("leads")
      .select("instagram_url, social_url")
      .eq("ghl_contact_id", contactId)
      .limit(1)
      .maybeSingle();
    handle = handleFromUrl(data?.instagram_url) ?? (/(instagram\.com)/i.test(data?.social_url ?? "") ? handleFromUrl(data?.social_url) : null);
  }

  if (handle) {
    return NextResponse.json({
      found: true,
      handle,
      dmUrl: `https://ig.me/m/${handle}`,
      profileUrl: `https://www.instagram.com/${handle}/`,
    });
  }

  // No stored handle — open Instagram so they can search this person by name.
  return NextResponse.json({
    found: false,
    searchUrl: `https://www.instagram.com/${name ? "?q=" + encodeURIComponent(name) : ""}`,
    name,
  });
}
