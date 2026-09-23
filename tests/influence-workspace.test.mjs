import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const catalogPath = join(process.cwd(), "lib", "influence-strategies.ts");

const root = process.cwd();

test("Offers exposes an accessible Influence library tab without changing the default view", () => {
  const offers = readFileSync(join(root, "app", "offers", "page.tsx"), "utf8");

  assert.match(offers, /import InfluenceWorkspace from ['"]@\/components\/InfluenceWorkspace['"]/);
  assert.match(offers, /\['influence', 'Influence'\]/);
  assert.match(offers, /<InfluenceWorkspace\s*\/>/);
  assert.match(
    offers,
    /useState<'one-sheets' \| 'pages' \| 'influence' \| 'grid' \| 'current' \| 'data'>\('one-sheets'\)/,
  );
  assert.match(offers, /role="tablist"/);
  assert.match(offers, /aria-selected=\{view === k\}/);
  assert.match(offers, /aria-controls="offers-panel"/);
  assert.match(offers, /id="offers-panel"/);
  assert.doesNotMatch(offers, /aria-controls=\{`offers-panel-\$\{k\}`\}/);
  assert.match(offers, /onKeyDown=\{handleViewKeyDown\}/);
  assert.match(offers, /!\['one-sheets', 'pages', 'influence'\]\.includes\(view\)/);
});

test("Influence catalog is complete, unique, searchable, and tailored", async () => {
  assert.ok(existsSync(catalogPath), "create the typed influence catalog");
  const {
    INFLUENCE_CATEGORIES,
    INFLUENCE_BUILDER_FIELDS,
    ETHICAL_INFLUENCE_GUARDRAILS,
    filterInfluenceTactics,
  } = await import("../lib/influence-strategies.ts");

  assert.equal(INFLUENCE_CATEGORIES.length, 8);
  assert.deepEqual(
    INFLUENCE_CATEGORIES.map((category) => category.title),
    [
      "Proper State",
      "Initial Engagement",
      "Sustainable Engagement",
      "If-Only Frames",
      "Open Loops",
      "Perceived Value",
      "Increasing Belief",
      "Moving to Action",
    ],
  );
  assert.ok(INFLUENCE_CATEGORIES.every((category) => category.tactics.length === 10));
  const tactics = INFLUENCE_CATEGORIES.flatMap((category) => category.tactics);
  assert.equal(tactics.length, 80);
  assert.equal(new Set(tactics.map((tactic) => tactic.id)).size, 80);
  assert.ok(tactics.every((tactic) => tactic.title && tactic.explanation && tactic.example));
  assert.ok(tactics.every((tactic) => /7-Figure|profit|peace|purpose|Connect Daily|Convert Weekly|Compound Monthly|coach|consultant|AI|\$50K|\$100K/i.test(tactic.example)));

  assert.deepEqual(
    INFLUENCE_BUILDER_FIELDS.map((field) => field.id),
    ["audience", "currentState", "desiredState", "ifOnly", "reframe", "openLoop", "proof", "nextAction"],
  );
  assert.ok(INFLUENCE_BUILDER_FIELDS.every((field) => field.label && field.placeholder));
  assert.deepEqual(ETHICAL_INFLUENCE_GUARDRAILS.map((item) => item.title), [
    "Truthful pain",
    "Real proof",
    "Genuine urgency",
    "Close every loop",
    "Appropriate action",
  ]);

  assert.equal(filterInfluenceTactics(INFLUENCE_CATEGORIES, "all", "weekly conversion").length > 0, true);
  assert.equal(filterInfluenceTactics(INFLUENCE_CATEGORIES, "open-loops", "").length, 10);
  assert.equal(filterInfluenceTactics(INFLUENCE_CATEGORIES, "all", "no-such-influence-tactic").length, 0);
});

test("Offers and Influence toolbars can shrink without creating mobile document overflow", () => {
  const offers = readFileSync(join(root, "app", "offers", "page.tsx"), "utf8");
  const workspace = readFileSync(join(root, "components", "InfluenceWorkspace.tsx"), "utf8");

  assert.match(offers, /flex min-w-0 w-full items-center gap-2 flex-wrap sm:w-auto/);
  assert.match(offers, /flex min-w-0 flex-1 gap-0\.5 overflow-x-auto/);
  assert.match(workspace, /grid w-full grid-cols-2 gap-2 lg:w-auto/);
  assert.doesNotMatch(workspace, /text-zinc-(500|600)|placeholder:text-zinc-600/);
  assert.match(workspace, /border-zinc-500/);
});

test("brief assembly uses only entered values and omits empty fields", async () => {
  assert.ok(existsSync(catalogPath), "create the typed influence catalog");
  const { buildInfluenceBrief } = await import("../lib/influence-strategies.ts");
  const brief = buildInfluenceBrief({
    audience: "Heart-centered consultants",
    currentState: "Revenue depends on launches",
    desiredState: "A peaceful weekly rhythm",
    ifOnly: "I had more leads",
    reframe: "The conversion rhythm is the constraint",
    openLoop: "There are three places predictability breaks",
    proof: "A verified client result",
    nextAction: "Map the weekly conversion event",
  });
  assert.match(brief, /Audience: Heart-centered consultants/);
  assert.match(brief, /Current state: Revenue depends on launches/);
  assert.match(brief, /Next action: Map the weekly conversion event/);
  assert.doesNotMatch(brief, /undefined|null|placeholder/i);

  assert.equal(buildInfluenceBrief({ audience: "Coaches" }), "Audience: Coaches");
  assert.equal(buildInfluenceBrief({}), "");
});
