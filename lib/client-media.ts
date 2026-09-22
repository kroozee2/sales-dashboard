/** Public client media shown in the roster and detail drawer. */
export function normalizeClientMediaUrl(value: string): string {
  if (/[\u0000-\u001f\u007f-\u009f\\]/.test(value)) {
    throw new Error("client media URL contains control characters or backslashes");
  }
  const trimmed = value.trim();
  if (trimmed.length > 2_048) throw new Error("client media URL is too long");
  let url: URL;
  try { url = new URL(trimmed); }
  catch { throw new Error("client media must be a valid URL"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("client media must use http or https");
  }
  return trimmed;
}

/** Invalid legacy/out-of-band values are absent, never executable browser URLs. */
export function safeClientMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try { return normalizeClientMediaUrl(value); }
  catch { return null; }
}
