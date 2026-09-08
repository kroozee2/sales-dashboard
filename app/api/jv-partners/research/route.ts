import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// The JV brief. Same shape Flow produced, but web-searched against the real
// person and written back to the row instead of the browser.

export const runtime = "nodejs";
export const maxDuration = 180;

const OFFERS = `Andrew Kroeze runs 7-Figure CEO: LAUNCH ($9K) for coaches at $5-20K/mo, and BOARDROOM ($15-20K, 6mo) for coaches and agency owners at $20-84K/mo hitting a ceiling. His audience is heart-centered coaches, consultants and agency owners.`;

const stripCites = (v: unknown): unknown => {
  if (typeof v === "string") return v.replace(/<\/?cite[^>]*>/g, "").trim();
  if (Array.isArray(v)) return v.map(stripCites);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k in v as Record<string, unknown>) o[k] = stripCites((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
};

export async function POST(req: NextRequest) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  const db = createLeadsAdminClient();
  const { data: p, error: readErr } = await db.from("jv_partners").select("*").eq("id", id).single();
  if (readErr || !p) return NextResponse.json({ error: readErr?.message ?? "not found" }, { status: 404 });

  const prompt = `Research ${p.name}${p.title ? `, ${p.title}` : ""}${p.company ? ` at ${p.company}` : ""} and write a JV/partnership brief for Andrew Kroeze.

What we already have on file:
- Industry: ${p.industry || "unknown"}
- Website: ${p.website || "none"}
- LinkedIn: ${p.linkedin || "none"}
- Instagram: ${p.instagram || "none"}
- Bio on file: ${p.bio || "none"}

${OFFERS}

Search the web for what they actually do today. Do not invent numbers, clients or claims. If you cannot verify something, leave it out and say so in score_reason.

Return ONLY JSON:
{
  "business_model": "what they sell and to whom",
  "target_market": "their ICP and the problem they solve",
  "jv_angles": ["2-3 specific ways Andrew could partner with them"],
  "what_they_need": "what they are likely short on right now",
  "conversation_starters": ["2-3 openers referencing their real work"],
  "watch_outs": "overlaps or misalignments to know about",
  "overall_score": <1-10 as a JV prospect for Andrew>,
  "score_reason": "one sentence, and name anything you could not verify",
  "sources": ["url", "url"]
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
    let research: unknown;
    try { research = JSON.parse(jsonStr); } catch { research = { business_model: text }; }
    research = stripCites(research);

    const research_at = new Date().toISOString();
    await db.from("jv_partners").update({ research, research_at }).eq("id", id);
    return NextResponse.json({ research, research_at });
  } catch (e) {
    console.error("partner research error:", e);
    return NextResponse.json({ error: "Research failed. Try again." }, { status: 500 });
  }
}
