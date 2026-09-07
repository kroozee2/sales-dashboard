import { NextRequest, NextResponse } from 'next/server';
import { CARTESIA_VERSION, createSpeechRequest } from '@/lib/cartesia';

export async function POST(req: NextRequest) {
  const apiKey = process.env.CARTESIA_API_KEY;
  const voiceId = process.env.CARTESIA_VOICE_ID;
  if (!apiKey || !voiceId) {
    return NextResponse.json({ error: 'Cartesia voice is not configured.' }, { status: 503 });
  }

  try {
    const body = await req.json() as { text?: unknown };
    const text = typeof body.text === 'string' ? body.text : '';
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Cartesia-Version': CARTESIA_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createSpeechRequest(text, voiceId)),
    });

    if (!response.ok) {
      console.error('[jarvis-speech] Cartesia error', response.status, await response.text());
      return NextResponse.json({ error: 'Cartesia could not generate speech.' }, { status: 502 });
    }

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid speech request.' }, { status: 400 });
  }
}
