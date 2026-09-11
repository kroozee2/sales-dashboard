import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  createAgentWorkforceDocument,
  isAgentEditorDirty,
  parseAgentWorkforceDocument,
  parseJsonWithUniqueKeys,
  readBoundedAgentWorkforceBody,
  shouldCloseAgentEditor,
  slugifyAgentId,
  uniqueAgentId,
  updateAgentWorkforceDocument,
} from "../lib/agent-workforce.ts";
import { DEFAULT_AGENT_WORKFORCE } from "../lib/agent-workforce-default.ts";
import { boundedText, buildBoundedObservationBody, serializeValidatedReadToolResult, summarizeReadResult } from "../lib/jarvis-observations.ts";
import { agentWorkforceDraftKey, parseAgentWorkforceDraft, persistAgentWorkforceDraft, reconcileAgentWorkforceDraft, serializeAgentWorkforceDraft } from "../lib/agent-workforce-draft.ts";
import { parseFathomMeetingList } from "../lib/fathom-list.ts";
import { activateFathomBack, fathomAttendeeOmission, fathomPageDisclosure, fathomRecordingAccessibleLabel, selectFathomMeetingForPreview } from "../lib/fathom-picker-state.ts";
import { MAX_JARVIS_REQUEST_BYTES, parseJarvisRequest, readBoundedJarvisBody } from "../lib/jarvis.ts";

const coreAgent = (overrides = {}) => ({
  id: "maya-content-director",
  type: "core",
  parent_id: null,
  name: "Maya",
  emoji: "✦",
  role: "Content Director",
  department: "Content",
  mission: "Turn business insight into a consistent YouTube-first content engine.",
  personality: "Creative, strategic, direct, and audience-obsessed.",
  status: "building",
  progress: 35,
  autonomy: "internal",
  cadence: "Weekly planning, daily production",
  schedule: "Mon 6:00 AM PT",
  triggers: ["Weekly planning block"],
  responsibilities: ["Set the editorial direction"],
  capabilities: ["Research", "Strategy", "Delegation"],
  inputs: ["Sales calls", "Client calls"],
  outputs: ["Editorial plan", "Creative briefs"],
  next_milestone: "Connect the weekly research brief",
  notes: "",
  ...overrides,
});

const subAgent = (overrides = {}) => ({
  id: "scout-research",
  type: "subagent",
  parent_id: "maya-content-director",
  name: "Scout",
  emoji: "⌕",
  role: "Research Scout",
  department: "Content",
  mission: "Find evidence-backed topics, questions, trends, and proof.",
  personality: "Curious, skeptical, fast, and source-driven.",
  status: "planned",
  progress: 10,
  autonomy: "internal",
  cadence: "Daily",
  schedule: "5:45 AM PT",
  triggers: ["Daily research window"],
  responsibilities: ["Cite a source for every claim"],
  capabilities: ["Web research"],
  inputs: ["Audience questions"],
  outputs: ["Research brief"],
  next_milestone: "Define source-quality rubric",
  notes: "",
  ...overrides,
});

const input = { agents: [coreAgent(), subAgent()] };

test("agent workforce documents are versioned, bounded, and preserve core-to-sub-agent hierarchy", () => {
  const document = createAgentWorkforceDocument(input, "2026-09-05T16:00:00.000Z");
  assert.equal(document.version, 2);
  assert.equal(document.agents.length, 2);
  assert.equal(document.agents[1].parent_id, document.agents[0].id);
  assert.deepEqual(parseAgentWorkforceDocument(JSON.stringify(document)), document);
  const agentJson = JSON.stringify(coreAgent());
  assert.throws(() => parseAgentWorkforceDocument(`{"version":1,"version":1,"agents":[],"revision":"2026-09-05T16:00:00.000Z","updated_at":"2026-09-05T16:00:00.000Z"}`), /invalid JSON/i);
  assert.throws(() => parseAgentWorkforceDocument(`{"version":1,"agents":[{"name":"Other",${agentJson.slice(1)}],"revision":"2026-09-05T16:00:00.000Z","updated_at":"2026-09-05T16:00:00.000Z"}`), /invalid JSON/i);
  assert.throws(() => parseAgentWorkforceDocument(`{"version":1,"agents":[],"revision":"2026-09-05T16:00:00.000Z","\u0072evision":"2026-09-05T16:00:00.000Z","updated_at":"2026-09-05T16:00:00.000Z"}`), /invalid JSON/i);
  assert.throws(() => parseAgentWorkforceDocument(JSON.stringify({ ...document, revision: "Sat, 05 Sep 2026 16:00:00 GMT" })), /canonical UTC ISO/i);

  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent({ surprise: true })] }), /unknown field/i);
  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent(), coreAgent()] }), /duplicate/i);
  assert.throws(() => createAgentWorkforceDocument({ agents: [subAgent({ parent_id: "missing" })] }), /parent/i);
  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent({ progress: 101 })] }), /progress/i);
  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent({ mission: "x".repeat(1201) })] }), /mission/i);
  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent({ emoji: "longword" })] }), /emoji|symbol/i);
  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent({ emoji: "◇◇◇◇◇" })] }), /emoji|symbol/i);
  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent({ capabilities: Array.from({ length: 21 }, (_, i) => `capability-${i}`) })] }), /capabilities/i);
  for (const id of [" maya-content-director", "maya-content-director\n", "maya\u007f-content", "maya\u0085-content"]) {
    assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent({ id })] }), /id|canonical|slug/i);
  }
  assert.throws(() => createAgentWorkforceDocument({ agents: [coreAgent(), subAgent({ parent_id: "maya-content-director " })] }), /parent|canonical/i);
});

test("agent updates reject stale revisions and advance beyond document and row revisions", () => {
  const current = createAgentWorkforceDocument(input, "2026-09-05T16:00:00.000Z");
  assert.throws(() => updateAgentWorkforceDocument(current, { ...input, expected_revision: "stale" }), /stale/i);
  assert.throws(() => updateAgentWorkforceDocument(current, { ...input, expected_revision: ` ${current.revision}` }), /canonical/i);
  assert.throws(() => updateAgentWorkforceDocument(current, { ...input, expected_revision: `${current.revision}\u007f` }), /canonical/i);
  const updated = updateAgentWorkforceDocument(
    current,
    { agents: [coreAgent({ progress: 60 }), subAgent()], expected_revision: current.revision },
    "2026-09-05T16:00:00.000Z",
    "2026-09-05T17:00:00.000Z",
  );
  assert.equal(updated.agents[0].progress, 60);
  assert.ok(updated.revision > current.revision);
  assert.ok(updated.revision > "2026-09-05T17:00:00.000Z");
  assert.throws(
    () => updateAgentWorkforceDocument(current, { agents: [coreAgent()], expected_revision: current.revision }),
    /deletion is not supported/i,
  );
});

test("request and draft JSON reject duplicate members at every object depth", () => {
  assert.throws(() => parseJsonWithUniqueKeys('{"agents":[],"expected_revision":"old","agents":[1]}'), /duplicate/i);
  assert.throws(() => parseJsonWithUniqueKeys('{"expected_revision":"old","agents":[],"expected_revision":"new"}'), /duplicate/i);
  assert.throws(() => parseJsonWithUniqueKeys('{"\u0061gents":[],"agents":[1]}'), /duplicate/i);
  assert.throws(() => parseJsonWithUniqueKeys('{"agents":[{"id":"one","id":"two"}],"expected_revision":"exact"}'), /duplicate/i);
  assert.deepEqual(parseJsonWithUniqueKeys('{"agents":[],"expected_revision":"exact"}'), { agents: [], expected_revision: "exact" });
});

test("bounded request decoding rejects malformed UTF-8 bytes", async () => {
  const request = new Request("https://example.test", { method: "POST", body: new Uint8Array([0x7b, 0x22, 0x6e, 0x61, 0x6d, 0x65, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]) });
  await assert.rejects(() => readBoundedAgentWorkforceBody(request), /valid UTF-8/i);
});

test("agent IDs remain valid at the slug and collision boundaries", () => {
  const boundary = slugifyAgentId("a".repeat(79), "b");
  assert.equal(boundary, "a".repeat(79));
  assert.doesNotMatch(boundary, /-$/);
  const base = "a".repeat(80);
  const id = uniqueAgentId(base, [base]);
  assert.equal(id.length, 80);
  assert.equal(id.endsWith("-2"), true);
});


test("Jarvis is reserved from ordinary agent create and edit identities", () => {
  assert.throws(
    () => createAgentWorkforceDocument({ agents: [coreAgent({ id: "jarvis" })] }),
    /jarvis.*reserved|reserved.*jarvis/i,
  );

  const current = createAgentWorkforceDocument({ agents: [coreAgent()] }, "2026-09-11T12:00:00.000Z");
  assert.throws(
    () => updateAgentWorkforceDocument(current, {
      agents: [coreAgent({ id: "jarvis" })],
      skills: [],
      expected_revision: current.revision,
    }, "2026-09-11T12:01:00.000Z"),
    /jarvis.*reserved|reserved.*jarvis/i,
  );
  assert.equal(uniqueAgentId("jarvis", []), "jarvis-2");
});

test("agent editor close policy handles clean, dirty, and save-in-flight states", () => {
  assert.equal(shouldCloseAgentEditor(false, false, false), true);
  assert.equal(shouldCloseAgentEditor(false, true, false), false);
  assert.equal(shouldCloseAgentEditor(false, true, true), true);
  assert.equal(shouldCloseAgentEditor(true, false, true), false);
  assert.equal(shouldCloseAgentEditor(true, true, true), false);
  assert.equal(isAgentEditorDirty("same", "same", true), true);
  assert.equal(shouldCloseAgentEditor(false, isAgentEditorDirty("same", "same", true), false), false);
  assert.equal(isAgentEditorDirty("same", "same", false), false);
});

test("tab-scoped agent drafts are bounded, validated, revision-bound, owner-bound, and view-scoped", () => {
  const { capabilities, inputs, outputs, responsibilities, triggers, ...base } = coreAgent();
  const form = { ...base, capabilities_text: capabilities.join("\n"), inputs_text: inputs.join("\n"), outputs_text: outputs.join("\n"), responsibilities_text: responsibilities.join("\n"), triggers_text: triggers.join("\n") };
  const revision = "2026-09-05T18:00:00.000Z";
  const ownerId = "owner-one";
  const raw = serializeAgentWorkforceDraft(revision, ownerId, "core", form);
  assert.equal(typeof raw, "string");
  assert.deepEqual(parseAgentWorkforceDraft(raw, revision, ownerId, "core"), form);
  for (const field of ["name", "emoji", "role", "department", "mission", "personality", "cadence", "schedule", "next_milestone", "capabilities_text", "inputs_text", "outputs_text", "responsibilities_text", "triggers_text"]) assert.equal(serializeAgentWorkforceDraft(revision, ownerId, "core", { ...form, [field]: `valid\u007fhidden` }), null);
  assert.equal(parseAgentWorkforceDraft(raw, "2026-09-05T19:00:00.000Z", ownerId, "core"), null);
  assert.equal(parseAgentWorkforceDraft(raw, revision, "owner-two", "core"), null);
  assert.equal(parseAgentWorkforceDraft(raw, revision, ownerId, "subagent"), null);
  assert.notEqual(agentWorkforceDraftKey(ownerId, "core"), agentWorkforceDraftKey(ownerId, "subagent"));
  assert.notEqual(agentWorkforceDraftKey(ownerId, "core"), agentWorkforceDraftKey("owner-two", "core"));
  assert.equal(serializeAgentWorkforceDraft(revision, ownerId, "core", { ...form, mission: "x".repeat(1201) }), null);
  assert.equal(serializeAgentWorkforceDraft(revision, ownerId, "core", { ...form, capabilities_text: "x".repeat(4001) }), null);
  assert.equal(parseAgentWorkforceDraft(JSON.stringify({ revision, owner_id: ownerId, view: "core", form: { ...form, surprise: true } }), revision, ownerId, "core"), null);
  assert.equal(parseAgentWorkforceDraft(JSON.stringify({ revision, owner_id: ownerId, view: "core", form, surprise: true }), revision, ownerId, "core"), null);
  assert.equal(parseAgentWorkforceDraft(JSON.stringify({ revision, owner_id: ownerId, view: "core" }), revision, ownerId, "core"), null);
  assert.equal(parseAgentWorkforceDraft(`{"revision":"${revision}","owner_id":"${ownerId}","view":"core","form":${JSON.stringify(form)},"revision":"${revision}"}`, revision, ownerId, "core"), null);
  for (const [key, value] of Object.entries({ id: "other", parent_id: "other-parent", name: "Other", type: "subagent", progress: 99 })) {
    const formJson = JSON.stringify(form);
    const duplicateForm = `{"revision":"${revision}","owner_id":"${ownerId}","view":"core","form":{${JSON.stringify(key)}:${JSON.stringify(value)},${formJson.slice(1)}}`;
    assert.equal(parseAgentWorkforceDraft(duplicateForm, revision, ownerId, "core"), null, `duplicate ${key} must be rejected`);
  }
});

test("draft persistence removes stale snapshots and reports write failures", () => {
  const { capabilities, inputs, outputs, ...base } = coreAgent();
  const form = { ...base, capabilities_text: capabilities.join("\n"), inputs_text: inputs.join("\n"), outputs_text: outputs.join("\n") };
  const revision = "2026-09-05T18:00:00.000Z";
  const ownerId = "owner-one";
  const values = new Map([[agentWorkforceDraftKey(ownerId, "core"), "older-draft"]]);
  const storage = { setItem() { throw new Error("quota"); }, removeItem(key) { values.delete(key); } };
  const result = persistAgentWorkforceDraft(storage, revision, ownerId, "core", form);
  assert.equal(result.ok, false);
  assert.equal(values.has(agentWorkforceDraftKey(ownerId, "core")), false);
  assert.equal(result.staleSnapshotMayRemain, false);
  const blocked = persistAgentWorkforceDraft({ setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } }, revision, ownerId, "core", form);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.staleSnapshotMayRemain, true);
  assert.match(blocked.warning, /older snapshot may remain/i);
});

test("conflict reconciliation reapplies only user changes and identifies overlapping fields", () => {
  const { capabilities, inputs, outputs, ...base } = coreAgent();
  const original = { ...base, capabilities_text: capabilities.join("\n"), inputs_text: inputs.join("\n"), outputs_text: outputs.join("\n") };
  const draft = { ...original, name: "Maya Draft", mission: "Draft mission" };
  const latest = { ...original, name: "Maya Latest", role: "Latest role" };
  const result = reconcileAgentWorkforceDraft(original, draft, latest);
  assert.deepEqual(result.conflicts, ["name"]);
  assert.equal(result.form.name, "Maya Draft");
  assert.equal(result.form.mission, "Draft mission");
  assert.equal(result.form.role, "Latest role");
});

test("the default workforce models Andrew's department heads and practical specialist workers", () => {
  const core = DEFAULT_AGENT_WORKFORCE.agents.filter((agent) => agent.type === "core");
  const subs = DEFAULT_AGENT_WORKFORCE.agents.filter((agent) => agent.type === "subagent");
  assert.deepEqual(core.map((agent) => agent.department), ["Content", "Client Success", "Sales", "Build & Systems"]);
  assert.ok(subs.length >= 12);
  assert.ok(subs.every((agent) => core.some((parent) => parent.id === agent.parent_id)));
  assert.ok(DEFAULT_AGENT_WORKFORCE.agents.some((agent) => /approval/i.test(agent.autonomy)));
});

test("deterministic sales-call observations preserve bounded objection and deal evidence", () => {
  const summary = summarizeReadResult("search_sales_calls", JSON.stringify([{ name: "Taylor", call_date: "2026-09-01", result: "Follow Up", offer: "Launch", deal_amount: 9000, objections: ["Timing", "Cash flow"], objections_notes: "Needs partner approval", recording_url: "https://fathom.video/share/example", call_notes: "Follow up Friday" }]));
  assert.match(summary, /objections: Timing, Cash flow/);
  assert.match(summary, /objection notes: Needs partner approval/);
  assert.match(summary, /deal amount: 9000/);
  assert.match(summary, /recording: https:\/\/fathom\.video\/share\/example/);
  const bounded = summarizeReadResult("search_sales_calls", JSON.stringify([{ name: "Long call", objections_notes: "x".repeat(500), call_notes: "y".repeat(500) }]));
  assert.match(bounded, /… \[truncated\]/);
  assert.match(boundedText("z".repeat(2500), 2000), /… \[truncated\]$/);
  assert.match(buildBoundedObservationBody(Array.from({ length: 4 }, () => "q".repeat(2000))), /… \[truncated\]$/);
  assert.match(buildBoundedObservationBody(Array.from({ length: 10 }, (_, index) => `result ${index}`), 2), /2 additional read results omitted due to the 10-result display limit/);
  const boundedWithOmissions = buildBoundedObservationBody(Array.from({ length: 10 }, () => "w".repeat(2000)), 3);
  assert.match(boundedWithOmissions, /… \[truncated\][\s\S]*3 additional read results omitted due to the 10-result display limit\.$/);
  const eightLeads = summarizeReadResult("list_recent_leads", JSON.stringify(Array.from({ length: 8 }, (_, index) => ({ full_name: `Lead ${index}` }))));
  const eightCalls = summarizeReadResult("list_recent_sales_calls", JSON.stringify(Array.from({ length: 8 }, (_, index) => ({ name: `Call ${index}` }))));
  assert.equal((eightLeads.match(/^•/gm) ?? []).length, 8);
  assert.equal((eightCalls.match(/^•/gm) ?? []).length, 8);
  assert.throws(() => serializeValidatedReadToolResult("search_sales_calls", [{ ...{ name: null, call_date: null, result: null, offer: null, deal_amount: null, objections: null, objections_notes: null, call_notes: null, recording_url: null }, name: "Objection call", objections: Array.from({ length: 11 }, (_, index) => `Objection ${index}`) }]), /objection history exceeds the 10-item safe display limit/);
  for (const objections of [42, true, "not-an-array", ["valid", 42], ["valid", false], ["valid", null], ["valid", { hidden: "value" }]]) {
    assert.throws(() => serializeValidatedReadToolResult("search_sales_calls", [{ ...{ name: null, call_date: null, result: null, offer: null, deal_amount: null, objections: null, objections_notes: null, call_notes: null, recording_url: null }, name: "Malformed", objections }]), /objections must/);
  }
});

test("read-tool provider payloads use exact bounded schemas and strip unused Fathom data", () => {
  const validLead = { full_name: null, prospect_stage: null, quality: null, source: null, notes: null, email: null, phone: null };
  const validCall = { name: null, call_date: null, result: null, offer: null, deal_amount: null, objections: null, objections_notes: null, call_notes: null, recording_url: null };
  const validGhl = { name: null, email: null, phone: null };
  const validSocial = { facebook_url: null, instagram_url: null, linkedin_url: null };
  const validFathom = { title: null, date: null, share_url: null };
  const leads = JSON.parse(serializeValidatedReadToolResult("list_recent_leads", [{ ...validLead, full_name: "A".repeat(500), notes: "N".repeat(5000), secret_legacy: "must not leave" }]));
  assert.deepEqual(Object.keys(leads[0]).sort(), ["full_name", "notes", "prospect_stage", "quality", "source"]);
  assert.match(leads[0].notes, /… \[truncated\]$/);
  assert.doesNotMatch(JSON.stringify(leads), /must not leave/);
  const fathom = JSON.parse(serializeValidatedReadToolResult("list_fathom_recordings", { items: [{ title: "Call", date: "2026-09-05", share_url: "https://fathom.video/share/test", attendees: [{ email: "private@example.com" }], summary: "private summary" }], omitted: 2, more_available: true }));
  assert.deepEqual(Object.keys(fathom).sort(), ["items", "more_available", "omitted"]);
  assert.deepEqual(Object.keys(fathom.items[0]).sort(), ["date", "share_url", "title"]);
  assert.doesNotMatch(JSON.stringify(fathom), /private@example|private summary/);
  assert.match(summarizeReadResult("list_fathom_recordings", JSON.stringify(fathom)), /2 additional recordings.*later Fathom pages/);
  const validRawFathom = { recording_id: 1, title: "Call", recording_start_time: "2026-09-05T12:00:00.000Z", recording_end_time: "2026-09-05T12:30:00.000Z", share_url: "https://fathom.video/share/test", url: "https://fathom.video/calls/1", calendar_invitees: [] };
  assert.deepEqual(parseFathomMeetingList({ items: [validRawFathom] })[0], { recording_id: 1, call_id: "1", title: "Call", date: "2026-09-05T12:00:00.000Z", duration_min: 30, attendees: null, attendees_omitted: 0, blurb: null, share_url: "https://fathom.video/share/test" });
  for (const patch of [{ recording_id: 0 }, { recording_id: "1" }, { title: false }, { title: 0 }, { recording_start_time: "not-a-date" }, { share_url: "javascript:alert(1)" }, { share_url: "https://fathom.video/a b" }]) assert.throws(() => parseFathomMeetingList({ items: [{ ...validRawFathom, ...patch }] }), /Invalid Fathom/);
  for (const key of ["recording_id", "title", "recording_start_time", "recording_end_time", "url", "calendar_invitees"]) { const { [key]: omitted, ...meeting } = validRawFathom; void omitted; assert.throws(() => parseFathomMeetingList({ items: [meeting] }), /Missing Fathom|Invalid Fathom/); }
  assert.equal(parseFathomMeetingList({ items: Array.from({ length: 9 }, (_, index) => ({ ...validRawFathom, recording_id: index + 1, url: `https://fathom.video/calls/${index + 1}` })) }).length, 9);
  assert.throws(() => parseFathomMeetingList({ items: Array.from({ length: 101 }, (_, index) => ({ ...validRawFathom, recording_id: index + 1 })) }), /item count/);
  for (const recording_start_time of ["2026-02-30T12:00:00.000Z", "2026-09-05T12:00:00+00:00", "2026-09-05T12:00:00.000001Z"]) assert.throws(() => parseFathomMeetingList({ items: [{ ...validRawFathom, recording_start_time }] }), /recording_start_time/);
  assert.equal(parseFathomMeetingList({ items: [{ ...validRawFathom, recording_start_time: "2028-02-29T12:00:00Z", recording_end_time: "2028-02-29T12:30:00.0Z" }] })[0].date, "2028-02-29T12:00:00.000Z");
  assert.throws(() => parseFathomMeetingList({ items: [{ ...validRawFathom, recording_end_time: "2026-09-05T11:59:59.999Z" }] }), /duration/);
  for (const share_url of ["https://evil.example/share/test", "https://fathom.video/share/test?x=1", "https://fathom.video/not-share/test"]) assert.throws(() => parseFathomMeetingList({ items: [{ ...validRawFathom, share_url }] }), /share URL|share_url/);
  assert.throws(() => parseFathomMeetingList({ items: [validRawFathom, { ...validRawFathom, title: "Conflict" }] }), /Duplicate/);
  for (const share_url of ["https://fathom.video/share/test?", "https://fathom.video/share/test#"]) assert.throws(() => parseFathomMeetingList({ items: [{ ...validRawFathom, share_url }] }), /share_url/);
  assert.equal(parseFathomMeetingList({ items: [{ ...validRawFathom, url: "https://fathom.video/calls/790639620" }] })[0].recording_id, 1);
  assert.equal(parseFathomMeetingList({ items: [{ ...validRawFathom, url: "https://fathom.video/calls/790639620" }] })[0].share_url, validRawFathom.share_url);
  assert.equal(parseFathomMeetingList({ items: [{ ...validRawFathom, title: "   " }] })[0].title, "Impromptu Meeting");
  const documentedFathom = { ...validRawFathom, url: "https://fathom.video/calls/790639620" };
  assert.equal(parseFathomMeetingList({ items: [documentedFathom] })[0].call_id, "1");
  assert.throws(() => parseFathomMeetingList({ items: [{ ...validRawFathom, url: null }] }), /Invalid Fathom url/);
  assert.throws(() => parseFathomMeetingList({ items: [{ ...validRawFathom, url: "https://fathom.video/calls/01" }] }), /Invalid Fathom url/);
  const manyInvitees = Array.from({ length: 6 }, (_, index) => ({ is_external: true, name: `Person ${index}`, email: `person${index}@example.com` }));
  assert.equal(parseFathomMeetingList({ items: [{ ...validRawFathom, calendar_invitees: manyInvitees }] })[0].attendees_omitted, 2);
  const productionInvitees = Array.from({ length: 186 }, (_, index) => ({ is_external: true, name: `Person ${index}`, email: `person${index}@example.com` }));
  assert.equal(parseFathomMeetingList({ items: [{ ...documentedFathom, calendar_invitees: productionInvitees }] })[0].attendees_omitted, 182);
  assert.throws(() => parseFathomMeetingList({ items: [{ ...validRawFathom, calendar_invitees: Array.from({ length: 501 }, () => ({ is_external: false, name: null, email: null })) }] }), /invitees/);
  assert.throws(() => serializeValidatedReadToolResult("list_recent_sales_calls", Array.from({ length: 8 }, () => ({ ...validCall, name: "😀".repeat(200), offer: "😀".repeat(200), objections_notes: "😀".repeat(1000), call_notes: "😀".repeat(1000) }))), /provider payload limit/);
  const badScalars = [42, true, false, {}, []];
  for (const bad of badScalars) {
    for (const key of ["full_name", "prospect_stage", "quality", "source", "notes", "email", "phone"]) assert.throws(() => serializeValidatedReadToolResult("search_leads", [{ ...validLead, [key]: bad }]), /must be a string or null/);
    for (const key of ["name", "call_date", "result", "offer", "objections_notes", "call_notes", "recording_url"]) assert.throws(() => serializeValidatedReadToolResult("search_sales_calls", [{ ...validCall, [key]: bad }]), /must be a string or null/);
    for (const key of ["firstName", "lastName", "name", "email", "phone"]) assert.throws(() => serializeValidatedReadToolResult("search_ghl", [{ ...validGhl, [key]: bad }]), /must be a string or null/);
    for (const key of ["facebook_url", "instagram_url", "linkedin_url"]) assert.throws(() => serializeValidatedReadToolResult("find_socials", { ...validSocial, [key]: bad }), /must be a string or null/);
    for (const key of ["title", "date", "share_url"]) assert.throws(() => serializeValidatedReadToolResult("list_fathom_recordings", { items: [{ ...validFathom, [key]: bad }], omitted: 0, more_available: false }), /must be a string or null/);
  }
  for (const bad of [true, false, {}, [], "42", Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => serializeValidatedReadToolResult("search_sales_calls", [{ ...validCall, deal_amount: bad }]), /finite number or null/);
  assert.throws(() => serializeValidatedReadToolResult("list_recent_leads", Array.from({ length: 9 }, () => validLead)), /8-record limit/);
  assert.throws(() => serializeValidatedReadToolResult("search_leads", Array.from({ length: 6 }, () => validLead)), /5-record limit/);
  assert.throws(() => serializeValidatedReadToolResult("list_recent_sales_calls", Array.from({ length: 9 }, () => validCall)), /8-record limit/);
  assert.throws(() => serializeValidatedReadToolResult("search_ghl", Array.from({ length: 6 }, () => validGhl)), /5-record limit/);
  assert.throws(() => serializeValidatedReadToolResult("list_fathom_recordings", { items: Array.from({ length: 9 }, () => validFathom), omitted: 0, more_available: false }), /8-record limit/);
  assert.throws(() => serializeValidatedReadToolResult("search_sales_calls", [{ ...validCall, objections: ["bad\nvalue"] }]), /control-free strings/);
  for (const tool of ["search_leads", "search_sales_calls", "search_ghl"]) assert.throws(() => serializeValidatedReadToolResult(tool, [{}, {}, {}, {}, {}, {}, {}, {}, 42]), /Invalid read-tool record/);
  assert.throws(() => serializeValidatedReadToolResult("list_fathom_recordings", { items: [{}, {}, {}, {}, {}, {}, {}, 42], omitted: 1, more_available: false }), /Invalid read-tool record/);
  assert.doesNotThrow(() => serializeValidatedReadToolResult("search_sales_calls", [validCall]));
  for (const key of ["full_name", "prospect_stage", "quality", "source", "notes", "email", "phone"]) { const { [key]: omitted, ...row } = validLead; void omitted; assert.throws(() => serializeValidatedReadToolResult("search_leads", [row]), /is required/); }
  for (const key of Object.keys(validCall)) { const { [key]: omitted, ...row } = validCall; void omitted; assert.throws(() => serializeValidatedReadToolResult("search_sales_calls", [row]), /is required/); }
  for (const key of Object.keys(validSocial)) { const { [key]: omitted, ...row } = validSocial; void omitted; assert.throws(() => serializeValidatedReadToolResult("find_socials", row), /is required/); }
  for (const key of Object.keys(validFathom)) { const { [key]: omitted, ...row } = validFathom; void omitted; assert.throws(() => serializeValidatedReadToolResult("list_fathom_recordings", { items: [row], omitted: 0, more_available: false }), /is required/); }
  for (const value of ["bad\u0000value", "bad\u001fvalue", "bad\u007fvalue", "bad\u0085value"]) assert.throws(() => serializeValidatedReadToolResult("search_leads", [{ ...validLead, notes: value }]), /control characters/);
  for (const value of ["https://example.com/a b", "https://example.com\\path", "https://user@example.com/path", "https://example.com/path#fragment"]) assert.throws(() => serializeValidatedReadToolResult("find_socials", { ...validSocial, facebook_url: value }), /canonical HTTPS URL/);
});

test("Fathom list preview Back restores rows and exact provider-truth disclosures", () => {
  const raw = {
    recording_id: 1,
    title: "Production-shaped meeting",
    recording_start_time: "2026-09-05T12:00:00.000Z",
    recording_end_time: "2026-09-05T12:30:00.000Z",
    share_url: "https://fathom.video/share/opaque-token",
    url: "https://fathom.video/calls/1",
    calendar_invitees: Array.from({ length: 186 }, (_, index) => ({ is_external: true, name: `Person ${index}`, email: `person${index}@example.com` })),
  };
  const meeting = parseFathomMeetingList({ items: [raw] })[0];
  const originalList = { stage: "list", meetings: [meeting], omitted: 2, more_available: true };
  const preview = selectFathomMeetingForPreview(originalList, meeting, { success: true });
  const restored = activateFathomBack(preview);
  assert.strictEqual(restored, originalList);
  assert.deepEqual(restored.meetings.map((item) => item.recording_id), [1]);
  const renderedTruth = `${fathomPageDisclosure(restored)} ${restored.meetings.map((item) => fathomAttendeeOmission(item.attendees_omitted)).join(" ")}`;
  assert.match(renderedTruth, /2 additional recordings from this page omitted/);
  assert.match(renderedTruth, /More recordings are available on later Fathom pages/);
  assert.match(renderedTruth, /182 more external attendees omitted/);
});

test("same-title Fathom recording buttons remain distinguishable by date and time", () => {
  const common = { title: "Impromptu Meeting", duration_min: 30, attendees: null, attendees_omitted: 0 };
  const first = fathomRecordingAccessibleLabel({ ...common, date: "2026-09-05T12:00:00.000Z" });
  const second = fathomRecordingAccessibleLabel({ ...common, date: "2026-09-06T15:30:00.000Z" });
  assert.notEqual(first, second);
  assert.match(first, /Impromptu Meeting.*Sep 5.*30m/);
  assert.match(second, /Impromptu Meeting.*Sep 6.*30m/);
});

test("zero-minute Fathom recordings display and announce their duration", () => {
  const label = fathomRecordingAccessibleLabel({ title: "Short recording", date: "2026-09-05T12:00:00.000Z", duration_min: 0, attendees: null, attendees_omitted: 0 });
  assert.match(label, /Short recording.*Sep 5.*0m/);
});

test("Jarvis request bodies and histories fail closed before model construction", async () => {
  assert.deepEqual(parseJarvisRequest({ transcript: "Check leads", history: [{ role: "user", content: "Earlier" }] }), { transcript: "Check leads", history: [{ role: "user", content: "Earlier" }] });
  for (const value of [
    { transcript: "x", history: [], extra: true },
    { transcript: "x", history: Array.from({ length: 13 }, () => ({ role: "user", content: "x" })) },
    { transcript: "x", history: [{ role: "system", content: "x" }] },
    { transcript: "x", history: [{ role: "user", content: "x", extra: true }] },
    { transcript: "x", history: [{ role: "user", content: "x".repeat(4001) }] },
  ]) assert.throws(() => parseJarvisRequest(value));
  await assert.rejects(() => readBoundedJarvisBody(new Request("https://example.com", { method: "POST", headers: { "content-length": String(MAX_JARVIS_REQUEST_BYTES + 1) }, body: "{}" })), /too large/);
  const duplicate = new Request("https://example.com", { method: "POST", body: '{"transcript":"one","transcript":"two","history":[]}' });
  await assert.rejects(() => readBoundedJarvisBody(duplicate), /Duplicate JSON field/);
});

test("Jarvis exposes only read-only and drafting tools until durable write idempotency exists", () => {
  const route = readFileSync(new URL("../app/api/ai-assistant/route.ts", import.meta.url), "utf8");
  assert.match(route, /case 'list_recent_leads':[\s\S]*select\('id, full_name, prospect_stage, quality, source, notes, ghl_contact_id, created_at'\)/);
  assert.doesNotMatch(route.slice(route.indexOf("case 'list_recent_leads':"), route.indexOf("case 'search_leads':")), /email|phone/);
  assert.doesNotMatch(route, /data\.contacts\.slice\(0, 5\)\.filter/);
  assert.doesNotMatch(route, /data\.list\.slice\(0, 8\)\.filter/);
  const fathomRoute = readFileSync(new URL("../app/api/fathom/list/route.ts", import.meta.url), "utf8");
  assert.match(fathomRoute, /const raw = await readBoundedJson\(response\);[\s\S]*parseFathomMeetingList\(raw\)/);
  assert.doesNotMatch(fathomRoute, /per_page|include_summary/);
  assert.match(fathomRoute, /omitted: Math\.max\(0, list\.length - 8\)/);
  assert.match(fathomRoute, /redirect: "error"/);
  assert.match(fathomRoute, /AbortSignal\.timeout/);
  assert.doesNotMatch(fathomRoute, /response\.text\(\)/);
  const declaredTools = route.slice(route.indexOf("const TOOLS"), route.indexOf("type ActionLog"));
  for (const name of ["create_lead", "update_lead", "add_lead_note", "update_sales_call", "sync_fathom_to_call"]) {
    assert.doesNotMatch(declaredTools, new RegExp(`name: '${name}'`));
  }
  assert.match(route, /if \(WRITE_TOOLS\.has\(name\)\) return/);
  assert.match(route, /Write tools are intentionally unavailable until durable idempotency and approval controls are implemented/);
  assert.match(route, /never send them/);
  assert.match(route, /READ_ONLY_NOTICE/);
  assert.match(route, /changed: 0/);
  assert.match(route, /AI-generated message draft, not sent/);
  assert.match(route, /Model-authored artifacts are never trusted/);
  assert.match(route, /summarizeReadResult/);
  assert.match(route, /objections_notes/);
  assert.match(route, /recording_url/);
  assert.doesNotMatch(route, /fathom_url/);
  assert.match(route, /buildBoundedObservationBody\(observations, omittedObservations\)/);
  assert.match(route, /failed === actionLog\.length \? 'error'/);
  assert.match(route, /The requested lookup failed, so no unverified result is displayed/);
  assert.match(route, /list_recent_leads/);
  assert.match(route, /list_recent_sales_calls/);
  assert.match(route, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(route, /\.order\('call_date', \{ ascending: false \}\)/);
  assert.match(route, /sameOriginBase = req\.nextUrl\.origin/);
  assert.match(route, /if \(!res\.ok\)/);
  assert.match(route, /readBoundedJson/);
  assert.match(route, /buildBoundedObservationBody/);
  assert.match(route, /boundedText\(item\.content, 4000\)/);
  assert.match(route, /serializeValidatedReadToolResult/);
  assert.match(route, /read-tool result validation failed/);
  assert.match(route, /generatedContentOmitted: safeDrafts\.omitted/);
  assert.ok((route.match(/generatedContent: safeDrafts\.items/g) ?? []).length === 2);
  assert.ok((route.match(/generatedContentOmitted: safeDrafts\.omitted/g) ?? []).length === 2);
  assert.match(route, /valid\.length - 10/);
  assert.doesNotMatch(route, /observations\.join\('\\n\\n'\)\.slice/);
  assert.match(route, /safeGeneratedContent/);
});

test("Jarvis becomes a four-tab AI workforce command center with interactive create and edit workflows", () => {
  const pagePath = new URL("../app/jarvis/page.tsx", import.meta.url);
  const routePath = new URL("../app/api/agent-workforce/route.ts", import.meta.url);
  assert.equal(existsSync(pagePath), true);
  assert.equal(existsSync(routePath), true);
  const dashboard = readFileSync(new URL("../components/agent-workforce-dashboard.tsx", import.meta.url), "utf8");
  const settingsPage = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(settingsPage, /saveLocks = useRef/);
  assert.match(settingsPage, /testLocks = useRef/);
  assert.match(settingsPage, /catch \(error\)[\s\S]*dirty: true/);
  assert.match(settingsPage, /finally[\s\S]*saveLocks\.current\.delete/);
  assert.match(settingsPage, /role=\{card\.saveStatus === 'error' \? 'alert' : 'status'\}/);
  assert.match(settingsPage, /disabled=\{busy\}/);
  assert.equal((settingsPage.match(/min-h-11/g) ?? []).length >= 5, true);
  assert.match(settingsPage, /testStatus: 'idle', testMessage: ''/);
  assert.match(settingsPage, /flex min-w-0 flex-col items-stretch gap-3/);
  assert.doesNotMatch(settingsPage, /placeholder-zinc-500|text-zinc-500|text-zinc-600/);
  assert.match(settingsPage, /bg-zinc-800 border border-zinc-500/);
  assert.match(settingsPage, /card\.testStatus === 'error' \? 'alert' : 'status'/);
  assert.match(settingsPage, /flex min-w-0 flex-col items-stretch gap-3 px-5 py-3[\s\S]*sm:flex-row/);
  assert.match(settingsPage, /space-y-1 text-xs break-words \[overflow-wrap:anywhere\]/);
  assert.equal((settingsPage.match(/className=\{`block \$/g) ?? []).length, 2);
  const workspace = readFileSync(new URL("../app/jarvis/jarvis-workspace.tsx", import.meta.url), "utf8");
  const page = readFileSync(pagePath, "utf8") + workspace + dashboard;
  assert.match(page, /border border-cyan-400\/60[\s\S]*focus-within:border-cyan-300/);
  assert.match(page, /workspaceTab === id \? 'border-2 border-cyan-300/);
  const callsPage = readFileSync(new URL("../app/calls/calls-workspace.tsx", import.meta.url), "utf8");
  assert.match(callsPage, /type FathomListState = FathomPickerListState<FathomMeeting>/);
  assert.match(callsPage, /fathomPageDisclosure\(fathomState\)/);
  assert.match(callsPage, /fathomAttendeeOmission\(item\.attendees_omitted\)/);
  assert.match(callsPage, /aria-label=\{fathomRecordingAccessibleLabel\(item\)\}/);
  assert.match(callsPage, /selectFathomMeetingForPreview\(previousList, item, data\.extracted\)/);
  assert.match(callsPage, /onClick=\{\(\) => setFathomState\(activateFathomBack\(fathomState\)\)\}/);
  assert.match(page, /: 'border-2 border-transparent text-zinc-400/);
  const route = readFileSync(routePath, "utf8");
  const settings = readFileSync(new URL("../app/api/settings/route.ts", import.meta.url), "utf8");

  assert.match(page, /Jarvis/);
  assert.match(page, /Core Agents/);
  assert.match(page, /Sub-agents/);
  assert.match(page, /fetch\('\/api\/team'/);
  assert.match(page, /data\?\.me\?\.role === 'owner' && data\.me\.active === true && typeof data\.me\.id === 'string'/);
  assert.match(page, /\{ id: 'core', label: 'Core Agents'/);
  assert.match(page, /function WorkforceLocked/);
  assert.match(page, /Create agent/);
  assert.match(page, /Edit agent/);
  assert.match(page, /\/api\/agent-workforce/);
  assert.match(page, /expected_revision/);
  assert.match(page, /aria-selected/);
  assert.match(page, /jarvisActiveRef\.current = true/);
  assert.match(page, /aria-label="Command for Jarvis"/);
  assert.match(page, /nativeEvent\.isComposing/);
  assert.match(page, /nativeEvent\.keyCode !== 229/);
  assert.match(page, /role="log" aria-live="polite"/);
  assert.match(page, /role=\{message\.alert \? 'alert' : 'article'\} aria-label=/);
  assert.match(page, /Jarvis: /);
  assert.match(page, /You: /);
  assert.match(page, /Failed: /);
  assert.match(page, /Succeeded: /);
  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /min-w-0 max-w-\[82%\] break-words/);
  assert.match(page, /tabIndex=\{workspaceTab === id \? 0 : -1\}/);
  assert.match(page, /jarvisActiveRef\.current = nextTab === 'jarvis'/);
  assert.match(page, /microphoneStartingRef\.current !== null \|\| mediaRecorderRef\.current/);
  assert.match(page, /microphoneEpochRef\.current !== microphoneEpoch/);
  assert.match(page, /operationEpochRef\.current !== epoch/);
  assert.match(page, /commandRunningRef\.current/);
  assert.match(page, /abortControllersRef\.current\.forEach\(\(controller\) => controller\.abort\(\)\)/);
  assert.match(page, /trackedFetch<JarvisResult/);
  assert.match(page, /const data = await readBody\(response\)/);
  assert.match(page, /phase === 'thinking' \|\| phase === 'listening'/);
  assert.match(page, /acquiredStream\?\.getTracks\(\)\.forEach/);
  assert.match(page, /window\.speechSynthesis\?\.cancel\(\)/);
  assert.match(page, /aria-label=\{phase === 'listening' \? 'Stop recording'/);
  assert.doesNotMatch(page, /disabled=\{phase === 'thinking' \|\| phase === 'speaking' \|\| phase === 'listening'\}\s+className=\{`grid h-11/);
  assert.match(page, /stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(page, /discardRecordingRef\.current/);
  assert.match(page, /id="workforce-panel-jarvis"/);
  assert.match(page, /id="workforce-panel-core"/);
  assert.match(page, /id="workforce-panel-subagent"/);
  assert.match(page, /id="workforce-panel-skills"/);
  assert.match(page, /<AgentSkillsCatalog/);
  assert.doesNotMatch(dashboard, /dashboardSection|Skills library.*role="tab"/s);
  assert.match(page, /<dialog/);
  assert.match(page, /showModal\(\)/);
  assert.match(page, /onCancel=/);
  assert.match(page, /if \(editorLocked\) return/);
  assert.match(page, /shouldCloseAgentEditor\(false, isDirty, discardConfirmed\)/);
  assert.match(page, /initialFocusRef\?\.current/);
  assert.match(page, /addEventListener\('focusin'/);
  assert.ok((page.match(/role="alert"/g) ?? []).length >= 3);
  assert.match(page, /min-w-0 flex-1 break-words \[overflow-wrap:anywhere\]/);
  assert.match(page, /Discard your unsaved agent changes/);
  assert.match(page, /initiallyDirty=\{restoredDraft\}/);
  assert.match(page, /setRestoredDraft\(true\)/);
  assert.match(page, /draftReadyRevision !== document\.revision/);
  assert.match(page, /setDraftReadyRevision\(document\.revision\)/);
  assert.match(page, /if \(!document \|\| draftReadyRevision !== document\.revision \|\| recoveryOnlyDraft\) return/);
  assert.ok((dashboard.match(/maxLength=\{4000\}/g) ?? []).length === 5);
  assert.match(page, /persistAgentWorkforceDraft\(window\.sessionStorage/);
  assert.match(page, /Your unsaved agent draft will be kept in this tab/);
  assert.match(page, /agentWorkforceDraftKey\(ownerId, view\)/);
  assert.doesNotMatch(page, /draftCheckedRevisionRef/);
  assert.match(page, /parseAgentWorkforceDraft/);
  assert.match(page, /draftWarning/);
  assert.match(page, /draftWarning && !form/);
  assert.match(page, /ownerId=\{workforceOwnerId\}/);
  assert.match(page, /target\.hasAttribute\('download'\)/);
  assert.match(page, /target\.target\.toLowerCase\(\) !== '_self'/);
  assert.match(page, /destination\.pathname === current\.pathname/);
  assert.match(page, /returnFocusRef=\{editorReturnFocusRef\}/);
  assert.match(page, /fallbackFocusRef=\{searchInputRef\}/);
  assert.match(page, /returnFocusRef=\{detailOpenerRef\}/);
  assert.match(page, /useDialogLifecycle\(dialogRef, onClose, closeButtonRef, returnFocusRef, fallbackFocusRef\)/);
  assert.match(page, /if \(commandRunningRef\.current\) \{[\s\S]+Wait for the result before switching workspaces/);
  assert.match(page, /Wait for the result before starting a new conversation/);
  assert.match(page, /disabled=\{commandInFlight && id !== 'jarvis'\}/);
  assert.match(page, /onClick=\{clearConversation\} disabled=\{commandInFlight\}/);
  assert.match(page, /jarvisCommandGuard/);
  assert.match(page, /useId\(\)/);
  assert.match(page, /commandHistoryGenerationRef/);
  assert.match(page, /Availability checked per request/);
  assert.match(page, /Inspect sales-call outcomes and objections/);
  assert.match(page, /List recent Fathom recordings and links/);
  assert.match(page, /Jarvis <span aria-hidden="true">🤖<\/span>/);
  assert.match(page, /List my newest leads with stage, quality, source, and note excerpts/);
  assert.match(page, /List my recent sales calls with outcomes, bounded objection and note excerpts, deal amounts, and recording links/);
  assert.match(page, /show bounded excerpts of recorded objections and objection notes/);
  assert.doesNotMatch(page, /flag anything that needs attention|tell me what the main objection was|What happened on my most recent/);
  assert.match(page, /min-w-0 break-words text-xs font-medium text-slate-300 \[overflow-wrap:anywhere\]/);
  assert.match(page, /data\.status === 'partial' \|\| data\.status === 'error'/);
  assert.match(page, /role=\{message\.alert \? 'alert' : 'article'\}/);
  assert.match(page, /item\.content\.length <= 4000/);
  assert.match(page, /Object\.keys\(item\)\.sort\(\)\.join\(','\) === 'content,label,type'/);
  assert.match(page, /generatedContentOmitted/);
  assert.match(page, /additional message draft/);
  assert.doesNotMatch(page, /content: item\.content\.slice\(0, 4000\)/);
  assert.match(page, /addEventListener\('beforeunload'/);
  assert.match(page, /addEventListener\('popstate'/);
  assert.match(page, /addEventListener\('click', onDocumentClick, true\)/);
  assert.match(page, /role="log" aria-live="polite" aria-relevant="additions text" aria-label="Completed activity"/);
  assert.match(page, /aria-hidden="true" className="flex items-center gap-3 text-sm text-cyan-300\/80"/);
  assert.match(page, /Completed searches and drafting steps appear here after each command finishes/);
  assert.match(dashboard, /sticky top-0 z-10/);
  assert.match(page, /workforceEditorOpen/);
  assert.match(page, /Close the agent editor before switching workspaces/);
  assert.match(dashboard, /onEditorOpenChange/);
  assert.match(dashboard, /recoveryOnlyDraft/);
  assert.match(dashboard, /Recovery-only draft/);
  assert.match(dashboard, /disabled=\{saving \|\| recoveryOnly\}/);
  assert.match(dashboard, /aria-hidden="true" className="grid h-8 w-8/);
  assert.match(dashboard, /id: `agent-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(dashboard, /parseAgentWorkforceDraft\(raw, null, ownerId, view\)/);
  assert.match(dashboard, /persisted\.ok/);
  assert.match(dashboard, /creating=\{editorMode === 'create'\}/);
  assert.match(dashboard, /This create ID now belongs to different agent data/);
  assert.match(dashboard, /Your stable create request is preserved/);
  assert.match(page, /setGeneratedContent\(drafts\)/);
  assert.match(page, /Copy draft/);
  assert.match(page, /copyGeneratedContent/);
  assert.match(page, /aria-hidden="true" className=\{`grid h-24/);
  assert.match(page, /aria-hidden="true" className="text-2xl opacity-50"/);
  assert.match(page, /previousFocus\?\.isConnected/);
  assert.match(page, /previousFocus !== document\.body/);
  assert.match(page, /detailOpenerRef\.current/);
  assert.match(page, /openCreate\(event\.currentTarget\)/);
  assert.match(page, /editorReturnFocusRef\.current = null/);
  assert.match(page, /mt-1\.5 min-h-11 w-full/);
  assert.ok((dashboard.match(/border border-zinc-500 bg-\[#18181b\]/g) ?? []).length >= 3);
  assert.match(page, /if \(recorder\) \{[\s\S]+recorder\.state !== 'inactive'/);
  assert.match(page, /microphoneStartingRef\.current === microphoneEpoch/);
  assert.match(page, /microphoneStartingRef\.current = null/);
  assert.match(page, /mediaRecorderRef\.current === recorder/);
  assert.match(page, /streamRef\.current === stream/);
  assert.match(page, /const ownsGeneration = microphoneEpochRef\.current === microphoneEpoch/);
  assert.match(page, /mediaRecorderRef\.current = null;[\s\S]+recorder\.stop\(\)/);
  assert.match(page, /jarvisActiveRef\.current = true/);
  assert.match(page, /border-zinc-500 bg-\[#18181b\]/);
  assert.match(page, /response\.status === 409/);
  assert.match(page, /reconcileAgentWorkforceDraft/);
  assert.match(page, /setDraftReadyRevision\(reloadData\.document\.revision\);[\s\S]*setDocument\(reloadData\.document\);[\s\S]*setForm\(reconciled\)/);
  assert.match(page, /finalizeSavedDocument/);
  assert.match(page, /persistAgentWorkforceDraft\(window\.sessionStorage, storageRevision, ownerId, view, null\)/);
  assert.match(page, /if \(!cleared\.ok\)[\s\S]*pendingSavedDocumentRef\.current = savedDocument[\s\S]*setDraftWarning\(cleared\.warning\)/);
  assert.match(page, /if \(pendingSavedDocumentRef\.current\) \{ finalizeSavedDocument\(pendingSavedDocumentRef\.current\); return; \}/);
  assert.match(page, /setDraftReadyRevision\(savedDocument\.revision\);[\s\S]*setDocument\(savedDocument\);[\s\S]*setForm\(null\)/);
  assert.doesNotMatch(page, /sessionStorage\.removeItem/);
  assert.match(page, /const editorLocked = saving \|\| cleanupPending/);
  assert.match(page, /<fieldset disabled=\{editorLocked\}/);
  assert.match(page, /cleanupPending \? 'Retry cleanup'/);
  assert.match(page, /setCleanupPending\(true\)/);
  assert.match(page, /cleanupPending=\{cleanupPending\}/);
  assert.match(page, /your draft .*latest /i);
  assert.match(page, /latest agent could not be safely reconciled/i);
  assert.match(page, /safe-area-inset-left/);
  assert.match(page, /safe-area-inset-right/);
  assert.match(page, /safe-area-inset-bottom/);
  assert.match(dashboard, /maxHeight: 'calc\(100dvh - 1\.5rem - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)'/);
  assert.match(page, /<fieldset disabled=\{editorLocked\}/);
  assert.match(page, /savingRef\.current/);
  const reloadBlock = dashboard.slice(dashboard.indexOf('const load = useCallback'), dashboard.indexOf('useEffect(() => {', dashboard.indexOf('const load = useCallback')));
  assert.doesNotMatch(reloadBlock, /savingRef|setSaving/);
  assert.ok((dashboard.match(/\[overflow-wrap:anywhere\]/g) ?? []).length >= 10);
  assert.match(dashboard, /h-16 w-16 shrink-0 place-items-center overflow-hidden whitespace-nowrap text-ellipsis/);
  assert.match(dashboard, /max-w-full break-words text-xs text-zinc-400 \[overflow-wrap:anywhere\]/);
  assert.match(dashboard, /Reports to \{parentName\}/);
  assert.doesNotMatch(dashboard, /text-zinc-[567]00/);
  assert.match(page, /addEventListener\('beforeunload'/);
  assert.match(page, /agentEditorGuard/);
  assert.match(page, /history\.pushState/);
  assert.match(page, /historyGuardGenerationRef/);
  assert.match(page, /queueMicrotask/);
  assert.match(page, /guardGeneration\.current !== generation/);
  assert.match(page, /addEventListener\('popstate'/);
  assert.match(page, /event\.state\?\.agentEditorGuard === guardId/);
  assert.match(page, /history\.state\?\.agentEditorGuard === guardId/);
  assert.match(page, /document\.addEventListener\('click', onDocumentClick, true\)/);
  assert.match(page, /text-base text-zinc-100.*sm:text-sm/);
  assert.ok((dashboard.match(/min-h-11/g) ?? []).length >= 10);
  assert.match(page, /min-h-11 rounded-lg[^\n]+New conversation/);
  assert.match(page, /min-h-11 rounded-full[^\n]+starter/);
  assert.doesNotMatch(page, /text-slate-(?:600|700)/);
  // A released blueprint must never be presented as a running process.
  assert.match(page, /live: 'Released'/);
  assert.doesNotMatch(page, /Built and live/);
  assert.doesNotMatch(page, /Currently running|Online now|Healthy/);
  assert.match(route, /AGENT_WORKFORCE_KEY/);
  assert.match(route, /Agent workforce storage is temporarily unavailable/);
  assert.match(route, /databaseError\("(?:read|update-read|update|insert)"/);
  assert.doesNotMatch(route, /readError\.message/);
  assert.doesNotMatch(route, /error: error\.message/);
  assert.match(route, /readBoundedAgentWorkforceBody/);
  assert.match(route, /Request body must use valid UTF-8/);
  assert.match(route, /parseJsonWithUniqueKeys/);
  assert.match(route, /expected_revision/);
  assert.match(route, /query\.is\("updated_at", null\)/);
  assert.match(settings, /MANAGEABLE_SETTINGS_KEYS/);
  assert.match(settings, /MANAGEABLE_SETTINGS_KEY_SET\.has/);
  assert.doesNotMatch(settings, /AI_WORKFORCE_V1/);
  assert.doesNotMatch(page, /\.slice\(0, 20\)/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});
