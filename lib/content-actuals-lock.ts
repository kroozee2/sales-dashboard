const LEASE_MS = 30 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Lease {
  owner: string;
  expires_at: string;
}

export type LeaseTransition =
  | { ok: true; status: 200; value: string }
  | { ok: false; status: 400 | 409; error: string };

function parseLease(value: string | null): Lease | null {
  if (!value) return null;
  try {
    const memberCount = (name: "owner" | "expires_at") => value.match(new RegExp(`"${name}"\\s*:`, "g"))?.length ?? 0;
    if (value.includes("\\") || memberCount("owner") !== 1 || memberCount("expires_at") !== 1) return null;
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length !== 2) return null;
    if (typeof parsed.owner !== "string" || !UUID.test(parsed.owner) || typeof parsed.expires_at !== "string") return null;
    const expiresMs = Date.parse(parsed.expires_at);
    if (!Number.isFinite(expiresMs) || new Date(expiresMs).toISOString() !== parsed.expires_at) return null;
    return { owner: parsed.owner, expires_at: parsed.expires_at };
  } catch {
    return null;
  }
}

export function leaseTransition(currentValue: string | null, action: string, owner: string, nowMs: number): LeaseTransition {
  if ((action !== "acquire" && action !== "release") || !UUID.test(owner) || !Number.isFinite(nowMs)) {
    return { ok: false, status: 400, error: "invalid lease request" };
  }
  const current = parseLease(currentValue);
  if (currentValue !== null && !current) {
    return { ok: false, status: 409, error: "content actuals lease state is malformed" };
  }
  if (action === "acquire") {
    if (current && Date.parse(current.expires_at) > nowMs && current.owner !== owner) {
      return { ok: false, status: 409, error: "content actuals sync is already running" };
    }
    return { ok: true, status: 200, value: JSON.stringify({ owner, expires_at: new Date(nowMs + LEASE_MS).toISOString() }) };
  }
  if (!current || current.owner !== owner) {
    return { ok: false, status: 409, error: "content actuals lease owner mismatch" };
  }
  return { ok: true, status: 200, value: JSON.stringify({ owner, expires_at: new Date(nowMs).toISOString() }) };
}
