import { normalizeClientMediaUrl } from "@/lib/client-media";

export const MAX_CLIENT_MEDIA_BYTES = 20_000_000;
const SUPABASE_STORAGE_HOST = /^[a-z0-9-]+\.supabase\.co$/;
const PUBLIC_STORAGE_PATH = "/storage/v1/object/public/";

export class ClientMediaTooLargeError extends Error {
  constructor() { super("client media exceeds download limit"); }
}

export function normalizeClientMediaDownloadSource(value: string): string {
  const raw = value.trim();
  if (!/^https:\/\//i.test(raw)) throw new Error("download source must use https");
  const authority = raw.match(/^https:\/\/([^/?#]*)/i)?.[1];
  if (!authority || authority.includes("@") || authority.includes(":") || !/^[A-Za-z0-9.-]+$/.test(authority)) {
    throw new Error("download source authority is invalid");
  }
  const normalized = normalizeClientMediaUrl(value);
  const url = new URL(normalized);
  if (url.protocol !== "https:") throw new Error("download source must use https");
  if (!SUPABASE_STORAGE_HOST.test(url.hostname) || !url.pathname.startsWith(PUBLIC_STORAGE_PATH)) {
    throw new Error("download source is not approved public storage");
  }
  if (url.username || url.password || url.port) throw new Error("download source authority is invalid");
  return url.toString();
}

export async function readBoundedBody(stream: ReadableStream<Uint8Array>, limit = MAX_CLIENT_MEDIA_BYTES): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("client media exceeds download limit");
        throw new ClientMediaTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function verifiedImageMime(declared: string | null, body: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const mime = (declared ?? "").split(";", 1)[0].trim().toLowerCase();
  const jpeg = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  const png = body.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => body[index] === byte);
  const webp = body.length >= 12
    && body[0] === 0x52 && body[1] === 0x49 && body[2] === 0x46 && body[3] === 0x46
    && body[8] === 0x57 && body[9] === 0x45 && body[10] === 0x42 && body[11] === 0x50;
  if (mime === "image/jpeg" && jpeg) return mime;
  if (mime === "image/png" && png) return mime;
  if (mime === "image/webp" && webp) return mime;
  return null;
}
