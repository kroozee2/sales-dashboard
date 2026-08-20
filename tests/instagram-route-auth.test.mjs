import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const createSource = readFileSync(new URL("../app/api/instagram/create/route.ts", import.meta.url), "utf8");

test("global SalesOS proxy covers and rejects unauthenticated paid and service-role API routes", () => {
  assert.match(proxySource, /matcher:\s*\["\/\(\(\?!_next\/static\|_next\/image\)\.\*\)"\]/);
  assert.match(proxySource, /if \(pathname\.startsWith\("\/api\/"\)\)/);
  assert.match(proxySource, /status:\s*401/);
  assert.match(proxySource, /if \(!sessionToken\)/);
  assert.doesNotMatch(proxySource, /PUBLIC_PATHS[^;]*(instagram|content)/s);
});

test("creator route reserves generations and caches paid example analysis", () => {
  assert.match(createSource, /GENERATION_RATE_KEY/);
  assert.match(createSource, /GENERATION_COOLDOWN_MS\s*=\s*15_000/);
  assert.match(createSource, /EXAMPLE_CACHE_MS\s*=\s*7\s*\*/);
  assert.match(createSource, /createHash\("sha256"\)/);
  assert.match(createSource, /\.eq\("value", previous\)/);
  assert.match(createSource, /\.eq\("value", claimValue\)/);
});
