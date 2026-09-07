import { parseJsonWithUniqueKeys } from './agent-workforce.ts';

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
export const MAX_JARVIS_REQUEST_BYTES = 64_000;
const INVALID_TEXT_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function normalizeJarvisHistory(value: unknown): JarvisMessage[] {
  if (!Array.isArray(value) || value.length > MAX_HISTORY_TURNS) throw new Error('History must contain at most 12 messages.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !exactKeys(entry as Record<string, unknown>, ['role', 'content'])) throw new Error('History contains an invalid message.');
    const message = entry as Record<string, unknown>;
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('History contains an invalid role.');
    if (typeof message.content !== 'string' || !message.content.trim() || message.content.length > MAX_MESSAGE_LENGTH || INVALID_TEXT_CONTROL.test(message.content)) throw new Error('History contains invalid content.');
    return { role: message.role, content: message.content.trim() };
  });
}

export function parseJarvisRequest(value: unknown): JarvisRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !exactKeys(value as Record<string, unknown>, ['transcript', 'history'])) throw new Error('Invalid command envelope.');
  const payload = value as Record<string, unknown>;
  if (typeof payload.transcript !== 'string' || INVALID_TEXT_CONTROL.test(payload.transcript)) throw new Error('A valid command is required.');
  const transcript = payload.transcript.trim();
  if (!transcript) throw new Error('A command is required.');
  if (payload.transcript.length > MAX_COMMAND_LENGTH) throw new Error('That command is too long.');
  return { transcript, history: normalizeJarvisHistory(payload.history) };
}

export async function readBoundedJarvisBody(request: Request): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_JARVIS_REQUEST_BYTES)) throw new Error('Command request is too large.');
  if (!request.body) throw new Error('Command request body is required.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_JARVIS_REQUEST_BYTES) { await reader.cancel(); throw new Error('Command request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseJsonWithUniqueKeys(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
