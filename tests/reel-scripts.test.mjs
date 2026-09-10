import assert from "node:assert/strict";
import test from "node:test";
import {
  CTA_LINES,
  blankScript,
  estimateSeconds,
  formatScript,
  isCtaKind,
  isScriptCategory,
  isScriptStatus,
  normalizeShootDate,
  normalizeSteps,
  pickEditableScriptFields,
  scriptProgress,
  seedFromIdea,
  seedFromModelPost,
} from "../lib/reel-scripts.ts";

test("steps survive whatever shape they arrive in", () => {
  assert.deepEqual(normalizeSteps(null), []);
  assert.deepEqual(normalizeSteps("not an array"), []);
  assert.deepEqual(normalizeSteps([{ say: " Watch this. ", show: " screen " }]), [
    { say: "Watch this.", show: "screen" },
  ]);
});

test("a step with neither half is dropped, not kept as an empty row", () => {
  const steps = normalizeSteps([
    { say: "keep", show: "" },
    { say: "", show: "" },
    { say: "   ", show: "  " },
    { say: "", show: "also keep" },
  ]);
  assert.deepEqual(steps, [{ say: "keep", show: "" }, { say: "", show: "also keep" }]);
});

test("steps are capped so one runaway payload cannot fill the sheet", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ say: `line ${i}`, show: "x" }));
  assert.equal(normalizeSteps(many).length, 40);
});

test("non-object entries in the steps array are ignored", () => {
  assert.deepEqual(normalizeSteps(["a string", 42, null, ["nested"], { say: "real", show: "" }]), [
    { say: "real", show: "" },
  ]);
});

test("a new script already carries a CTA so the last section is never blank", () => {
  const script = blankScript("How I built a dashboard in 30 minutes");
  assert.equal(script.status, "draft");
  assert.equal(script.category, "value");
  assert.equal(script.cta, CTA_LINES.follow);
  assert.equal(script.cta_kind, "follow");
  assert.deepEqual(script.steps, []);
});

test("a script cannot be created without a title", () => {
  assert.throws(() => blankScript("   "), /needs a title/);
  assert.throws(() => blankScript(""), /needs a title/);
});

test("only editable fields survive a PATCH", () => {
  const picked = pickEditableScriptFields({
    title: "Real title",
    hook: "Real hook",
    id: "should-not-pass",
    created_at: "should-not-pass",
    updated_at: "should-not-pass",
    made_up_column: "should-not-pass",
  });
  assert.deepEqual(Object.keys(picked).sort(), ["hook", "title"]);
});

test("an unsupported category, status or CTA is refused rather than silently coerced", () => {
  assert.throws(() => pickEditableScriptFields({ category: "nonsense" }), /Category is unsupported/);
  assert.throws(() => pickEditableScriptFields({ status: "nonsense" }), /Status is unsupported/);
  assert.throws(() => pickEditableScriptFields({ cta_kind: "nonsense" }), /CTA is unsupported/);
  assert.throws(() => pickEditableScriptFields({ source_kind: "nonsense" }), /Source is unsupported/);
});

test("an empty title on PATCH is refused, so a script cannot be blanked out", () => {
  assert.throws(() => pickEditableScriptFields({ title: "   " }), /needs a title/);
});

test("shoot dates are validated, and clearing one is allowed", () => {
  assert.equal(normalizeShootDate("2026-09-10"), "2026-09-10");
  assert.equal(normalizeShootDate(null), null);
  assert.equal(normalizeShootDate(""), null);
  assert.throws(() => normalizeShootDate("10/09/2026"), /invalid/);
  assert.throws(() => normalizeShootDate("2026-02-31"), /invalid/);
});

test("the type guards agree with the exported lists", () => {
  assert.ok(isScriptCategory("proof"));
  assert.ok(!isScriptCategory("question"));
  assert.ok(isScriptStatus("shot"));
  assert.ok(!isScriptStatus("drafted"));
  assert.ok(isCtaKind("skool"));
  assert.ok(!isCtaKind("dm"));
});

test("seeding from an idea carries the idea's date and category across", () => {
  const script = seedFromIdea({
    id: "idea-1",
    title: "The 3 systems that got Rae to $155k",
    category: "proof",
    scheduled_date: "2026-09-15",
  });
  assert.equal(script.source_kind, "idea");
  assert.equal(script.source_ref, "idea-1");
  assert.equal(script.idea_id, "idea-1");
  assert.equal(script.category, "proof");
  assert.equal(script.shoot_date, "2026-09-15");
});

test("an idea with a category we do not use falls back to value", () => {
  const script = seedFromIdea({ id: "idea-2", title: "Something", category: "question" });
  assert.equal(script.category, "value");
  assert.equal(script.shoot_date, null);
});

test("modelling a post keeps their hook as a note, never as our hook", () => {
  const script = seedFromModelPost({
    id: "post-9",
    handle: "saminyasar_",
    hook: "Nobody is showing you how to actually automate with AI.",
    theme: "Contrarian take",
    views: 412000,
    post_url: "https://instagram.com/p/abc",
  });
  assert.equal(script.source_kind, "model");
  assert.equal(script.source_ref, "post-9");
  assert.equal(script.hook, "", "their words must not land in our hook field");
  assert.match(String(script.source_note), /@saminyasar_/);
  assert.match(String(script.source_note), /Contrarian take/);
  assert.match(String(script.source_note), /412,000 views/);
});

test("a modelled post with no hook still produces a usable title", () => {
  const script = seedFromModelPost({ id: "post-10", handle: "john.whiting" });
  assert.equal(script.title, "Model @john.whiting");
  assert.equal(script.source_note, "Modelled on @john.whiting");
});

test("progress counts the three things the format requires", () => {
  assert.deepEqual(scriptProgress({ hook: "", steps: [], cta: "" }), { done: 0, total: 3, pct: 0, shootable: false });
  assert.deepEqual(
    scriptProgress({ hook: "A hook", steps: [{ say: "x", show: "y" }], cta: "Follow me" }),
    { done: 3, total: 3, pct: 100, shootable: true },
  );
});

test("a hook and CTA of only whitespace do not count as done", () => {
  const progress = scriptProgress({ hook: "   ", steps: [{ say: "x", show: "y" }], cta: "  " });
  assert.equal(progress.done, 1);
  assert.equal(progress.shootable, false);
});

test("the filming sheet puts the face on camera for the hook and the CTA", () => {
  const text = formatScript({
    title: "Claude built my dashboard",
    hook: "I built a sales dashboard in 30 minutes using Claude Code.",
    steps: [{ say: "Here is what it looks like.", show: "the live dashboard" }],
    cta: CTA_LINES.skool,
  });
  const lines = text.split("\n");
  assert.equal(lines[lines.indexOf("HOOK") + 1], "Show: Face on camera the whole time");
  assert.equal(lines[lines.indexOf("CALL TO ACTION") + 1], "Show: Face back on camera, point to bio");
  assert.ok(text.includes('Say: "Here is what it looks like."'));
  assert.ok(text.includes("Show: the live dashboard"));
});

test("a script with no steps still formats without pretending it is ready", () => {
  const text = formatScript({ title: "T", hook: "H", steps: [], cta: "C" });
  assert.ok(text.includes("(no steps yet)"));
});

test("run time is estimated from the words actually spoken", () => {
  const short = estimateSeconds({ hook: "Watch this.", steps: [], cta: "Follow me." });
  const long = estimateSeconds({
    hook: "Watch this.",
    steps: Array.from({ length: 10 }, () => ({ say: "one two three four five six", show: "screen" })),
    cta: "Follow me.",
  });
  assert.ok(long > short, "more spoken words must read as a longer reel");
  // Show directions are stage notes, not spoken, so they must not add time.
  const withLongShow = estimateSeconds({
    hook: "Watch this.",
    steps: [{ say: "", show: "a very long screen direction ".repeat(20) }],
    cta: "Follow me.",
  });
  assert.equal(withLongShow, short);
});
