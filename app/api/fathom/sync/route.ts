import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const FATHOM_BASE = "https://api.fathom.ai/external/v1";

const OBJECTION_OPTIONS = [
  "💰 Price / Can't Afford It",
  "⏰ Timing / Not Right Now",
  "🤔 Need to Think About It",
  "👫 Need to Talk to Spouse/Partner",
  "❓ Not Sure It Will Work For Me",
  "🏆 Already Working With Someone Else",
  "🔍 Need More Information",
  "⚡ Too Busy Right Now",
];

const RESULT_OPTIONS = [
  "✅ Sale",
  "📣 Follow Up",
  "🔜 Upcoming",
  "❌ Did Not Close",
  "👻 No Show",
];

async function findMeetingInList(
  key: string,
  recording_id: number
): Promise<{ summary: string; transcript: string } | null> {
  const headers = { "X-Api-Key": key, "Content-Type": "application/json" };
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 10) {
    const url = new URL(`${FATHOM_BASE}/meetings`);
    url.searchParams.set("per_page", "50");
    url.searchParams.set("include_summary", "true");
    url.searchParams.set("include_transcript", "true");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) break;

    const data = await res.json();
    const items: any[] = data.items ?? [];

    const match = items.find((m: any) => m.recording_id === recording_id);
    if (match) {
      // Extract transcript lines
      const lines: any[] = Array.isArray(match.transcript) ? match.transcript : [];
      const transcript = lines
        .map((t: any) => `${t.speaker?.display_name ?? t.speaker ?? "Speaker"}: ${t.text ?? ""}`)
        .join("\n")
        .slice(0, 16000);

      // Extract summary — Fathom returns an object with markdown_formatted
      const rawSummary = match.default_summary;
      let summary = "";
      if (rawSummary) {
        if (typeof rawSummary === "string") {
          summary = rawSummary;
        } else if (rawSummary.markdown_formatted) {
          summary = rawSummary.markdown_formatted;
        } else {
          summary = JSON.stringify(rawSummary);
        }
      }

      return { summary, transcript };
    }

    cursor = data.next_cursor ?? null;
    if (!cursor) break;
    pages++;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const key = process.env.FATHOM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "FATHOM_API_KEY not configured" }, { status: 500 });
  }

  const { recording_id, title, date, share_url } = await req.json();

  if (!recording_id) {
    return NextResponse.json({ error: "recording_id is required" }, { status: 400 });
  }

  const found = await findMeetingInList(key, recording_id);

  if (!found || (!found.transcript && !found.summary)) {
    return NextResponse.json(
      {
        error: `No data found for recording ${recording_id}. Fathom may still be processing — try again in a minute.`,
      },
      { status: 202 }
    );
  }

  const { transcript, summary } = found;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are analyzing a sales call for Andrew Kroeze's coaching business (7-Figure CEO).
Programs: BOARDROOM ($15,000 PIF or split pay) and LAUNCH ($9,000 PIF or $1,000/month).
Renewals are often $2,500–$5,000.

TITLE: ${title ?? "Sales Call"}
DATE: ${date ?? "unknown"}

FATHOM SUMMARY (use this — it is accurate and detailed):
${summary || "(not available)"}

TRANSCRIPT EXCERPT:
${transcript ? transcript.slice(0, 8000) : "(not available)"}

Extract the following as JSON. Be decisive — use the summary above, it has full deal details.

Result options: ${RESULT_OPTIONS.join(", ")}
Objection options: ${OBJECTION_OPTIONS.join(", ")}

Return ONLY valid JSON with exactly these keys:
{
  "result": "<best matching result option, or null>",
  "showed": <true or false>,
  "offer_made": <true or false>,
  "offer": "<program name or null>",
  "success": <true or false — did they pay/enroll/renew?>,
  "deal_amount": <total deal value as a number, or null>,
  "cc_upfront": <first/upfront payment as a number, or null>,
  "monthly_revenue": <monthly recurring as a number, or null>,
  "enrollment_date": "<YYYY-MM-DD or null>",
  "follow_up_date": "<YYYY-MM-DD for next payment or call, or null>",
  "objections": [<array of matching objection strings>],
  "objections_notes": "<how objections were handled, 1-2 sentences>",
  "call_notes": "<3-4 sentences: who they are, situation, what was discussed, outcome>",
  "follow_up_notes": "<next steps, payment schedule, what to say or do next>",
  "ai_summary": "<3-5 comprehensive sentences summarizing the entire call>"
}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1400,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = (response.content.find((b: { type: string }) => b.type === "text") as { text?: string } | undefined)?.text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to parse AI response", raw: rawText.slice(0, 200) }, { status: 500 });
  }

  return NextResponse.json({
    extracted: JSON.parse(jsonMatch[0]),
    meeting: { recording_id, title, share_url, recording_start_time: date },
  });
}
