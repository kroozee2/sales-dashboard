import { NextRequest, NextResponse } from 'next/server';
import { CARTESIA_VERSION, validateAudioUpload } from '@/lib/cartesia';

export async function POST(req: NextRequest) {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Cartesia transcription is not configured.' }, { status: 503 });
  }

  try {
    const input = await req.formData();
    const file = input.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'An audio recording is required.' }, { status: 400 });
    }
    validateAudioUpload(file);

    const form = new FormData();
    form.set('file', file, file.name || 'jarvis.webm');
    form.set('model', 'ink-whisper');
    form.set('language', 'en');

    const response = await fetch('https://api.cartesia.ai/stt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Cartesia-Version': CARTESIA_VERSION,
      },
      body: form,
    });

    if (!response.ok) {
      console.error('[jarvis-transcribe] Cartesia error', response.status, await response.text());
      return NextResponse.json({ error: 'Cartesia could not transcribe that recording.' }, { status: 502 });
    }

    const data = await response.json() as { text?: string };
    return NextResponse.json({ transcript: data.text?.trim() || '' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid audio upload.' }, { status: 400 });
  }
}
