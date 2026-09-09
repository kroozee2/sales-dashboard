import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ANON = "NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY";

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.tsx?$/.test(entry)) files.push(path);
  }
  return files;
}

const sources = ["app", "lib", "components"].flatMap((dir) => {
  try { return walk(join(ROOT, dir)); } catch { return []; }
});

/**
 * The anon key is published by design, and this database has RLS off on most
 * tables, so anything holding that key can read and write them. Server code
 * must therefore reach for the service key. This test is the thing that stops
 * a fourth one appearing.
 */
test("no module builds a Supabase client from the anon key alone", () => {
  const offenders = [];
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(ANON)) continue;
    // Allowed: naming the variable while preferring the service key, and the
    // credential inventory in team-auth, which only lists the name.
    for (const line of text.split("\n")) {
      if (!line.includes(ANON)) continue;
      const prefersService = line.includes("SUPABASE_CALLS_SERVICE_KEY");
      const isInventoryEntry = /^\s*"NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY",?\s*$/.test(line);
      if (!prefersService && !isInventoryEntry) {
        offenders.push(`${file.replace(ROOT, "")}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `these read with the published anon key:\n${offenders.join("\n")}`);
});

test("the calls and leads clients read as the server", () => {
  const calls = readFileSync(join(ROOT, "lib/supabase-calls.ts"), "utf8");
  assert.match(calls, /SUPABASE_CALLS_SERVICE_KEY/, "callsDb must prefer the service key");

  const leads = readFileSync(join(ROOT, "lib/supabase-leads.ts"), "utf8");
  assert.doesNotMatch(leads, /createLeadsAnonClient/, "the unused browser client is gone");
  assert.match(leads, /createLeadsAdminClient/);
});

test("no client component imports a server database client for its value", () => {
  // `import type` is erased at compile time, so a client component may take the
  // SalesCall type from that module without the module itself being bundled.
  // A value import would pull the client, and with it the service key.
  const valueImport = /^\s*import\s+(?!type\b)[^;]*from\s+["']@\/lib\/supabase-(?:calls|leads|content)["']/m;
  const offenders = [];
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    if (!/^["']use client["']/m.test(text)) continue;
    if (valueImport.test(text)) offenders.push(file.replace(ROOT, ""));
  }
  assert.deepEqual(offenders, [], "a client component importing these for their value would ship the service key");
});
