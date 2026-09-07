import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const content = readFileSync(new URL("../app/content/page.tsx", import.meta.url), "utf8");

test("preserves Claude's enhanced Proof classification and inline editing", () => {
  assert.match(content, /interface Proof \{[\s\S]*proof_kind: string \| null/);
  assert.match(content, /const isClientProof = \(p: Proof\)/);
  assert.match(content, /person_name: v/);
  assert.match(content, /proof_kind: e\.target\.value/);
  assert.match(content, /const \[who, setWho\] = useState/);
});

test("preserves Claude's Proof dashboard metrics and views", () => {
  assert.match(content, /function ProofDashboard\(/);
  assert.match(content, /Proof collected over time/);
  assert.match(content, /Most proof by person/);
  assert.match(content, /const \[view, setView\] = useState/);
  assert.match(content, /<ProofDashboard proof=\{proof\} \/>/);
});
