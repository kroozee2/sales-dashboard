import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// POST { id } — generate a share-ready one-sheeter from the offer's 7 Ps.
export async function POST(req: NextRequest) {
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured." }, { status: 500 });

  const { data: o } = await db.from("offer_briefs").select("*").eq("id", id).single();
  if (!o) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const ctx = [
    o.name && `OFFER NAME: ${o.name}`,
    o.person && `PERSON: ${o.person}`,
    o.problems && `PROBLEMS: ${o.problems}`,
    o.promise && `PROMISE: ${o.promise}`,
    o.path && `PATH: ${o.path}`,
    o.packaging && `PACKAGING: ${o.packaging}`,
    o.proof && `PROOF: ${o.proof}`,
    o.price_point && `PRICE POINT: ${o.price_point}`,
    o.braindump && !o.person && `RAW NOTES: ${o.braindump}`,
  ].filter(Boolean).join("\n\n");

  const prompt = `You are Andrew Kroeze's offer copywriter at 7-Figure CEO. Turn this offer's 7Ps into a clean, share-ready ONE-SHEETER a prospect can read and instantly get it.

BRAND VOICE (non-negotiable): direct, warm, human. NO em dashes ever (use commas/periods). Never use: guru, hustle, grind, crush it, kill it, guaranteed, magic bullet, overnight. Lead with the client's problem/identity. Specific numbers over vague claims.

OFFER DETAILS:
${ctx}

Write the one-sheeter in clean Markdown with these sections, tight and skimmable (no fluff):
# [Offer name]
**For:** one line on exactly who this is for
## The Problem
2-3 sentences naming their current pain in their words
## The Promise
the transformation and outcome, specific, with a timeframe
## How It Works
the Path as 3-5 short numbered steps
## What's Included
a bulleted list from the packaging
## Proof
2-4 real result bullets (only from the proof provided)
## Investment
the price, options, and the first step to get started

Output ONLY the Markdown, no preamble, no code fences.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim()
      .replace(/^```(?:markdown)?\n?/, "").replace(/\n?```$/, "").trim();
    await db.from("offer_briefs").update({ one_sheeter: text, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ one_sheeter: text });
  } catch (e) {
    console.error("one-sheeter error:", e);
    return NextResponse.json({ error: "Failed to generate. Try again." }, { status: 500 });
  }
}
