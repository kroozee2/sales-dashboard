import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type WizardAnswers = {
  who?: string;        // who it's for + current situation
  problem?: string;    // core problem / pain
  outcome?: string;    // transformation / promise
  included?: string;   // format, deliverables, length
  price?: string;      // pricing thoughts
  proof?: string;      // results / testimonials available
  extra?: string;      // anything else
};

export async function POST(req: NextRequest) {
  const body = await req.json() as { brain_dump?: string; answers?: WizardAnswers };
  const { brain_dump = '', answers } = body;

  const context = answers
    ? [
        answers.who && `WHO IT'S FOR: ${answers.who}`,
        answers.problem && `CORE PROBLEM THEY HAVE: ${answers.problem}`,
        answers.outcome && `TRANSFORMATION / RESULT: ${answers.outcome}`,
        answers.included && `WHAT'S INCLUDED / FORMAT: ${answers.included}`,
        answers.price && `PRICING THOUGHTS: ${answers.price}`,
        answers.proof && `PROOF / RESULTS WE HAVE: ${answers.proof}`,
        answers.extra && `EXTRA CONTEXT: ${answers.extra}`,
      ].filter(Boolean).join('\n\n')
    : brain_dump;

  if (!context.trim()) {
    return NextResponse.json({ error: 'Offer details required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const prompt = `You are an elite offer designer for Andrew Kroeze at 7-Figure CEO — a top coaching and consulting growth program for online coaches and consultants.

Andrew's business context:
- LAUNCH: $9,800 PIF or $1,000/month — for coaches at $5K–$20K/month wanting $30K+/month
- BOARDROOM: $19,800 PIF, 6 months — for coaches at $20K–$84K/month wanting $100K+/month
- Low-ticket ladder: $47 7-day paid trial, $97 paid workshop, $497–$997 course, $350/week sticky payment
- Core framework: Tribe of Buyers Formula — Offer Ecosystem + Brand Omni-Presence + Conversion Content + Scriptless Selling + Aligned Leverage
- DM sales system: permission-based 3-step call transition (Ask Permission → No-Brainer Opportunity → Make the NO a YES)

BRAND VOICE RULES (non-negotiable):
- Direct, warm, deeply human. Expert without academic. Confident without arrogant.
- NO em dashes anywhere. Use commas, periods, or restructure.
- NEVER use: guru, hustle, grind, crush it, kill it, guaranteed, magic bullet, overnight
- Lead with the client's problem or identity, not credentials
- Specific numbers and real outcomes over vague claims
- Short sentences. One question mark max per message.

New offer details:
${context}

Fill out a complete offer profile optimized to CONVERT in DMs and on sales calls. Respond ONLY in this exact JSON format with no markdown:
{
  "name": "offer name (clear, benefit-driven)",
  "offer_type": "one of: 🎖️ High Ticket Offer | 🧲 Low Ticket Offer | 🖥️ Course Offer | 👨‍👨‍👦‍👦 Event - In Person | 💻 Event - Online | 💪 Done For You",
  "selling": "✅ Yes",
  "status": "🎁 Creating Messaging",
  "pif_price": 0,
  "pp_down": 0,
  "pp_price": 0,
  "who_its_for": "2-3 sentences: exact avatar, their current situation, their pain",
  "promise": "the core transformation/result they get — specific outcome in a timeframe",
  "pain_points": ["pain 1", "pain 2", "pain 3"],
  "dm_copy": "Ready-to-send DM to a warm prospect. Sound human, not marketer. Hook their identity. 2-4 sentences max.",
  "ad_copy": "Hook line + 3-sentence body for a Facebook/Instagram ad. Specific, proof-driven, no hype words.",
  "setting_scripts": {
    "opener": "First DM to spark the conversation about this offer. Curiosity, not pitch. 1-2 sentences.",
    "permission_ask": "The permission ask, personalized to this offer. Pattern: 'I have a recommendation, if you're open to it?'",
    "no_brainer_pitch": "The no-brainer opportunity pitch for THIS offer. Frame around the value THEY get. Include the 'regardless of whether we ever work together' safety frame. 2-3 sentences.",
    "make_no_a_yes": "The disqualifier closer. Pattern: 'If that doesn't sound ridiculous to you?'",
    "objection_price": "Response when they say it's too expensive. Reframe around cost of staying stuck. 2-3 sentences.",
    "objection_time": "Response when they say not right now / too busy. 2-3 sentences.",
    "objection_think": "Response when they say they need to think about it. 2-3 sentences.",
    "followup_ghost": "Re-engagement message when they go quiet after showing interest. 1-2 sentences."
  },
  "links_needed": ["Payment Link (Stripe)", "Offer 1-Sheeter (Google Doc)", "Sales Page", "Onboarding Form"],
  "recommended_price_reasoning": "1-2 sentences on why the prices above make sense for this audience"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(await res.text());

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text?: string }) => b.text ?? '').join('').trim();
    const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    // Create in Airtable
    const pat = process.env.AIRTABLE_PAT!;
    const base = process.env.AIRTABLE_SCALE_OS_BASE ?? 'appPqR5QXRBoqTZCX';
    const table = 'tblxm4EJxWNzOkm2t';

    const airtableFields: Record<string, unknown> = {
      'fldCnQ8UoIBHzXi6q': parsed.name,
      'fldcsjoiAmzvnh0Nt': parsed.offer_type,
      'fldP3JdoErJOb2gmD': parsed.selling,
      'flduItUakEuqPgzHu': parsed.status,
    };
    if (parsed.pif_price) airtableFields['fldk9ueE6q2xQW52a'] = parsed.pif_price;
    if (parsed.pp_down) airtableFields['fldR1xHWRmMXdJibz'] = parsed.pp_down;
    if (parsed.pp_price) airtableFields['fldaDQs6X4UBplIsn'] = parsed.pp_price;

    const atRes = await fetch(`https://api.airtable.com/v0/${base}/${table}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: airtableFields, returnFieldsByFieldId: true }),
    });

    let airtableId: string | null = null;
    if (atRes.ok) {
      const atData = await atRes.json() as { id: string };
      airtableId = atData.id;
    }

    // Upsert to Supabase
    if (airtableId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
        process.env.SUPABASE_CALLS_SERVICE_KEY!
      );
      await supabase.from('offers').upsert({
        id: airtableId,
        airtable_id: airtableId,
        name: parsed.name as string,
        offer_type: parsed.offer_type as string,
        selling: parsed.selling as string,
        status: parsed.status as string,
        pif_price: parsed.pif_price as number || null,
        pp_down: parsed.pp_down as number || null,
        pp_price: parsed.pp_price as number || null,
        who_its_for: parsed.who_its_for as string,
        promise: parsed.promise as string,
        pain_points: Array.isArray(parsed.pain_points) ? (parsed.pain_points as string[]).join('\n') : null,
        dm_copy: parsed.dm_copy as string,
        ad_copy: parsed.ad_copy as string,
        setting_scripts: parsed.setting_scripts ?? null,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }

    return NextResponse.json({ ...parsed, airtable_id: airtableId });
  } catch (err) {
    console.error('Generate offer error:', err);
    return NextResponse.json({ error: 'Failed to generate offer' }, { status: 500 });
  }
}
