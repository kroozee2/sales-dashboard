type ApiKeys = {
  agentKey?: string;
  workerKey?: string;
};

const LEAD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:._@+\-]{0,199}$/;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function exactWorkerMemberPatch(method: string, pathname: string): boolean {
  if (method !== "PATCH") return false;
  const legacy = pathname.match(/^\/api\/instagram-hot-leads\/([^/]+)$/);
  const hotLead = pathname.match(/^\/api\/hot-leads\/current\/([^/]+)$/);
  try {
    if (legacy) return /^[A-Za-z0-9._]{1,30}$/.test(decodeURIComponent(legacy[1]));
    if (hotLead) return LEAD_ID_RE.test(decodeURIComponent(hotLead[1]));
    return false;
  } catch {
    return false;
  }
}

export function bearerAuthorizedForRequest(
  method: string,
  pathname: string,
  authorization: string,
  keys: ApiKeys,
): boolean {
  if (!pathname.startsWith("/api/") || !authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length).trim();
  if (keys.agentKey && safeEqual(supplied, keys.agentKey)) return true;
  return Boolean(
    keys.workerKey
      && exactWorkerMemberPatch(method, pathname)
      && safeEqual(supplied, keys.workerKey),
  );
}
