export class BoundedBodyError extends Error {
  readonly status: 400 | 413;
  constructor(status: 400 | 413, message: string) {
    super(message);
    this.status = status;
    this.name = "BoundedBodyError";
  }
}

export async function readBoundedJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) throw new BoundedBodyError(413, "Request is too large");
  if (!request.body) throw new BoundedBodyError(400, "A JSON object is required");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request too large");
        throw new BoundedBodyError(413, "Request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new BoundedBodyError(400, "Valid JSON is required"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BoundedBodyError(400, "A JSON object is required");
  }
  return parsed as Record<string, unknown>;
}
