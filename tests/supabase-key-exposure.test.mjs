import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// The Supabase key this app talks to Postgres with is named with a NEXT_PUBLIC_
// prefix, which means Next inlines it into the browser bundle the moment any
// client component references it. Today nothing does, so it never ships. These
// tests keep it that way, because the tables it reaches carry an open RLS
// policy — the key is the only thing standing between the browser and every
// lead, call and client record.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set([".git", ".next", "node_modules", "tests"]);

function sourceFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(path, files);
    else if (/\.(?:[cm]?[jt]s|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** A module that runs in the browser: it, or the file it lives beside, is client-side. */
function isClientModule(path, source) {
  if (/^["']use server["']/m.test(source)) return false;
  if (/^\s*["']use client["']/.test(source)) return true;
  // Anything under app/api is a route handler, and lib/ is shared but only ever
  // pulled into the browser through a client component, which this catches.
  return false;
}

const FILES = sourceFiles(ROOT);

test("no client component reads a Supabase key", () => {
  const offenders = FILES.filter((path) => {
    const source = readFileSync(path, "utf8");
    if (!isClientModule(path, source)) return false;
    return /process\.env\.(?:NEXT_PUBLIC_)?SUPABASE[A-Z0-9_]*/.test(source);
  }).map((path) => relative(ROOT, path));
  assert.deepEqual(offenders, [], "a client component referencing this key would publish it in the browser bundle");
});

test("no client component builds a Supabase client", () => {
  const offenders = FILES.filter((path) => {
    const source = readFileSync(path, "utf8");
    if (!isClientModule(path, source)) return false;
    return /from\s+["']@supabase\/supabase-js["']/.test(source);
  }).map((path) => relative(ROOT, path));
  assert.deepEqual(offenders, [], "the browser must reach Postgres through this app's API, never directly");
});

test("the key is only reached from server routes and server-only libraries", () => {
  const referencing = FILES.filter((path) => /process\.env\.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY/.test(readFileSync(path, "utf8")))
    .map((path) => relative(ROOT, path));
  assert.equal(referencing.length > 0, true, "the fallback still exists, so this test is still meaningful");
  const stray = referencing.filter((path) => !path.startsWith("app/api/") && !path.startsWith("lib/") && !path.startsWith("scripts/"));
  assert.deepEqual(stray, [], "only server code may name this key");
});
