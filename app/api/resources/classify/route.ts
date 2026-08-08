import { NextRequest, NextResponse } from "next/server";

// Turn a spoken description (+ optional link/image) into a structured, categorized
// resource with setter send-scripts. Powers the voice "just speak what it is" add flow.
export async function POST(req: NextRequest) {
  const { transcript, url, imageUrl } = await req.json() as { transcript?: string; url?: string; imageUrl?: string };
  if (!transcript && !url && !imageUrl) {
    return NextResponse.json({ error: "Provide a spoken description, link, or image" }, { status: 400 });
  }

  const prompt = `You are organizing a sales resource library for Andrew Kroeze (7-Figure CEO). A setter just added a resource and described it out loud. Turn it into a clean, structured entry the setter can grab and send to prospects.

WHAT THE SETTER SAID (voice transcript):
"${transcript ?? "(nothing spoken)"}"

LINK: ${url || "(none)"}
IMAGE ATTACHED: ${imageUrl ? "yes" : "no"}

CATEGORIES (pick the single best fit):
- "social" = Andrew's social profiles / communities (Facebook, Instagram, YouTube, TikTok, LinkedIn, Skool, ManyChat)
- "lead_magnet" = a free asset that delivers value and opens a conversation (guide, checklist, template, mini-training, tool)
- "funnel" = a page/flow that moves someone toward a purchase (webinar, VSL, application, checkout, sales page, event)
- "testimonial" = a client quote or short win, usually text or a screenshot
- "case_study" = a fuller client result story with a number and a before/after

WRITE:
- category: one of the exact keys above
- title: short, punchy label (max ~6 words), no emoji
- subtitle: one short line — the core promise or the headline result (max ~10 words). Use null if not applicable.
- about: 1-2 plain sentences on what it is and what it does FOR the prospect
- value_scripts: 2 short DM messages a setter sends to deliver this and open a real conversation. For social/funnel, keep it to 1 script.

ANDREW'S TEXTING VOICE (non-negotiable):
- Mostly lowercase, no period on the final line
- NO em dashes ever, use "..." or commas
- Max one emoji, max one question mark per message
- Never: "amazing", "definitely", "absolutely", "guru", "hustle", "crush it", "guaranteed", "just following up"
- Sounds like a sharp friend, not a marketer
- Use {name} for the prospect's first name and {url} for the link

Respond ONLY as minified JSON, no markdown:
{"category":"...","title":"...","subtitle":"..."|null,"about":"...","value_scripts":[{"title":"short label","body":"..."}]}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text) throw new Error("Empty response");
    const parsed = JSON.parse(text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim());
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Resource classify error:", err);
    return NextResponse.json({ error: "Failed to classify resource" }, { status: 500 });
  }
}
