import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { getSetting } from "@/lib/settings";

const COACH_SYSTEM = `You are Andrew Kroeze's world-class sales coach. Andrew runs 7-Figure CEO, a coaching program for online business owners scaling to $100K+/month.

His sales methodology is called Scriptless Selling — frameworks over scripts. The goal is to unlock 7 buying beliefs so prospects naturally choose to enroll.

The 9 call sections are: Rapport, North Star, Current Situation, Challenges, Urgency, Why, Pitch, Close, Tie Down.

**Scoring rubric (1–10):**
- 10: Textbook execution — deep emotional connection, prospect selling themselves
- 7–9: Strong — minor refinements only
- 5–6: Adequate — missed key moments or moved too fast
- 3–4: Weak — section rushed, critical questions skipped
- 1–2: Missing or ineffective — section barely happened

**What makes a great score in each section:**
- Rapport: Genuine connection established, prospect is relaxed and open, Andrew found something personal to reference later
- North Star: Specific outcome uncovered ($X/month, by when, what it means), prospect emotionally connected to the goal
- Current Situation: Full picture of revenue, team, model, what they've tried — no assumptions
- Challenges: Root cause identified (not just surface problems), prospect feels deeply understood
- Urgency: External deadline or cost-of-inaction made visceral and real, prospect articulates the urgency themselves
- Why: Deep emotional driver surfaced (family, legacy, freedom), prospect got emotional or vulnerable
- Pitch: Offer positioned as the ONLY logical solution to their specific pain; story of a similar client used
- Close: Price presented confidently without apology, objections welcomed and handled with curiosity not pushback
- Tie Down: Prospect selling themselves on the outcome, not Andrew selling them

**Output format (strict JSON):**
{
  "overall_score": <1-10>,
  "overall_summary": "<2-3 sentence honest assessment of the call>",
  "key_wins": ["<specific win>", "<specific win>"],
  "key_improvements": ["<specific improvement>", "<specific improvement>"],
  "section_scores": [
    {
      "section_id": "<uuid>",
      "title": "<section title>",
      "score": <1-10>,
      "went_well": "<1-2 sentences — be specific, cite what was said or done>",
      "improve": "<1-2 sentences — be direct and specific>",
      "suggested_language": "<exact words Andrew could use next time — keep it natural, not scripty>"
    }
  ]
}`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createLeadsAdminClient();
  const { data } = await supabase.from("call_coaching_reports").select("*").eq("call_id", id).single();
  return NextResponse.json({ report: data ?? null });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createLeadsAdminClient();

  // Load call data
  const { data: call } = await supabase.from("sales_calls").select("*").eq("id", id).single();
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  // Load script sections
  const { data: sections } = await supabase
    .from("script_sections")
    .select("*")
    .order("order_index", { ascending: true });

  // Load section notes
  const { data: notes } = await supabase
    .from("call_section_notes")
    .select("*")
    .eq("call_id", id);

  const noteMap: Record<string, { notes?: string; fathom_excerpt?: string }> = {};
  for (const n of notes ?? []) noteMap[n.section_id] = n;

  // Build context
  const callContext = [
    `Prospect: ${call.name}`,
    call.call_date ? `Date: ${new Date(call.call_date).toLocaleDateString()}` : "",
    call.result ? `Result: ${call.result}` : "",
    call.offer ? `Offer made: ${call.offer}` : "",
    call.deal_amount ? `Deal amount: $${call.deal_amount.toLocaleString()}` : "",
    call.call_notes ? `General call notes: ${call.call_notes}` : "",
    call.ai_summary ? `AI summary: ${call.ai_summary}` : "",
    call.objections?.length ? `Objections: ${call.objections.join(", ")}` : "",
    call.objections_notes ? `Objection handling: ${call.objections_notes}` : "",
  ].filter(Boolean).join("\n");

  const sectionsContext = (sections ?? []).map((s) => {
    const note = noteMap[s.id];
    return [
      `--- SECTION: ${s.emoji} ${s.title} (id: ${s.id}) ---`,
      note?.fathom_excerpt ? `Transcript excerpt: ${note.fathom_excerpt}` : "",
      note?.notes ? `Call notes: ${note.notes}` : "(no notes captured for this section)",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const userPrompt = `Analyze this sales call and provide coaching feedback.\n\n## Call Details\n${callContext}\n\n## Script Section Notes\n${sectionsContext}\n\nReturn ONLY the JSON object, no other text.`;

  const apiKey = await getSetting("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY");
  if (!apiKey) return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 400 });

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    system: COACH_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content.find((b) => b.type === "text")?.text ?? "";
  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? raw);
  } catch {
    return NextResponse.json({ error: "Failed to parse coaching response", raw }, { status: 500 });
  }

  // Save report
  const { data: report, error } = await supabase
    .from("call_coaching_reports")
    .upsert(
      {
        call_id: id,
        overall_score: parsed.overall_score,
        section_scores: parsed.section_scores,
        key_wins: parsed.key_wins,
        key_improvements: parsed.key_improvements,
        overall_summary: parsed.overall_summary,
        created_at: new Date().toISOString(),
      },
      { onConflict: "call_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report });
}
