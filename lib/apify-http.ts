const APIFY_BASE = "https://api.apify.com/v2";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Provider response too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Provider response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

export async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const raw = await readBoundedText(response, maxBytes);
  return JSON.parse(raw);
}

export async function startRun(actor: string, input: unknown, token: string): Promise<{ runId: string; datasetId: string }> {
  const response = await fetch(`${APIFY_BASE}/acts/${actor}/runs`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Apify start ${actor} failed (${response.status})`);
  const payload = await readBoundedJson(response, 256_000) as { data?: { id?: unknown; defaultDatasetId?: unknown } };
  const runId = typeof payload?.data?.id === "string" ? payload.data.id : "";
  const datasetId = typeof payload?.data?.defaultDatasetId === "string" ? payload.data.defaultDatasetId : "";
  if (!runId || !datasetId) throw new Error("Apify start returned an invalid response");
  return { runId, datasetId };
}

export async function runStatus(runId: string, token: string): Promise<string> {
  const response = await fetch(`${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}`, {
    headers: auth(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Apify status ${runId} failed (${response.status})`);
  const payload = await readBoundedJson(response, 256_000) as { data?: { status?: unknown } };
  if (typeof payload?.data?.status !== "string") throw new Error("Apify status returned an invalid response");
  return payload.data.status;
}

export async function datasetItems(datasetId: string, token: string, maxBytes = 4_000_000, maxItems = 250): Promise<Record<string, unknown>[]> {
  const limit = Math.min(Math.max(Math.trunc(maxItems), 1), 500);
  const response = await fetch(`${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&limit=${limit}`, {
    headers: auth(token),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Apify dataset ${datasetId} failed (${response.status})`);
  const parsed = await readBoundedJson(response, maxBytes);
  return Array.isArray(parsed) ? parsed.slice(0, limit).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

export async function runActorSync(actor: string, input: unknown, token: string, maxBytes = 8_000_000, maxItems = 250): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${APIFY_BASE}/acts/${actor}/run-sync-get-dataset-items`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(150_000),
  });
  if (!response.ok) throw new Error(`Apify ${actor} failed (${response.status})`);
  const parsed = await readBoundedJson(response, maxBytes);
  const limit = Math.min(Math.max(Math.trunc(maxItems), 1), 500);
  return Array.isArray(parsed) ? parsed.slice(0, limit).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}
