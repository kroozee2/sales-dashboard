type ApiKeys = {
  agentKey?: string;
  workerKey?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (hotLead) return UUID_RE.test(decodeURIComponent(hotLead[1]));
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
