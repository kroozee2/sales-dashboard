import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 180;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

const OFFERS = `Andrew Kroeze runs 7-Figure CEO. His offers:
- LAUNCH ($9,000 PIF or $1,000/mo x12): coaches/consultants/service providers at $5K-$20K/mo who want consistent $30K+/mo. Solves: no consistent leads, unclear offer, no system, doing it all alone.
- BOARDROOM ($15,000-$20,000 PIF, 6 mo): coaches/agency owners at $20K-$84K/mo hitting a ceiling. Solves: revenue rollercoaster, team chaos, complexity, isolation. Goal: $100K+/mo with a lean team.`;

// Web search leaves <cite index="..."> markers in text — strip them everywhere.
const stripCites = (v: unknown): unknown => {
  if (typeof v === "string") return v.replace(/<\/?cite[^>]*>/g, "").trim();
  if (Array.isArray(v)) return v.map(stripCites);
  if (v && typeof v === "object") { const o: Record<string, unknown> = {}; for (const k in v as Record<string, unknown>) o[k] = stripCites((v as Record<string, unknown>)[k]); return o; }
  return v;
};

// GET — cached intel for this call (if any)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await db.from("call_intel").select("*").eq("call_id", id).maybeSingle();
  return NextResponse.json({ intel: data?.data ? stripCites(data.data) : null, generated_at: data?.generated_at ?? null });
}

// POST — research the prospect live (web + app data), cache, return.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured." }, { status: 500 });

  const { data: call } = await db.from("sales_calls").select("*").eq("id", id).single();
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  // Enrich with a matching lead (by email) for anything else we already know.
  let leadCtx = "";
  if (call.email) {
    const { data: lead } = await db.from("leads").select("full_name, revenue_level, quality, notes, instagram_url, facebook_url, linkedin_url, social_url, source").ilike("email", call.email).maybeSingle();
    if (lead) leadCtx = `\nFrom our CRM: revenue ${lead.revenue_level ?? "?"}, quality ${lead.quality ?? "?"}, source ${lead.source ?? "?"}. Socials: ${[lead.instagram_url, lead.facebook_url, lead.linkedin_url, lead.social_url].filter(Boolean).join(", ") || "none on file"}. Notes: ${(lead.notes ?? "").slice(0, 500)}`;
  }

  const known = [
    `Name: ${call.name ?? "Unknown"}`,
    call.email && `Email: ${call.email}`,
    call.phone && `Phone: ${call.phone}`,
    call.monthly_revenue != null && `Monthly revenue (on file): $${call.monthly_revenue}`,
    call.offer && `Offer discussed: ${call.offer}`,
    call.call_notes && `Call notes: ${String(call.call_notes).slice(0, 800)}`,
    call.ai_summary && `Prior call summary: ${String(call.ai_summary).slice(0, 800)}`,
    leadCtx,
  ].filter(Boolean).join("\n");

  const prompt = `You are Andrew Kroeze's prospect-research analyst. Build a CURRENT, accurate intel dossier on this person before Andrew's sales call. Use web search to find their real, up-to-date info and social profiles. Do not invent facts. If something can't be verified, say so.

${OFFERS}

WHAT WE ALREADY KNOW:
${known}

Search the web for this person and their business (try their name + email domain + likely handles). Find their social profiles, what their business does, what they sell, their audience, and any signals about their revenue, pains, and goals.

Then respond with ONLY a JSON object (no prose before or after), exactly:
{
  "summary": "2-3 sentences: who they are and what they do",
  "business": "what their business is and who they serve",
  "sells": "what they sell / their current offer(s) and rough price point if findable",
  "revenue_estimate": "best estimate of their business size/revenue, or 'unknown'",
  "socials": [{"platform":"Instagram|LinkedIn|Facebook|YouTube|TikTok|Website|X","url":"https://...","handle":"@..."}],
  "pain_points": ["likely problem 1", "problem 2", "problem 3"],
  "goals": ["where they want to go 1", "goal 2"],
  "trajectory": "1-2 sentences on where they're headed / what they're building toward",
  "best_fit_offer": "LAUNCH or BOARDROOM, and why in one sentence",
  "talking_points": ["specific thing to bring up on the call 1", "2", "3"],
  "confidence": "high|medium|low",
  "sources": ["url1","url2"]
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
    const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    let intel: unknown;
    try { intel = JSON.parse(jsonStr); } catch { intel = { summary: text }; }
    intel = stripCites(intel);

    await db.from("call_intel").upsert({ call_id: id, data: intel, generated_at: new Date().toISOString() }, { onConflict: "call_id" });
    return NextResponse.json({ intel, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error("intel error:", e);
    return NextResponse.json({ error: "Research failed. Try again." }, { status: 500 });
  }
}
