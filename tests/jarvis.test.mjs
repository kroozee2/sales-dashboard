import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJarvisHistory, parseJarvisRequest } from '../lib/jarvis.ts';
import { createSpeechRequest, validateAudioUpload } from '../lib/cartesia.ts';

test('normalizeJarvisHistory keeps only recent valid conversational turns', () => {
  const history = [
    { role: 'assistant', content: 'oldest' },
    ...Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turn ${index}`,
    })),
    { role: 'system', content: 'ignore me' },
    { role: 'user', content: '   ' },
  ];

  const normalized = normalizeJarvisHistory(history);
  assert.equal(normalized.length, 12);
  assert.equal(normalized[0]?.content, 'turn 2');
  assert.equal(normalized.at(-1)?.content, 'turn 13');
});

test('parseJarvisRequest trims the command and rejects empty input', () => {
  assert.deepEqual(parseJarvisRequest({ transcript: '  Show my newest leads  ', history: [] }), {
    transcript: 'Show my newest leads',
    history: [],
  });
  assert.throws(() => parseJarvisRequest({ transcript: '   ' }), /command/i);
});

test('parseJarvisRequest bounds commands to protect the action endpoint', () => {
  assert.throws(() => parseJarvisRequest({ transcript: 'x'.repeat(4001) }), /too long/i);
});

test('createSpeechRequest uses Cartesia Sonic with browser-playable MP3 output', () => {
  const request = createSpeechRequest('  I found three new leads.  ', 'voice-123');
  assert.deepEqual(request, {
    model_id: 'sonic-3.5',
    transcript: 'I found three new leads.',
    voice: { id: 'voice-123' },
    language: 'en',
    output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
    generation_config: { speed: 0.96, emotion: 'content' },
  });
});

test('voice endpoints reject oversized or unsupported audio', () => {
  assert.doesNotThrow(() => validateAudioUpload({ size: 2_000_000, type: 'audio/webm' }));
  assert.throws(() => validateAudioUpload({ size: 20_000_000, type: 'audio/webm' }), /too large/i);
  assert.throws(() => validateAudioUpload({ size: 20, type: 'text/plain' }), /audio format/i);
});
