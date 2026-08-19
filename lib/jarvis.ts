export type JarvisRole = 'user' | 'assistant';

export interface JarvisMessage {
  role: JarvisRole;
  content: string;
}

export interface JarvisRequest {
  transcript: string;
  history: JarvisMessage[];
}

const MAX_HISTORY_TURNS = 12;
const MAX_COMMAND_LENGTH = 4_000;
const MAX_MESSAGE_LENGTH = 4_000;

export function normalizeJarvisHistory(value: unknown): JarvisMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({
      role: item.role as JarvisRole,
      content: typeof item.content === 'string' ? item.content.trim().slice(0, MAX_MESSAGE_LENGTH) : '',
    }))
    .filter((item) => item.content.length > 0)
    .slice(-MAX_HISTORY_TURNS);
}

export function parseJarvisRequest(value: unknown): JarvisRequest {
  if (!value || typeof value !== 'object') throw new Error('A command is required.');

  const payload = value as Record<string, unknown>;
  const transcript = typeof payload.transcript === 'string' ? payload.transcript.trim() : '';

  if (!transcript) throw new Error('A command is required.');
  if (transcript.length > MAX_COMMAND_LENGTH) throw new Error('That command is too long.');

  return {
    transcript,
    history: normalizeJarvisHistory(payload.history),
  };
}
