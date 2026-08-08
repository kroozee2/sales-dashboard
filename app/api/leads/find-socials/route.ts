import { NextRequest, NextResponse } from 'next/server';

interface FirecrawlSearchResult {
  url: string;
  title?: string;
  description?: string;
}

interface FirecrawlResponse {
  data?: FirecrawlSearchResult[];
  success?: boolean;
}

async function searchFirecrawl(query: string, limit = 5): Promise<FirecrawlSearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) return [];
    const data = await res.json() as FirecrawlResponse;
    return data.data ?? [];
  } catch {
    return [];
  }
}

function candidatesForDomain(results: FirecrawlSearchResult[], domain: string): Array<{ url: string; title?: string; description?: string }> {
  const seen = new Set<string>();
  const candidates: Array<{ url: string; title?: string; description?: string }> = [];

  for (const r of results) {
    try {
      const u = new URL(r.url);
      if (!u.hostname.includes(domain)) continue;

      const path = u.pathname.replace(/\/$/, '');
      // Skip generic pages
      if (
        path.length <= 1 ||
        path.includes('/search') ||
        path.includes('/login') ||
        path.includes('/signup') ||
        path.includes('/help') ||
        path.includes('/about') ||
        path.includes('/pages/') ||
        path.includes('/groups/') ||
        path.includes('/events/') ||
        path.includes('/hashtag/') ||
        path.includes('/explore/')
      ) continue;

      const cleanUrl = r.url.split('?')[0];
      if (seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);
      candidates.push({ url: cleanUrl, title: r.title, description: r.description });
    } catch {
      // invalid URL
    }
  }
  return candidates;
}

async function askClaudeToPickBestMatch(
  name: string,
  email: string,
  phone: string,
  platform: string,
  candidates: Array<{ url: string; title?: string; description?: string }>
): Promise<string | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].url;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: return first candidate
    return candidates[0].url;
  }

  const emailUsername = email ? email.split('@')[0] : '';
  const emailDomain = email ? email.split('@')[1] : '';
  const isPersonalEmail = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'me.com', 'aol.com'].includes(emailDomain ?? '');

  const prompt = `You are finding the correct ${platform} profile for a specific person.

Person details:
- Full name: ${name}
- Email: ${email || 'unknown'}
- Email username (before @): ${emailUsername || 'unknown'}
- Email domain (company hint): ${!isPersonalEmail ? emailDomain : 'personal email, not a company domain'}
- Phone: ${phone || 'unknown'}

Candidates found (URLs with titles/descriptions):
${candidates.map((c, i) => `${i + 1}. URL: ${c.url}
   Title: ${c.title || 'N/A'}
   Description: ${c.description || 'N/A'}`).join('\n\n')}

Instructions:
- Pick the candidate that most likely belongs to THIS specific person
- The email username often matches social handles (e.g. john.doe@gmail.com → johndoe or john.doe)
- Non-personal email domains (company domains) are strong signals for LinkedIn
- Name match in title is a strong signal
- If no candidate is a confident match, respond with "NONE"
- Respond with ONLY the exact URL of the best match, or "NONE". No explanation.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return candidates[0].url;
    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    if (text === 'NONE' || !text.startsWith('http')) return null;
    return text;
  } catch {
    return candidates[0].url;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string; email?: string; phone?: string };
  const { name = '', email = '', phone = '' } = body;

  if (!name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500 });
  }

  const emailUsername = email ? email.split('@')[0] : '';
  const firstName = name.trim().split(' ')[0];
  const lastName = name.trim().split(' ').slice(-1)[0];

  // Run many varied searches per platform in parallel for better coverage
  const searches = await Promise.all([
    // Facebook — multiple query angles
    searchFirecrawl(`"${name}" site:facebook.com`, 5),
    searchFirecrawl(`"${firstName}" "${lastName}" facebook.com/`, 5),
    emailUsername ? searchFirecrawl(`"${emailUsername}" site:facebook.com`, 5) : Promise.resolve([]),

    // Instagram — multiple query angles
    searchFirecrawl(`"${name}" site:instagram.com`, 5),
    emailUsername ? searchFirecrawl(`"${emailUsername}" site:instagram.com`, 5) : Promise.resolve([]),
    searchFirecrawl(`${firstName} ${lastName} instagram profile`, 5),

    // LinkedIn — most identifying via email username
    searchFirecrawl(`"${name}" site:linkedin.com/in`, 5),
    emailUsername ? searchFirecrawl(`"${emailUsername}" site:linkedin.com/in`, 5) : Promise.resolve([]),
    searchFirecrawl(`${firstName} ${lastName} linkedin.com/in`, 5),
  ]);

  const [fbR1, fbR2, fbR3, igR1, igR2, igR3, liR1, liR2, liR3] = searches;

  const fbCandidates = candidatesForDomain([...fbR1, ...fbR2, ...fbR3], 'facebook.com');
  const igCandidates = candidatesForDomain([...igR1, ...igR2, ...igR3], 'instagram.com');
  const liCandidates = candidatesForDomain([...liR1, ...liR2, ...liR3], 'linkedin.com');

  // Ask Claude to pick the best match for each platform (in parallel)
  const [facebook_url, instagram_url, linkedin_url] = await Promise.all([
    askClaudeToPickBestMatch(name, email, phone, 'Facebook', fbCandidates),
    askClaudeToPickBestMatch(name, email, phone, 'Instagram', igCandidates),
    askClaudeToPickBestMatch(name, email, phone, 'LinkedIn', liCandidates),
  ]);

  return NextResponse.json({
    facebook_url,
    instagram_url,
    linkedin_url,
    raw: {
      facebook: fbCandidates.slice(0, 5),
      instagram: igCandidates.slice(0, 5),
      linkedin: liCandidates.slice(0, 5),
    },
  });
}
