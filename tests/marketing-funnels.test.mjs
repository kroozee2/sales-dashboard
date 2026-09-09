import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sidebar = read("../components/sidebar.tsx");
const board = read("../components/funnels.tsx");
const route = read("../app/api/funnels/route.ts");

test("Funnels is a Marketing destination", () => {
  assert.match(sidebar, /href: "\/funnels", label: "Funnels".*section: "Marketing"/);
});

test("the page exists and renders the board", () => {
  const page = read("../app/funnels/page.tsx");
  assert.match(page, /FunnelsBoard/);
});

test("it opens on the spreadsheet, which is the view that was asked for", () => {
  assert.match(board, /useState<"grid" \| "sheet" \| "gallery">\("sheet"\)/);
});

test("the sheet carries every column the board is for", () => {
  for (const heading of ["Funnel", "Type", "Status", "Link", "Opt-ins", "Text", "Email", "The ask"]) {
    assert.match(board, new RegExp(`>${heading}<`), `missing column: ${heading}`);
  }
  assert.match(board, /What it&apos;s for/);
});

test("the sheet shows when each funnel was created", () => {
  assert.match(board, />Created</);
  assert.match(board, /created_at: string \| null;/);
  assert.match(board, /\{fmtDate\(f\.created_at\)\}/);
});

test("the board is split into live, paused and draft sections", () => {
  assert.match(board, /const SECTION_ORDER = \["live", "paused", "draft"\]/);
  assert.match(board, /function sections\(funnels: Funnel\[\]\)/);
  // Every view groups, so switching view never loses the grouping.
  assert.equal(board.match(/sections\(funnels\)\.map/g)?.length, 3);
});

test("a funnel with an unknown status still gets a section, never disappears", () => {
  // Filtering to the three known statuses would silently drop a row.
  assert.match(board, /!SECTION_ORDER\.includes\(k\)/);
});

test("created_at is read-only on the board", () => {
  // It appears in the GET ordering, so scope the check to what PATCH accepts.
  const editable = route.slice(route.indexOf("const EDITABLE"), route.indexOf("export async function PATCH"));
  assert.doesNotMatch(editable, /created_at/, "the creation date is a fact, not a field to edit");
});

test("the follow-up switches write straight back", () => {
  assert.match(board, /onPatch\(f\.id, \{ followup_text: e\.target\.checked \}\)/);
  assert.match(board, /onPatch\(f\.id, \{ followup_email: e\.target\.checked \}\)/);
  assert.match(board, /aria-label=\{`Text follow-up after opting in to \$\{f\.name\}`\}/);
  assert.match(board, /aria-label=\{`Email follow-up after opting in to \$\{f\.name\}`\}/);
});

test("a funnel with no connected source shows a dash, never a zero", () => {
  // Zero opt-ins and "we cannot see this funnel's opt-ins" are different facts,
  // and printing 0 for the second would be a lie.
  assert.match(board, /f\.optin_count === null \? \([\s\S]*?—/);
  assert.match(board, /No source connected/);
});

test("a real count says where it came from and how old it is", () => {
  assert.match(board, /function countedAgo/);
  assert.match(board, /counted today|counted yesterday/);
  assert.match(board, /title=\{\[f\.optin_source, countedAgo\(f\.optin_counted_at\)\]/);
});

test("the link is one tap away, to open or to copy", () => {
  assert.match(board, /target="_blank" rel="noreferrer"/);
  assert.match(board, /onCopy\(f\)/);
});

test("PATCH only writes columns the board edits", () => {
  assert.match(route, /const EDITABLE = new Set\(/);
  for (const field of ["cta", "followup_text", "followup_email", "purpose", "url", "status"]) {
    assert.match(route, new RegExp(`"${field}"`), `${field} should be editable`);
  }
  assert.doesNotMatch(route, /const \{ id, \.\.\.updates \} = await req\.json\(\)/, "the body must not be spread straight into the row");
  assert.doesNotMatch(route, /"optin_count"/, "counts are refreshed from each funnel's own database, not typed in");
});

test("loading the board cannot cascade renders or leak a request", () => {
  assert.match(board, /new AbortController\(\)/);
  assert.match(board, /return \(\) => controller\.abort\(\)/);
});
