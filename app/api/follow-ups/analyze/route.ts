import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { fathomRecordingId, parseCallIntel, type IntelSource, type SalesCallRow } from "@/lib/follow-ups";
import { fetchRecentMeetings, matchMeeting, summaryText, toLite, transcriptText } from "@/lib/fathom-transcript";

const MODEL = "claude-sonnet-5";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!, process.env.SUPABASE_CALLS_SERVICE_KEY!);
}

const PROMPT_RULES = `You are reading one sales call for Andrew Kroeze's coaching business (7-Figure CEO), which sells BOARDROOM ($15,000) and LAUNCH ($9,000 or $1,000/month) to coaches and consultants.

Pull out only what the PROSPECT actually said or clearly implied. This readout is used to write them a follow-up, so a wrong detail is worse than a missing one.

Rules:
- Never invent a number, a timeline, or a business detail that is not in the source.
- Quote their own phrasing in "in_their_words" — short, verbatim fragments only.
- If the source does not cover a section, return an empty array for it.
- Write each item as a short, specific phrase, not a sentence of analysis.

Return ONLY valid JSON with exactly these keys:
{
  "pains": ["what is hurting them right now"],
  "goals": ["what they said they want to reach"],
  "challenges": ["what is standing in the way"],
  "wants": ["what they wanted from Andrew or the program"],
  "objections": ["why they did not buy on the call"],
  "in_their_words": ["short verbatim quotes"]
}`;

export async function POST(req: NextRequest) {
  let body: { call_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const callId = typeof body.call_id === "string" ? body.call_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(callId)) {
    return NextResponse.json({ error: "call_id is required" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Analysis is unavailable: ANTHROPIC_API_KEY is not configured." }, { status: 503 });
  }

  const client = db();
  const { data: call, error } = await client
    .from("sales_calls")
    .select("id, name, email, call_date, call_type, result, offer, objections, objections_notes, call_notes, ai_summary, recording_url, fathom_call_id, showed, success, offer_made, deal_amount, prospect_quality, follow_up_status, follow_up_date, follow_up_notes, phone, ghl_url")
    .eq("id", callId)
    .maybeSingle();
  if (error) {
    console.error("[follow-ups] analyze read failed", { code: typeof error.code === "string" ? error.code.slice(0, 32) : "unknown" });
    return NextResponse.json({ error: "Follow-ups are temporarily unavailable" }, { status: 500 });
  }
  if (!call) return NextResponse.json({ error: "That call no longer exists." }, { status: 404 });

  const row = call as unknown as SalesCallRow;

  // Prefer a real recording. Fall back to typed notes, and say which it was.
  // This starts at "none" deliberately: claiming "recording" because a link
  // exists would label a guess from notes as if it came from the transcript.
  let source: IntelSource = "none";
  let transcript = "";
  let summary = "";
  let matchedRecording: { recording_id: number; share_url: string | null } | null = null;

  const fathomKey = process.env.FATHOM_API_KEY;
  if (fathomKey) {
    try {
      const meetings = await fetchRecentMeetings(fathomKey);
      const linkedId = fathomRecordingId(row);
      const byId = linkedId ? meetings.find((m) => Number(m.recording_id) === linkedId) : undefined;
      const found = byId ?? (() => {
        const match = matchMeeting({ name: row.name, email: row.email, call_date: row.call_date }, meetings.map(toLite));
        return match ? meetings.find((m) => Number(m.recording_id) === match.recording_id) : undefined;
      })();
      if (found) {
        transcript = transcriptText(found);
        summary = summaryText(found);
        if (transcript || summary) {
          source = "recording";
          matchedRecording = { recording_id: Number(found.recording_id), share_url: typeof found.share_url === "string" ? found.share_url : null };
        }
      }
    } catch (caught) {
      console.error("[follow-ups] Fathom lookup failed", { message: caught instanceof Error ? caught.name : "unknown" });
    }
  }

  const notes = [row.ai_summary, row.call_notes, row.objections_notes, row.follow_up_notes].filter(Boolean).join("\n\n");
  if (source !== "recording") {
    if (!notes.trim()) {
      return NextResponse.json({
        error: "There is nothing to read for this call yet — no recording we can reach, and no notes.",
        available_source: "none",
      }, { status: 422 });
    }
    source = "notes";
  }

  const sourceBlock = source === "recording"
    ? `RECORDING SUMMARY:\n${summary || "(none)"}\n\nTRANSCRIPT:\n${transcript.slice(0, 12_000) || "(none)"}`
    : `TYPED CALL NOTES (no transcript available — do not infer beyond these):\n${notes.slice(0, 8_000)}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let raw = "";
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1600,
      messages: [{
        role: "user",
        content: `${PROMPT_RULES}\n\nPROSPECT: ${row.name ?? "unknown"}\nCALL DATE: ${row.call_date ?? "unknown"}\nOFFER DISCUSSED: ${row.offer ?? "unknown"}\nRECORDED OUTCOME: ${row.result ?? "not recorded"}\n\n${sourceBlock}`,
      }],
    });
    raw = (response.content.find((block) => block.type === "text") as { text?: string } | undefined)?.text ?? "";
  } catch (caught) {
    console.error("[follow-ups] model call failed", { message: caught instanceof Error ? caught.name : "unknown" });
    return NextResponse.json({ error: "The analysis could not be completed. Try again in a moment." }, { status: 502 });
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "The analysis came back unreadable. Try again." }, { status: 502 });

  let intel;
  try {
    intel = parseCallIntel(JSON.parse(match[0]), source);
  } catch (caught) {
    console.error("[follow-ups] intel failed validation", { message: caught instanceof Error ? caught.message.slice(0, 120) : "unknown" });
    return NextResponse.json({ error: "The analysis came back in an unexpected shape. Try again." }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { error: writeError } = await client.from("sales_call_intel").upsert({
    call_id: callId,
    intel,
    source,
    model: MODEL,
    transcript_chars: transcript.length,
    generated_at: now,
    updated_at: now,
  }, { onConflict: "call_id" });
  if (writeError) {
    console.error("[follow-ups] intel write failed", { code: typeof writeError.code === "string" ? writeError.code.slice(0, 32) : "unknown" });
    return NextResponse.json({ error: "The readout could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ call_id: callId, intel, source, generated_at: now, matched_recording: matchedRecording });
}
