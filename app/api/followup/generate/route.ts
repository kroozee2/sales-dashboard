import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LINKS = {
  booking: "https://us02web.zoom.us/j/8681235900",
  paidTrial: "https://buy.stripe.com/eVafZgcyN7CXa8UcQA",
  skoolCommunity: "https://www.skool.com/7figureceolaunch",
  scriptlessSelling: "https://www.skool.com/7figureceolaunch/classroom/c34518a8?md=b31cb68dd3f14c45b1b474c6b4dc2914",
  dmSales: "https://www.skool.com/7figureceolaunch/classroom/4de26752?md=e6e2dfd7ac8a4939aaf30f052785aa0f",
  paidTrialSystem: "https://www.skool.com/7figureceolaunch/classroom/97226e16?md=5983644e14b047df8cfbffa5a58d64ea",
};

const GHL_BOOKING_LINK = "https://api.leadconnectorhq.com/widget/bookings/andrew-kroeze";

// Real client results to weave in as social proof
const TESTIMONIALS = [
  { name: "Kavetha S.", result: "$20K/month to $160K/month in 4 months" },
  { name: "Rae Ireland", result: "$20K/month to $155K/month in 4 months" },
  { name: "Bastiaan Slot", result: "$0 to $100K/month in 90 days with a new offer" },
  { name: "Franco Urbaez", result: "$20K/month to $100K/month in 4 months" },
  { name: "Alok A.", result: "10 years stuck below 7 figures, hit his first 7-figure run-rate month in 2 months" },
  { name: "Kalah Hill", result: "$1K/month to $24K/month in 2 months" },
  { name: "Cole Gordon", result: "$0 to $247K beta launch, now runs a $40M sales agency" },
];

function getCallTiming(callDateStr: string | null | undefined): string {
  if (!callDateStr) return "the other day";
  const callDate = new Date(callDateStr);
  const now = new Date();
  const diffMs = now.getTime() - callDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 3) return "the other day";
  return "recently";
}

async function searchYouTube(query: string): Promise<{ title: string; url: string }[]> {
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~youtube-search-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchQueries: [`${query} site:youtube.com channel:andrewkroeze999`],
          maxResults: 3,
          youtubeChannelId: "andrewkroeze999",
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return [];
    const items: any[] = await res.json();
    return items.slice(0, 2).map((v: any) => ({
      title: v.title ?? v.name ?? "Video",
      url: v.url ?? `https://youtube.com/watch?v=${v.id}`,
    }));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name,
    result,
    call_notes,
    ai_summary,
    follow_up_notes,
    objections,
    objections_notes,
    offer,
    deal_amount,
    showed,
    success,
    call_type,
    call_date,
    fathom_url,
    custom_instructions,
  } = body;

  const firstName = (name as string)?.split(" ")[0] ?? name;
  const outcome = result ?? "📣 Follow Up";
  const isEnrolled = success === true || outcome === "✅ Sale";
  const isNoShow = outcome === "👻 No Show";
  const callTiming = getCallTiming(call_date);

  // Build context block from available call data
  const context = [
    ai_summary && `CALL SUMMARY:\n${ai_summary}`,
    call_notes && `CALL NOTES:\n${call_notes}`,
    follow_up_notes && `FOLLOW-UP NOTES:\n${follow_up_notes}`,
    objections?.length && `OBJECTIONS RAISED:\n${objections.join(", ")}`,
    objections_notes && `OBJECTION HANDLING:\n${objections_notes}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // YouTube search for relevant content
  let ytVideos: { title: string; url: string }[] = [];
  if (!isEnrolled && context && process.env.APIFY_TOKEN) {
    const situation = (ai_summary ?? call_notes ?? "").slice(0, 200);
    ytVideos = await searchYouTube(situation);
  }

  const ytSection =
    ytVideos.length > 0
      ? `\nRELEVANT YOUTUBE VIDEOS (from Andrew's channel — include the most relevant one in the text message):\n${ytVideos.map((v) => `- ${v.title}: ${v.url}`).join("\n")}`
      : "";

  // Pick 2 relevant testimonials to reference
  const proof = TESTIMONIALS.slice(0, 4)
    .map((t) => `- ${t.name}: ${t.result}`)
    .join("\n");

  const fathomLine = fathom_url
    ? `\nFATHOM RECORDING (include in both text and email so they can rewatch): ${fathom_url}`
    : "";

  const linksContext = isEnrolled
    ? `LINKS TO INCLUDE:
- Skool community (their new home): ${LINKS.skoolCommunity}
- Zoom room for group calls: ${LINKS.booking}${fathomLine}`
    : `LINKS TO INCLUDE IN THE TEXT (pick the 1-2 most relevant):
- $47 Paid Trial (best low-friction entry point): ${LINKS.paidTrial}
- Book a call with Andrew: ${GHL_BOOKING_LINK}
- Skool community: ${LINKS.skoolCommunity}
- Scriptless Selling training: ${LINKS.scriptlessSelling}
- DM Sales training: ${LINKS.dmSales}${fathomLine}

ALWAYS include the Fathom recording link (if provided) so they can rewatch the call.`;

  const outcomeInstructions: Record<string, string> = {
    "✅ Sale": `They ENROLLED. Warm, celebratory, personal. Reference what they said they want to achieve. Give them their exact next steps: join Skool, show up to the first call, what to start with. Make them feel amazing. Include Skool link and Zoom room.`,
    "📣 Follow Up": `They were INTERESTED but didn't commit yet. Reference their specific situation and what they said they want. Show proof of what's possible for people like them (use the testimonials). Offer the $47 trial as the lowest-friction next step. Include Fathom link so they can rewatch. Keep it warm, no pressure.`,
    "🔜 Upcoming": `Upcoming call. Warm pre-call message confirming the call and building excitement about what's possible for them specifically.`,
    "❌ Did Not Close": `They said no. Keep the door open, zero pressure. Reference something specific they shared. Offer a free or low-friction resource ($47 trial or YouTube video). Let them know you're here when the timing is right.`,
    "👻 No Show": `They didn't show up. Short, warm, zero judgment. Check if everything is okay. Offer to reschedule with the booking link. Two sentences max for the text.`,
    "🚀 Rebook": `They need to reschedule. Short, direct, easy. One sentence, one booking link.`,
  };

  const instruction =
    outcomeInstructions[outcome] ??
    `Warm, personalized follow-up from Andrew. Reference their situation, share relevant proof, offer a clear next step.`;

  const prompt = `You are writing follow-up messages for Andrew Kroeze, founder of 7-Figure CEO — a coaching program that helps online coaches and consultants scale to 7 figures peacefully and profitably.

PROSPECT: ${name}
OUTCOME: ${outcome}
CALL TYPE: ${call_type ?? "Sales Call"}
OFFER DISCUSSED: ${offer ?? "7-Figure CEO"}
DEAL AMOUNT: ${deal_amount ? `$${deal_amount.toLocaleString()}` : "not specified"}
CALL TIMING: ${callTiming} (use this in the opener — "Nice connecting ${callTiming}" or similar)

${context || "(No call notes — write based on general 7-Figure CEO context and their likely situation as a coach/consultant)"}
${ytSection}

CLIENT RESULTS TO REFERENCE (weave in 1-2 that fit their situation):
${proof}

${linksContext}

OUTCOME CONTEXT: ${instruction}
${custom_instructions ? `\nANDREW'S CUSTOM INSTRUCTIONS (highest priority — follow these exactly):\n${custom_instructions}` : ""}

STRICT WRITING RULES:
- NEVER use em dashes (-- or —). Use commas, periods, "..." for a pause, or rewrite the sentence.
- TEXT MESSAGE voice (Andrew's real texting style): mostly lowercase, capitalize only names or emphasis. No period at the end of the final line. Sparse emoji (💪 🙏 😏 :) at most one, only if it feels genuine). Sounds like a friend texting, never a sales rep. Words like "dope", "for sure", "love it" fit; NEVER "amazing", "definitely", "absolutely", "totally".
- Open with something like "Nice connecting ${callTiming}" or "good talking ${callTiming}" — warm, human.
- TEXT MESSAGE format: Each sentence or thought on its own line with a blank line between them. NOT a wall of text. Max 4-5 short lines. Include 1-2 links at the end on their own lines.
- EMAIL format: Short paragraphs (2-3 sentences each), blank line between each paragraph. Include Fathom link, 1-2 relevant links, and 1-2 client results as proof.
- Andrew's voice: direct, warm, real. Like a text from a mentor who genuinely cares.
- NO corporate jargon. NO hype words like "crush it" or "guaranteed."
- Lead with THEM and their situation, not Andrew's credentials.
- Reference specific details from the call notes when available.

PROMISES EXTRACTION:
From the call notes, extract:
- Any introductions Andrew promised to make (e.g. "I'll intro you to John Smith")
- Any introductions others promised to make to Andrew
- Any specific links, resources, or documents Andrew said he would send them

For promised links, resolve them to actual URLs using the links provided above. If the link was mentioned by name (e.g. "the paid trial", "the Skool community", "the DM sales training"), match it to the correct URL from the links list. If you can't resolve it, include the description with an empty url string.

Make sure every promised link also appears in the text message and email body.

Return ONLY valid JSON (no markdown, no code fences) with exactly these keys:
{
  "key_moments": [
    { "label": "Main Problem", "value": "..." },
    { "label": "Situation", "value": "..." },
    { "label": "Offer Discussed", "value": "..." },
    { "label": "Objection(s)", "value": "..." },
    { "label": "Their Goal", "value": "..." },
    { "label": "Next Step", "value": "..." }
  ],
  "promises": {
    "intros_to_make": ["Andrew will intro them to X"],
    "intros_to_receive": ["Y will intro Andrew to Z"],
    "promised_links": [
      { "label": "Paid Trial", "url": "https://..." },
      { "label": "DM Sales Training", "url": "https://..." }
    ]
  },
  "text": "Line one of text.\\n\\nLine two of text.\\n\\nLink: url",
  "email_subject": "Subject line here",
  "email_body": "Paragraph one.\\n\\nParagraph two.\\n\\nParagraph three with links."
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (response.content.find((b: { type: string }) => b.type === "text") as { text?: string } | undefined)?.text ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: "Failed to parse AI response", raw: raw.slice(0, 400) }, { status: 500 });
    }

    const parsed = JSON.parse(match[0]);
    return NextResponse.json({
      ...parsed,
      firstName,
      outcome,
      isEnrolled,
      isNoShow,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
