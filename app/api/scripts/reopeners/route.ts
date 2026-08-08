import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY!
);

type YtVideo = { title: string; url: string };

async function fetchRecentYouTube(): Promise<YtVideo[]> {
  if (!process.env.APIFY_TOKEN) return [];
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url: "https://www.youtube.com/@andrewkroeze999/videos" }],
          maxResults: 6,
          maxResultsShorts: 0,
          maxResultStreams: 0,
        }),
        signal: AbortSignal.timeout(60000),
      }
    );
    if (!res.ok) return [];
    const items = await res.json() as Array<{ title?: string; url?: string; id?: string }>;
    return items
      .filter((v) => v.title && (v.url || v.id))
      .slice(0, 6)
      .map((v) => ({ title: v.title!, url: v.url ?? `https://youtube.com/watch?v=${v.id}` }));
  } catch {
    return [];
  }
}

async function fetchRecentWins(): Promise<string[]> {
  const client = db();
  const [callsRes, paymentsRes] = await Promise.all([
    client
      .from("sales_calls")
      .select("name, deal_amount, offer, call_date")
      .eq("result", "✅ Sale")
      .order("call_date", { ascending: false })
      .limit(8),
    client
      .from("manual_payments")
      .select("name, amount, offer, payment_date")
      .eq("status", "collected")
      .order("payment_date", { ascending: false })
      .limit(8),
  ]);
  const wins: string[] = [];
  for (const c of callsRes.data ?? []) {
    if (c.deal_amount) wins.push(`${c.name} enrolled${c.offer ? ` in ${c.offer}` : ""} ($${Number(c.deal_amount).toLocaleString()}) on ${String(c.call_date).split("T")[0]}`);
  }
  for (const p of paymentsRes.data ?? []) {
    wins.push(`${p.name} paid $${Number(p.amount).toLocaleString()}${p.offer ? ` for ${p.offer}` : ""} on ${p.payment_date}`);
  }
  return wins.slice(0, 10);
}

export async function POST() {
  const [videos, wins] = await Promise.all([fetchRecentYouTube(), fetchRecentWins()]);

  const prompt = `You are the top 0.01% DM setter in the coaching and consulting space, writing for Andrew Kroeze (7-Figure CEO). Your re-openers provide real value, shift how prospects think, and aren't afraid to challenge them. You never sound like a sales rep chasing a commission.

Your job: write 6 re-opener messages to restart conversations with warm prospects (coaches and consultants) who went quiet. These get sent as DMs or texts.

FUEL — Andrew's most recent YouTube videos (use as value drops; include the actual link when the re-opener references a video):
${videos.length ? videos.map((v) => `- ${v.title}: ${v.url}`).join("\n") : "(none available — skip video-based re-openers)"}

FUEL — recent client wins (use as social-proof re-openers; reference the win naturally, first name only):
${wins.length ? wins.map((w) => `- ${w}`).join("\n") : "(none available)"}

ANDREW'S TEXTING VOICE (non-negotiable):
- Mostly lowercase, no period at the end of the final line
- NO em dashes ever. Use "..." or commas or a new sentence.
- Sparse emoji, max one, only when genuine (💪 🙏 😏)
- NEVER: "amazing", "definitely", "absolutely", "totally", "guru", "hustle", "crush it", "guaranteed"
- Sounds like a friend who happens to be a killer operator, not a marketer
- One question mark max per message
- Use {name} as the placeholder for their first name

THE CRAFT — each re-opener must do at least one of:
1. VALUE: hand them something genuinely useful (a video, an insight, a framework) with zero ask
2. REFRAME: challenge how they're thinking about their problem ("mind if I challenge you on something?")
3. PROOF: a recent client win that makes them feel what's possible, tied to THEIR goal
4. PATTERN INTERRUPT: something unexpected that's impossible to ignore

Mix of types. 1-3 sentences each. No pitching, no links to sales pages, no "just following up".

Respond ONLY as JSON, no markdown:
{"reopeners": [{"title": "short label (e.g. 'Video value drop — [topic]')", "body": "the message with {name} placeholder", "type": "value | reframe | proof | interrupt"}]}`;

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
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text) throw new Error("Empty model response");
    const parsed = JSON.parse(text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()) as {
      reopeners: Array<{ title: string; body: string; type: string }>;
    };
    return NextResponse.json({
      reopeners: parsed.reopeners,
      sources: { videos: videos.length, wins: wins.length },
      videos,
      wins,
    });
  } catch (err) {
    console.error("Reopener generation error:", err);
    return NextResponse.json({ error: "Failed to generate re-openers" }, { status: 500 });
  }
}
