import { NextRequest, NextResponse } from "next/server";

// Generate value-drop scripts for a resource, in Andrew's DM voice.
export async function POST(req: NextRequest) {
  const { title, type, about, url } = await req.json() as { title: string; type?: string; about?: string; url?: string };
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const prompt = `You are the top 0.01% DM setter in the coaching/consulting space, writing for Andrew Kroeze (7-Figure CEO). Write 3 short "value drop" messages a setter can send to deliver this resource and build value, following Andrew's two-step Value CTA flow (someone engaged with a post, now we deliver the promised asset and open a real conversation).

THE RESOURCE:
Title: ${title}
Type: ${type ?? "resource"}
What it is: ${about ?? "(not specified)"}
Link: ${url ?? "{url}"}

ANDREW'S TEXTING VOICE (non-negotiable):
- Mostly lowercase, no period at the end of the final line
- NO em dashes ever. Use "..." or commas.
- Sparse emoji, max one (💪 🙏 😏)
- NEVER: "amazing", "definitely", "absolutely", "totally", "guru", "hustle", "crush it", "guaranteed", "just following up"
- One question mark max per message
- Sounds like a sharp friend, not a marketer

THE CRAFT — each message must:
1. Acknowledge they engaged (reference the post/comment naturally)
2. Deliver the resource with real value framing (what it does FOR them)
3. End with ONE genuine question that opens the conversation toward what they're building/struggling with (moves to probing)
Use {name} for their first name and {url} for the link.

Give 3 distinct angles: one straight value-drop, one that reframes their thinking, one that's curiosity/pattern-interrupt.

Respond ONLY as JSON, no markdown:
{"value_scripts": [{"title": "short label", "body": "the message with {name} and {url}"}]}`;

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
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text) throw new Error("Empty response");
    const parsed = JSON.parse(text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()) as { value_scripts: unknown };
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Value scripts error:", err);
    return NextResponse.json({ error: "Failed to generate value scripts" }, { status: 500 });
  }
}
