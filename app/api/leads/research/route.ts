import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    name?: string;
    email?: string;
    quality?: string;
    revenue_level?: string;
    social_url?: string;
    instagram_url?: string;
    linkedin_url?: string;
    facebook_url?: string;
    notes?: string;
    source?: string;
  };

  const {
    name = '',
    email = '',
    quality = '',
    revenue_level = '',
    social_url = '',
    instagram_url = '',
    linkedin_url = '',
    facebook_url = '',
    notes = '',
    source = '',
  } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const tempMap: Record<string, string> = {
    '🔥 Very High': 'hot',
    '🏝️ Event Lead': 'hot',
    '⭐️ High': 'warm',
    '👌 Medium': 'warm',
    '🤏 Low': 'cold',
    '❌ Very Low': 'cold',
  };
  const temperature = tempMap[quality] ?? 'cold';

  const socialLinks = [
    social_url && `Primary social: ${social_url}`,
    facebook_url && `Facebook: ${facebook_url}`,
    instagram_url && `Instagram: ${instagram_url}`,
    linkedin_url && `LinkedIn: ${linkedin_url}`,
  ].filter(Boolean).join('\n') || 'No social links provided';

  const prompt = `You are an elite DM setter working for Andrew Kroeze at 7-Figure CEO — a top coaching and consulting growth program. Your job is to prospect and qualify leads for Andrew's flagship offers.

## ANDREW'S OFFERS

**7-Figure CEO LAUNCH** ($9,000 PIF or $1,000/month x 12)
- Who: Coaches, consultants, service providers at $5K-$20K/month wanting $30K+/month consistently
- Promise: Tribe of Buyers + offer ecosystem + lean team = consistent $20K/month
- Pain solved: No consistent leads, unclear offer, no system, doing everything alone

**7-Figure CEO BOARDROOM** ($15,000-$20,000 PIF, 6 months)
- Who: Coaches/agency owners at $20K-$84K/month hitting a ceiling
- Promise: Lean 7-figure team + streamlined content + offer ecosystem = $100K+/month
- Pain solved: Revenue rollercoaster, team chaos, complexity creep, entrepreneur isolation

## LEAD PROFILE
- Name: ${name || 'Unknown'}
- Email: ${email || 'unknown'}
- Revenue Level: ${revenue_level || 'unknown'}
- Lead Quality: ${quality || 'unknown'} (Temperature: ${temperature})
- Source: ${source || 'unknown'}
- CRM Notes: ${notes || 'none'}
- Social Profiles:
${socialLinks}

## YOUR TASK

Deeply analyze this prospect. Research everything about them from the social links provided. Then craft the perfect outreach based on temperature:

**COLD** (Low/Very Low): No pitch. Pure curiosity play. Comment on something hyper-specific to them. Goal: start a conversation. 1-3 sentences. Make them feel seen, not sold to.

**WARM** (Medium/High): Reference something specific about them + naturally bridge to Andrew's free Skool community (7-Figure CEO community) or a relevant YouTube video concept. Soft, no pressure. 2-4 sentences.

**HOT** (Very High/Event Lead): Direct about the result they want. Tease BOARDROOM or LAUNCH depending on revenue. Move toward booking a call. 2-4 sentences.

Voice rules (never break these):
- No em dashes ever
- Never: crush it, hustle, grind, guru, guaranteed, magic bullet, overnight
- Sound like a real human texting, not a marketer
- Be specific to THEM, not generic
- Never open with "I came across your profile" or "I noticed"
- Hook their identity, not their ego

Respond ONLY in this exact JSON format, no markdown, no code fences, nothing else:
{
  "niche": "one-line description of what they do and who they serve",
  "estimated_revenue": "your best guess at their current monthly revenue",
  "pain_points": ["specific pain 1", "specific pain 2", "specific pain 3"],
  "goals_desires": ["what they really want 1", "what they really want 2", "what they really want 3"],
  "personality_read": "2-3 sentences: who is this person, their communication style, what they value most",
  "recommended_offer": "LAUNCH or BOARDROOM — one sentence on why",
  "dm_message": "the exact word-for-word DM to send right now, ready to copy-paste",
  "dm_platform": "Facebook, Instagram, LinkedIn, or iMessage — and one sentence on why this platform for this person",
  "follow_up_angle": "if no reply in 3 days, what is the exact follow-up angle or message",
  "objections_to_expect": ["the most likely objection and how to handle it", "second most likely objection"],
  "green_flags": ["positive buying signal 1", "positive buying signal 2"],
  "red_flags": ["one thing to watch out for with this specific person"]
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
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic error:', err);
      return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
    }

    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return NextResponse.json({ ...parsed, temperature });
  } catch (err) {
    console.error('Research error:', err);
    return NextResponse.json({ error: 'Failed to generate research' }, { status: 500 });
  }
}
