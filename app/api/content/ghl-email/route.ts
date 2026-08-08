import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";
export const maxDuration = 60;

const GHL_BASE = "https://services.leadconnectorhq.com";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Turn the plain-text body the user wrote into simple, clean email HTML.
function toHtml(text: string, subject: string) {
  const blocks = text.trim().split(/\n{2,}/).map((b) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#111;">${esc(b).replace(/\n/g, "<br>")}</p>`
  ).join("");
  return `<!doctype html><html><body style="margin:0;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f6f6f6;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;">${blocks || `<p>${esc(subject)}</p>`}</div>
</body></html>`;
}

// Push a content item's email into GoHighLevel as a ready-to-use email template.
export async function POST(req: NextRequest) {
  const { id } = (await req.json()) as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const key = process.env.GHL_API_KEY;
  const loc = process.env.GHL_LOCATION_ID;
  if (!key || !loc) return NextResponse.json({ error: "GoHighLevel is not configured (missing GHL_API_KEY / GHL_LOCATION_ID)." }, { status: 400 });

  const db = contentDb();
  const { data: item, error } = await db.from("content_items").select("*").eq("id", id).single();
  if (error || !item) return NextResponse.json({ error: "item not found" }, { status: 404 });

  const m = (item.meta ?? {}) as Record<string, string>;
  const subject = (m.subject || item.title || "Untitled email").trim();
  const body = (m.details || m.hook || (item.drafts?.email as string) || "").trim();
  const title = `📧 ${subject}`.slice(0, 120);

  const res = await fetch(`${GHL_BASE}/emails/builder`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Version: "2021-07-28", "Content-Type": "application/json" },
    body: JSON.stringify({ locationId: loc, title, type: "html", html: toHtml(body, subject), isPlainText: false }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.id) {
    const msg = Array.isArray(j?.message) ? j.message.join(", ") : (j?.message || `GHL error ${res.status}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const templateId = j.id as string;
  const base = `https://app.gohighlevel.com/v2/location/${loc}`;
  const urls = {
    template: `${base}/emails/builder/${templateId}`,
    campaigns: `${base}/marketing/emails/campaigns`,
    templates: `${base}/marketing/emails/templates`,
  };

  // Remember the push on the item so the UI can show it's linked.
  const meta = { ...(item.meta || {}), ghl_template_id: templateId, ghl_pushed_at: new Date().toISOString() };
  await db.from("content_items").update({ meta, updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ templateId, subject, urls });
}
