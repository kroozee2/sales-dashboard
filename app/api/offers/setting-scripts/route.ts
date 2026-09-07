import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY!
);

// Generate the SOP-aligned setting scripts for an existing offer
export async function POST(req: NextRequest) {
  const { offer_id } = await req.json() as { offer_id: string };
  if (!offer_id) return NextResponse.json({ error: 'offer_id required' }, { status: 400 });

  const { data: offer } = await db().from('offers').select('*').eq('id', offer_id).single();
  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 });

  const prompt = `You are the top DM sales scriptwriter for Andrew Kroeze at 7-Figure CEO. Write the complete DM setting script pack for this offer, following Andrew's permission-based Scriptless Selling system.

THE OFFER:
Name: ${offer.name}
Type: ${offer.offer_type ?? ''}
Price: ${offer.pif_price ? `$${offer.pif_price} PIF` : ''} ${offer.pp_down ? `or $${offer.pp_down} down` : ''}
Who it's for: ${offer.who_its_for ?? offer.avatar ?? ''}
Promise: ${offer.promise ?? ''}
Pain points: ${offer.pain_points ?? offer.pain ?? ''}
Desires: ${offer.desire ?? ''}
Objections: ${offer.objections ?? ''}

BRAND VOICE RULES (non-negotiable):
- Direct, warm, deeply human. No marketer-speak.
- NO em dashes anywhere. Use commas, periods, or restructure.
- NEVER use: guru, hustle, grind, crush it, guaranteed, magic bullet, overnight
- Short sentences. One question mark max per message.
- Sound like a friend texting, not a sales rep.

THE 3-STEP TRANSITION SYSTEM (follow exactly):
Step 1 (Ask Permission): "I have a recommendation, if you're open to it?" — then STOP.
Step 2 (No-Brainer Opportunity): Frame around value THEY get. Include "regardless of whether we ever work together" safety frame.
Step 3 (Make the NO a YES): End with a disqualifier like "If that doesn't sound ridiculous to you?"

Respond ONLY in this exact JSON, no markdown:
{
  "opener": "First DM to spark conversation about this offer. Curiosity, not pitch. 1-2 sentences.",
  "permission_ask": "The permission ask, tuned to this offer.",
  "no_brainer_pitch": "The no-brainer pitch for THIS offer. 2-3 sentences.",
  "make_no_a_yes": "The disqualifier closer.",
  "objection_price": "Reply when it's too expensive. Reframe cost of staying stuck. 2-3 sentences.",
  "objection_time": "Reply when not right now / too busy. 2-3 sentences.",
  "objection_think": "Reply when they need to think about it. 2-3 sentences.",
  "followup_ghost": "Re-engagement when they go quiet after interest. 1-2 sentences."
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text?: string }) => b.text ?? '').join('').trim();
    const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const scripts = JSON.parse(jsonText) as Record<string, string>;

    await db().from('offers').update({ setting_scripts: scripts }).eq('id', offer_id);

    return NextResponse.json({ setting_scripts: scripts });
  } catch (err) {
    console.error('Setting scripts error:', err);
    return NextResponse.json({ error: 'Failed to generate scripts' }, { status: 500 });
  }
}
