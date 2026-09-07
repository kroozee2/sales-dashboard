import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tabs = readFileSync(new URL("../components/sub-tabs.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/leads/sales-calls/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/sales-calls/route.ts", import.meta.url), "utf8");

test("Sales Calls is a Leads sub-tab without replacing the sidebar Calls destination", () => {
  assert.match(tabs, /href:\s*["']\/leads\/sales-calls["'],\s*label:\s*["']Sales Calls["']/);
  assert.match(page, /<SubTabs group=["']leads["]/);
  assert.match(sidebar, /href:\s*["']\/calls["'],\s*label:\s*["']Calls["']/);
});

test("booked-calls spreadsheet uses authoritative APIs and reversible updates, never deletion", () => {
  assert.match(page, /fetch\(["']\/api\/sales-calls["']\)/);
  assert.match(page, /method:\s*["']PATCH["']/);
  assert.doesNotMatch(page, /method:\s*["']DELETE["']/);
  assert.match(page, /➖ Other/);
  assert.match(page, /🔜 Upcoming/);
  assert.match(page, /Show moved off/);
  assert.match(page, /data\.call/);
  assert.match(page, /busyIds/);
});

test("Sales Calls table is responsive and has an accessible drawer-like editor", () => {
  assert.match(page, /overflow-x-auto/);
  assert.match(page, /<table/);
  assert.match(page, /<caption/);
  assert.match(page, /aria-label=/);
  assert.match(page, /role=["']dialog["']/);
  assert.match(page, /aria-modal=["']true["']/);
  assert.match(page, /Escape/);
  assert.match(page, /min-w-/);
});

test("sales-call PATCH reads the existing call before a serialized lead sync and reports ambiguity", () => {
  assert.match(route, /select\(["'][^"']*result[^"']*["']\)[\s\S]*eq\(["']id["'], id\)[\s\S]*maybeSingle\(\)/);
  assert.match(route, /findLeadForCall/);
  assert.match(route, /persistLeadUpdateWithCas/);
  assert.match(route, /status:\s*["']ambiguous["']/);
  assert.match(route, /leadSync/);
  assert.doesNotMatch(route, /syncLeadFromCall\(data\)\.catch/);
});


test("move controls use a dedicated reversible marker and preserve outcome evidence", () => {
  assert.match(page, /booked_view_action:\s*["']move_off["']/);
  assert.match(page, /booked_view_action:\s*["']restore["']/);
  assert.match(page, /expected_updated_at/);
  assert.match(page, /booked_view_revision/);
  assert.doesNotMatch(page, /Move off[^\n]+result:/);
  assert.match(page, /callViewState/);
});

test("row and dialog keyboard behavior traps focus, restores opener, and makes background inert", () => {
  assert.match(page, /shouldOpenSalesCallRow\(event\)/);
  assert.match(page, /focusable/);
  assert.match(page, /shiftKey/);
  assert.match(page, /openerRef/);
  assert.match(page, /inert=/);
  assert.match(page, /closeButtonRef/);
  assert.match(page, /min-h-11/);
  assert.match(page, /break-all/);
  assert.match(page, /text-base sm:text-sm/);
});


test("existing Calls editor strips every response-only field before PATCH", () => {
  const callsPage = readFileSync(new URL("../app/calls/page.tsx", import.meta.url), "utf8");
  assert.match(callsPage, /created_at[\s\S]*updated_at[\s\S]*booked_view_moved_off[\s\S]*booked_view_revision[\s\S]*mutableFields/);
  assert.match(callsPage, /body:\s*JSON\.stringify\(\{ id: selected\.id, \.\.\.mutableFields \}\)/);
});


test("completed and past rows never receive the move-off action", () => {
  assert.match(page, /callViewState\(row\) === ["']booked["'][\s\S]*Move off[\s\S]*callViewState\(row\) === ["']completed["'] \? ["']Completed["'] : ["']Past["']/);
  assert.match(page, /callViewState\(row\) === ["']moved-off["'][\s\S]*Restore natural call view/);
});

test("keyboard rows activate only from the row itself, not nested selects or buttons", () => {
  assert.match(page, /shouldOpenSalesCallRow\(event\)/);
  assert.match(page, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("dialog implements initial focus, Tab containment, inert background, Escape close, and opener restore", () => {
  assert.match(page, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(page, /window\.addEventListener\(["']keydown["'], onKeyDown\)/);
  assert.match(page, /event\.key === ["']Escape["'][\s\S]*closeDialog\(\)/);
  assert.match(page, /inert=\{selected \? true : undefined\}/);
  assert.match(page, /aria-hidden=\{selected \? true : undefined\}/);
  assert.match(page, /openerCanReceiveFocus/);
  assert.match(page, /fallbackFocusRef/);
});

test("page exposes semantic table and labeled status, error, search, and dialog surfaces", () => {
  assert.match(page, /<main/);
  assert.match(page, /<h1[^>]*>Sales Calls<\/h1>/);
  assert.match(page, /<caption className=["']sr-only["']/);
  assert.match(page, /<th scope=["']col["']/);
  assert.match(page, /<th scope=["']row["']/);
  assert.match(page, /htmlFor=["']sales-call-search["']/);
  assert.match(page, /aria-live=["']polite["']/);
  assert.match(page, /role=["']status["']/);
  assert.match(page, /role=["']alert["']/);
  assert.match(page, /role=["']dialog["'][\s\S]*aria-modal=["']true["'][\s\S]*aria-labelledby=["']sales-call-editor-title["']/);
});
