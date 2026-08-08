import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// The 7 Ps we generate. `only` lets the caller regenerate a single section.
const PS = ["person", "problems", "promise", "path", "packaging", "proof", "price_point"] as const;
type P = (typeof PS)[number];

// Andrew's proof library — injected so the Proof section can pull real receipts.
const PROOF_LIBRARY = `Andrew Kroeze / 7-Figure CEO proof to pull from (use what fits the offer):
- $10,000,000+ generated from coaching + agency work; 9 years in the online space
- Sold a $1M profit/year business; $82K student-loan debt to financial freedom in 3 years
- $1.1M in contracts in 24 hours at a live event (2019)
- Grew a Facebook group 0 to 23,000 members organically
- Helped 122 clients scale from 0 to 7 figures in a year
- Spoke on stage with Daymond John, Jesse Itzler, Tom Bilyeu
Client results:
- Cole Gordon: $0 to $247K beta launch, then $40M agency (Closers.io)
- Rae Ireland: $20K/mo to $155K/mo in 4 months
- Kavetha Sundersmoothy: $20K/mo to $160K/mo in 4 months
- Bastiaan Slot: $0 to $100K+/mo in 90 days with a new offer
- Franco Urbaez: $20K/mo to $100K+/mo in 4 months
- Jeremy Minor: 0 to 3,000 community members in a month, 300K+ now
- Jen & Stacy Conkey: 0 to 10,000 FB group + $1M in 12 months
- Alok Appadari: 10 years stuck under 7 figures, first 7-figure run-rate month in 2 months
- Kalah Hill: $1K/mo to $24K/mo in 2 months`;

const GUIDE: Record<P, string> = {
  person: "PERSON (Who am I?): The exact avatar. Gender, title, location, years in business, team size, monthly revenue if known. Who this is FOR and who it is NOT for. Their best-client identity.",
  problems: "PROBLEMS (Describe my undesired situation better than I can): Their current situation, frustrations, fears, and pain in vivid specifics. Use their words. Lead with emotion.",
  promise: "PROMISE (Describe my desired situation better than I can): The desired situation, wants, and aspirations. The specific transformation and outcome in a timeframe.",
  path: "PATH (The 3-5 steps to get from undesired to desired situation): The clear roadmap / mechanism. 3 to 5 named steps that move them from problem to promise.",
  packaging: "PACKAGING (How is this delivered?): Program name, what's included, format, calls, community, support, systems, delivery cadence.",
  proof: "PROOF (How do I know this is real?): Pull the most relevant client results and personal proof from the library provided. Use real names and real numbers.",
  price_point: "PRICE POINT (How do I get started?): Investment, payment options, scarcity, urgency, guarantee/risk reversal, and the first step to enroll.",
};

export async function POST(req: NextRequest) {
  const { id, braindump, only } = (await req.json()) as { id?: string; braindump?: string; only?: P };
  const dump = (braindump ?? "").trim();
  if (!dump) return NextResponse.json({ error: "Braindump is empty — write something first." }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured (ANTHROPIC_API_KEY missing)." }, { status: 500 });

  const targets = only && PS.includes(only) ? [only] : [...PS];
  const guideText = targets.map((p) => `- ${GUIDE[p]}`).join("\n");
  const jsonShape = targets.map((p) => `  "${p}": "clear, well-formatted text for this section (use line breaks and short labeled bullets where helpful)"`).join(",\n");

  const prompt = `You are an elite offer strategist for Andrew Kroeze at 7-Figure CEO, using his "7Ps of Perfect Positioning" framework. Turn a raw braindump into crystal-clear, ultra-specific positioning.

BRAND VOICE (non-negotiable):
- Direct, warm, deeply human. Expert without academic. Confident without arrogant.
- NO em dashes anywhere. Use commas, periods, or restructure.
- NEVER use: guru, hustle, grind, crush it, kill it, guaranteed, magic bullet, overnight.
- Lead with the client's problem or identity, not credentials. Specific numbers over vague claims.
- The key to positioning is to be ULTRA specific.

${PROOF_LIBRARY}

RAW BRAINDUMP for this offer:
"""
${dump}
"""

Write the following section(s) of the 7Ps. Be specific and usable as real messaging. Where the braindump is thin, make a strong, on-brand inference (never invent fake client results — only use proof from the library above).

${guideText}

Respond ONLY with valid JSON, no markdown fences, in exactly this shape:
{
${jsonShape}
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    // claude-sonnet-5 can return a leading `thinking` block, so pull every text block, not content[0].
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    const jsonText = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(jsonText) as Record<string, string>;

    // Persist the generated sections onto the brief (if we have an id).
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const p of targets) if (typeof parsed[p] === "string") updates[p] = parsed[p];
    if (id) await db.from("offer_briefs").update(updates).eq("id", id);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("offer-briefs generate error:", err);
    return NextResponse.json({ error: "Failed to generate. Try again." }, { status: 500 });
  }
}
