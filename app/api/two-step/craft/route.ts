import { NextRequest, NextResponse } from "next/server";

// Craft a personalized value-drop for a two-step commenter delivering the promised resource.
export async function POST(req: NextRequest) {
  const { name, comment_text, resource, post_title } = await req.json() as {
    name: string;
    comment_text?: string;
    resource?: { title?: string; about?: string; url?: string };
    post_title?: string;
  };
  const first = (name ?? "").split(" ")[0] || "there";

  const prompt = `You are the top 0.01% DM setter in the coaching/consulting space, writing ONE message for Andrew Kroeze to send to someone who just engaged with his post. Deliver the promised resource and open a real conversation. Never salesy, never creepy.

THEY COMMENTED: "${comment_text ?? "(engaged with the post)"}"
ON THE POST: "${post_title ?? "(a value post)"}"

THE RESOURCE TO DELIVER:
Title: ${resource?.title ?? "the resource"}
What it is: ${resource?.about ?? ""}
Link: ${resource?.url ?? "{url}"}

ANDREW'S TEXTING VOICE (non-negotiable):
- Mostly lowercase, no period at the end of the final line
- NO em dashes ever. Use "..." or commas.
- Sparse emoji, max one (💪 🙏 😏)
- NEVER: "amazing", "definitely", "absolutely", "totally", "guru", "hustle", "crush it", "guaranteed", "just following up"
- One question mark max per message
- Sounds like a sharp friend, not a marketer

THE CRAFT:
- Open by acknowledging their comment naturally (if they asked a real question, react to it specifically — that's gold)
- Deliver the resource link with a value frame (what it does FOR them)
- End with ONE genuine question that moves toward what they're building or struggling with
- Use ${first} for their name and the actual link ${resource?.url ?? "{url}"}
- 1-3 short sentences

Respond ONLY as JSON, no markdown:
{"message": "the ready-to-send message", "why": "one sentence on the play"}`;

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
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text) throw new Error("Empty response");
    const parsed = JSON.parse(text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()) as { message: string; why: string };
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Two-step craft error:", err);
    return NextResponse.json({ error: "Failed to craft message" }, { status: 500 });
  }
}
