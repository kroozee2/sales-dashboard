import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
    process.env.SUPABASE_CALLS_SERVICE_KEY!
  );
}

const FRAMEWORK_PROMPT = `You are an elite offer messaging expert trained in four frameworks:

1. ALEX HORMOZI ($100M Offers): Value = (Dream Outcome × Perceived Likelihood) / (Time Delay × Effort & Sacrifice).
   The goal is to maximize dream outcome and certainty while minimizing time and effort.
   Lead with massive specificity — exact numbers, exact timeframes.

2. RUSSELL BRUNSON (Expert Secrets): The "Perfect Webinar" breaks 3 false beliefs:
   - Vehicle belief: "This type of offer/method won't work"
   - Internal belief: "I'm not capable / I don't have what it takes"
   - External belief: "External forces will stop me (market, niche, competition)"
   Each hook should shatter one false belief and install the new empowering one.

3. SAM OVENS: Start with the avatar's "Day in Diary" — paint their painful current reality hour by hour.
   Create a gap between where they are (current painful state) and where they want to be (desired future state).
   Make the problem viscerally real before presenting any solution.

4. ANDREW KROEZE (7-Figure CEO):
   - PSPS format: Problem → Solution → Problem → Solution
   - The 5 Stages: Freelancer ($10K) → Specialist ($30K) → Builder ($80K) → Systemizer ($150K) → CEO ($300K)
   - Tribe of Buyers Formula: Offer Ecosystem + Brand Omni-Presence + Scriptless Selling + Aligned Leverage
   - Identity language: "Heart-centered", "A-Players", "peaceful + purposeful + wildly profitable"
   - Never use: guru, hustle, grind, crush it, overnight, guaranteed
   - No em dashes. Short paragraphs (2-3 sentences max).`;

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    offer_id: string;
    brain_dump?: string;
    section?: 'avatar' | 'pain' | 'fear' | 'desire' | 'promise' | 'hooks' | 'objections' | 'dm_copy' | 'ad_copy' | 'launch_post' | 'all';
  };

  const { offer_id, brain_dump = '', section = 'all' } = body;

  if (!offer_id) {
    return NextResponse.json({ error: 'offer_id is required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: offer, error: fetchErr } = await supabase
    .from('offers')
    .select('*')
    .eq('id', offer_id)
    .single();

  if (fetchErr || !offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
  }

  const offerContext = `
Offer: ${offer.name ?? 'Unknown'}
Type: ${offer.offer_type ?? 'Unknown'}
Price: ${offer.pif_price ? `$${offer.pif_price} PIF` : ''} ${offer.pp_down ? `/ $${offer.pp_down}/month` : ''}
Who it's for: ${offer.who_its_for ?? 'Unknown'}
Promise: ${offer.promise ?? 'Unknown'}
Pain points: ${offer.pain_points ?? 'Unknown'}
Current DM copy: ${offer.dm_copy ?? 'None'}
Current Ad copy: ${offer.ad_copy ?? 'None'}
${brain_dump ? `\nAdditional brain dump:\n${brain_dump}` : ''}`;

  const sectionPrompts: Record<string, string> = {
    avatar: `Using Sam Ovens' Day-in-Diary technique, write a vivid 3-5 sentence description of who this offer is for. Walk through their actual morning: what they feel when they wake up, the frustration they carry, the gap between where they are and where they want to be. Be hyper-specific. Write in second-person ("You wake up...").`,

    pain: `Describe the core PROBLEM/PAIN this offer solves. Use Brunson's false belief framework — what wrong vehicle belief, internal belief, or external belief is keeping them stuck? 3-5 sentences. Be visceral and specific, not abstract.`,

    fear: `List 4-6 of their deepest FEARS — what they're afraid will happen if they do nothing, and what they're afraid of about taking action (the investment, the risk, the change). Format as a simple list, one fear per line. Make them emotionally resonant, not logical.`,

    desire: `Describe their CORE DESIRES in 2 layers:
1. Surface want: what they say they want (more clients, more revenue)
2. Deep desire: what they really want underneath (freedom, respect, identity shift, peaceful business)
Apply Hormozi's dream outcome formula — be specific about the outcome, timeframe, and certainty. 4-6 sentences.`,

    promise: `Write the CORE PROMISE / transformation statement. This is the "from X to Y in Z time" statement. Make it specific, credible, and emotionally resonant. Include the dream outcome and timeframe. 2-3 powerful sentences.`,

    hooks: `Write 4 distinct HOOK angles for this offer, each targeting a different false belief (Brunson framework):
1. Vehicle hook — challenges "this method won't work"
2. Internal hook — challenges "I'm not capable of this"
3. External hook — challenges "the market/circumstances won't let me"
4. Identity hook — speaks to who they're becoming
Each hook is 1-2 sentences. No em dashes. Sound human.`,

    objections: `List the top 5 OBJECTIONS prospects will have, then write a 1-2 sentence reframe for each using proof, logic, or a belief-shifting question. Format: Objection → Reframe.`,

    dm_copy: `Write a ready-to-send DM to a warm prospect for this offer. Requirements:
- No em dashes, no hype words
- Hook their identity in sentence 1
- Plant a belief or curiosity in sentence 2
- Soft CTA or question in sentence 3
- 2-4 sentences max, human and conversational
- Do not pitch directly`,

    ad_copy: `Write a Facebook/Instagram ad for this offer:
- Line 1: Punchy hook (challenge a belief or name the pain)
- Lines 2-4: Body (specific, proof-driven, speaks to the dream outcome)
- Line 5: Soft CTA
No hype words. No em dashes. Sound like a human who's been there.`,

    launch_post: `Write a Facebook/Instagram launch post announcing this offer:
- Open with a story or bold statement (2-3 sentences)
- Describe who it's for and the transformation (3-4 sentences)
- Social proof or credibility (1-2 sentences)
- What's included / what they get (3-5 bullet points)
- Clear CTA with urgency
No em dashes. Short paragraphs. Andrew Kroeze's voice: direct, warm, confident.`,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY!;

  type MessagingResult = {
    avatar?: string;
    pain?: string;
    fear?: string;
    desire?: string;
    promise?: string;
    hooks?: string;
    objections?: string;
    dm_copy?: string;
    ad_copy?: string;
    launch_post?: string;
  };

  const result: MessagingResult = {};

  if (section === 'all') {
    const sections = ['avatar', 'pain', 'fear', 'desire', 'promise', 'hooks', 'objections', 'dm_copy', 'ad_copy', 'launch_post'] as const;

    const prompt = `${FRAMEWORK_PROMPT}

Offer context:
${offerContext}

Generate ALL messaging sections for this offer. Respond ONLY in this exact JSON format with no markdown:
{
  "avatar": "...",
  "pain": "...",
  "fear": "...",
  "desire": "...",
  "promise": "...",
  "hooks": "...",
  "objections": "...",
  "dm_copy": "...",
  "ad_copy": "...",
  "launch_post": "..."
}

For each field, follow these guidelines:
- avatar: ${sectionPrompts.avatar}
- pain: ${sectionPrompts.pain}
- fear: ${sectionPrompts.fear} (newline-separated list)
- desire: ${sectionPrompts.desire}
- promise: ${sectionPrompts.promise}
- hooks: ${sectionPrompts.hooks} (format: 1. ... 2. ... 3. ... 4. ...)
- objections: ${sectionPrompts.objections} (format: "Objection → Reframe" per line)
- dm_copy: ${sectionPrompts.dm_copy}
- ad_copy: ${sectionPrompts.ad_copy}
- launch_post: ${sectionPrompts.launch_post}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(jsonText) as MessagingResult;
    Object.assign(result, parsed);

    // Ensure all expected keys
    for (const s of sections) {
      if (!(s in result)) (result as Record<string, string>)[s] = '';
    }
  } else {
    const singlePrompt = sectionPrompts[section];
    if (!singlePrompt) {
      return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 });
    }

    const prompt = `${FRAMEWORK_PROMPT}

Offer context:
${offerContext}

Task: ${singlePrompt}

Respond with ONLY the text content for this section — no labels, no JSON wrapper, no markdown.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    (result as Record<string, string>)[section] = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  }

  // Save to Supabase
  const supabaseUpdates: Record<string, unknown> = { synced_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(result)) {
    if (v) supabaseUpdates[k] = v;
  }
  await supabase.from('offers').update(supabaseUpdates).eq('id', offer_id);

  // Mirror to Airtable
  const pat = process.env.AIRTABLE_PAT;
  const base = process.env.AIRTABLE_SCALE_OS_BASE ?? 'appPqR5QXRBoqTZCX';
  if (pat && offer.airtable_id) {
    const airtableFieldMap: Record<string, string> = {
      avatar:      'fldEvMnxkun0gxl7R',
      pain:        'fldwZlP6m9jFv0O7D',
      fear:        'fldBKBELkoT0xoJ9S',
      desire:      'fldCEChtWCiwdtyUp',
      promise:     'fldqSTacpzgHONlUV',
      dm_copy:     'fldN2iS8WA5Y26H3U',
      launch_post: 'fldaHW3hCLE3UwSji',
    };
    const fields: Record<string, unknown> = {};
    for (const [key, fieldId] of Object.entries(airtableFieldMap)) {
      const val = (result as Record<string, string>)[key];
      if (val) fields[fieldId] = val;
    }
    if (Object.keys(fields).length > 0) {
      await fetch(`https://api.airtable.com/v0/${base}/tblxm4EJxWNzOkm2t/${offer.airtable_id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, returnFieldsByFieldId: true }),
      }).catch(() => null);
    }
  }

  return NextResponse.json({ ...result, offer_id });
}
