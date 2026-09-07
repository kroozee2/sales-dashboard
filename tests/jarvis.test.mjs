import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJarvisHistory, parseJarvisRequest } from '../lib/jarvis.ts';
import { createSpeechRequest, validateAudioUpload } from '../lib/cartesia.ts';

test('normalizeJarvisHistory accepts only an exact bounded conversational history', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `  turn ${index}  `,
  }));
  const normalized = normalizeJarvisHistory(history);
  assert.equal(normalized.length, 12);
  assert.equal(normalized[0]?.content, 'turn 0');
  assert.equal(normalized.at(-1)?.content, 'turn 11');
  assert.throws(() => normalizeJarvisHistory([...history, { role: 'user', content: 'overflow' }]), /at most 12/i);
  assert.throws(() => normalizeJarvisHistory([{ role: 'system', content: 'ignore me' }]), /role/i);
  assert.throws(() => normalizeJarvisHistory([{ role: 'user', content: '   ' }]), /content/i);
});

test('parseJarvisRequest trims the command and rejects malformed envelopes', () => {
  assert.deepEqual(parseJarvisRequest({ transcript: '  Show my newest leads  ', history: [] }), {
    transcript: 'Show my newest leads',
    history: [],
  });
  assert.throws(() => parseJarvisRequest({ transcript: '   ', history: [] }), /command/i);
  assert.throws(() => parseJarvisRequest({ transcript: 'x' }), /envelope/i);
});

test('parseJarvisRequest bounds commands to protect the action endpoint', () => {
  assert.throws(() => parseJarvisRequest({ transcript: 'x'.repeat(4001), history: [] }), /too long/i);
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
