const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);

export const CARTESIA_VERSION = '2026-08-14';

export function createSpeechRequest(transcript: string, voiceId: string) {
  const text = transcript.trim().slice(0, 3_000);
  if (!text) throw new Error('Speech text is required.');
  if (!voiceId.trim()) throw new Error('A Cartesia voice is required.');

  return {
    model_id: 'sonic-3.5',
    transcript: text,
    voice: { id: voiceId.trim() },
    language: 'en',
    output_format: { container: 'mp3', sample_rate: 44_100, bit_rate: 128_000 },
    generation_config: { speed: 0.96, emotion: 'content' },
  };
}

export function validateAudioUpload(file: { size: number; type: string }) {
  if (file.size <= 0) throw new Error('The recording is empty.');
  if (file.size > MAX_AUDIO_BYTES) throw new Error('The recording is too large.');
  if (!SUPPORTED_AUDIO_TYPES.has(file.type)) throw new Error('That audio format is not supported.');
}
