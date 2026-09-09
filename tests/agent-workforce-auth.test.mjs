import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createHmac } from "node:crypto";

import { agentWorkforceAuthorization } from "../lib/agent-workforce-auth.ts";
import { MANAGEABLE_SETTINGS_KEYS, manageableSettingValueIsValid } from "../lib/settings-policy.ts";
import { IDENTITY_SECRET_CONFLICT_ENV_NAMES, identitySecretConflictsWithStoredValues, identitySigningConfigured, readUserCookie, signUser, teamAccountMutationAllowed, tempPassword } from "../lib/team-auth.ts";

test("AI workforce access requires an active owner identity", () => {
  assert.deepEqual(agentWorkforceAuthorization(null), {
    status: 401,
    error: "Sign in with an owner account.",
  });
  assert.equal(agentWorkforceAuthorization({ role: "member", active: true })?.status, 403);
  assert.equal(agentWorkforceAuthorization({ role: "owner", active: false })?.status, 403);
  assert.equal(agentWorkforceAuthorization({ role: "owner", active: true }), null);
});

test("the workforce route checks the signed member cookie for both reads and writes", () => {
  const route = readFileSync(new URL("../app/api/agent-workforce/route.ts", import.meta.url), "utf8");
  assert.match(route, /currentMember\(req\.cookies\.get\("sos_user"\)\?\.value\)/);
  assert.match(route, /export async function GET\(req: NextRequest\)/);
  assert.match(route, /export async function PUT\(req: NextRequest\)/);
  assert.equal((route.match(/await ownerError\(req\)/g) ?? []).length, 2);
  assert.match(route, /identitySigningConfigured/);
  assert.match(route, /Owner identity service unavailable/);
});

test("identity cookies require a separate server-only signing secret", () => {
  const previousIdentity = process.env.SALESOS_IDENTITY_SECRET;
  const previousSession = process.env.SALESOS_SESSION_TOKEN;
  try {
    delete process.env.SALESOS_IDENTITY_SECRET;
    process.env.SALESOS_SESSION_TOKEN = "s".repeat(48);
    assert.equal(identitySigningConfigured(), false);
    assert.throws(() => signUser("owner-id"), /IDENTITY_SECRET/);
    assert.equal(readUserCookie("v1.owner-id.anything"), null);

    process.env.SALESOS_IDENTITY_SECRET = "i".repeat(48);
    assert.equal(identitySigningConfigured(), true);
    const signed = signUser("owner-id");
    assert.equal(readUserCookie(signed), "owner-id");
    process.env.SALESOS_IDENTITY_SECRET = process.env.SALESOS_SESSION_TOKEN;
    assert.equal(identitySigningConfigured(), false);
    assert.equal(readUserCookie(signed), null);
    assert.throws(() => signUser("owner-id"), /IDENTITY_SECRET/);
    process.env.SALESOS_IDENTITY_SECRET = "i".repeat(48);
    const payload = "v1.owner-id";
    const forged = `${payload}.${createHmac("sha256", process.env.SALESOS_SESSION_TOKEN).update(payload).digest("hex")}`;
    assert.equal(readUserCookie(forged), null);
    assert.equal(readUserCookie(signed.replace(/.$/, signed.endsWith("0") ? "1" : "0")), null);
    for (const name of IDENTITY_SECRET_CONFLICT_ENV_NAMES) {
      const previous = process.env[name];
      process.env.SALESOS_IDENTITY_SECRET = "q".repeat(48);
      process.env[name] = process.env.SALESOS_IDENTITY_SECRET;
      assert.equal(identitySigningConfigured(), false, `${name} must not double as the identity secret`);
      assert.throws(() => signUser("owner-id"), /IDENTITY_SECRET/);
      if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
    }
  } finally {
    if (previousIdentity === undefined) delete process.env.SALESOS_IDENTITY_SECRET; else process.env.SALESOS_IDENTITY_SECRET = previousIdentity;
    if (previousSession === undefined) delete process.env.SALESOS_SESSION_TOKEN; else process.env.SALESOS_SESSION_TOKEN = previousSession;
  }
});

test("identity signing also fails closed against database-stored credentials and generic settings are owner-only", () => {
  const teamAuth = readFileSync(new URL("../lib/team-auth.ts", import.meta.url), "utf8");
  const settingConflictBlock = teamAuth.slice(teamAuth.indexOf("IDENTITY_SECRET_CONFLICT_SETTING_KEYS"), teamAuth.indexOf("function identitySecret"));
  for (const key of ["ANTHROPIC_API_KEY", "GHL_API_KEY", "GOOGLE_CALENDAR_ICAL_URL", "STRIPE_SECRET_KEY"]) assert.ok(settingConflictBlock.includes(key));
  assert.match(teamAuth, /identitySigningConfiguredWithSettings/);
  const secret = "z".repeat(48);
  assert.equal(identitySecretConflictsWithStoredValues(secret, ["other", secret]), true);
  assert.equal(identitySecretConflictsWithStoredValues(secret, ["other", "https://calendar.example/secret.ics"]), false);
  assert.match(teamAuth, /from\("settings"\)\.select\("value"\)/);
  const settingsRoute = readFileSync(new URL("../app/api/settings/route.ts", import.meta.url), "utf8");
  assert.match(settingsRoute, /Only an active owner can manage settings/);
  assert.equal((settingsRoute.match(/await requireOwner\(req\)/g) ?? []).length, 2);
  assert.match(settingsRoute, /MANAGEABLE_SETTINGS_KEY_SET\.has\(key\)/);
  assert.match(settingsRoute, /Unsupported settings key/);
  assert.match(settingsRoute, /parseJsonWithUniqueKeys/);
  for (const key of MANAGEABLE_SETTINGS_KEYS) for (const control of ["\t", "\n", "\r", "\u007f", "\u0085"]) assert.equal(manageableSettingValueIsValid(`value${control}hidden`), false, `${key} must reject raw controls`);
  assert.equal(manageableSettingValueIsValid("valid-setting-value"), true);
  assert.match(settingsRoute, /req\.body\.getReader\(\)/);
  assert.match(teamAuth, /from\("settings"\)\.select\("value"\);/);
  const testRoute = readFileSync(new URL("../app/api/settings/test/route.ts", import.meta.url), "utf8");
  assert.match(testRoute, /Only an active owner can test settings/);
  assert.match(testRoute, /url\.hostname !== 'calendar\.google\.com'/);
  assert.match(testRoute, /redirect: 'error'/);
  assert.match(testRoute, /url\.href !== raw/);
  assert.match(testRoute, /%2e\|%2f\|%5c/i);
  assert.match(testRoute, /basic\\.ics/);
  assert.match(testRoute, /readBoundedStream/);
  assert.match(testRoute, /parseJsonWithUniqueKeys/);
});

test("temporary passwords are high entropy and login is database throttled", () => {
  const generated = new Set(Array.from({ length: 100 }, () => tempPassword()));
  assert.equal(generated.size, 100);
  for (const value of generated) assert.match(value, /^7FC-[A-Za-z0-9_-]{32}$/);
  const route = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
  assert.match(route, /loginRateLimited/);
  assert.match(route, /type: "login_attempt"/);
  assert.match(route, /count: "exact", head: true/);
  assert.match(route, /status: 429/);
  assert.match(route, /readLoginBody/);
  assert.doesNotMatch(route, /await req\.json\(\)/);
  assert.match(route, /if \(email\) \{[\s\S]*return NextResponse\.json\(\{ error: "That email and password don't match\." \}[\s\S]*Master password/);
  assert.match(route, /\.eq\("email", email\)/);
  assert.doesNotMatch(route, /\.ilike\("email"/);
  assert.match(route, /login:member:/);
});

test("login fails closed when dedicated identity signing is unavailable", () => {
  const route = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
  assert.match(route, /identitySigningConfigured/);
  assert.match(route, /Server identity signing is not configured/);
});

test("team account mutations prevent self-promotion and reactivation", () => {
  const member = { id: "member-id", role: "member", active: true };
  const inactiveOwner = { id: "owner-id", role: "owner", active: false };
  const owner = { id: "owner-id", role: "owner", active: true };
  assert.equal(teamAccountMutationAllowed(member, member.id, ["name", "title"]), true);
  assert.equal(teamAccountMutationAllowed(member, member.id, ["role"]), false);
  assert.equal(teamAccountMutationAllowed(member, member.id, ["active"]), false);
  assert.equal(teamAccountMutationAllowed(member, "owner-id", ["name"]), false);
  assert.equal(teamAccountMutationAllowed(inactiveOwner, inactiveOwner.id, ["active"]), false);
  assert.equal(teamAccountMutationAllowed(owner, member.id, ["role", "active"]), true);
  const route = readFileSync(new URL("../app/api/team/route.ts", import.meta.url), "utf8");
  assert.match(route, /teamAccountMutationAllowed\(me, b\.id, Object\.keys\(clean\)\)/);
  assert.match(route, /!me\.active \|\| me\.role !== "owner"/);
});

test("identity secret collision coverage matches the independent credential inventory", () => {
  const expected = [
    "AIRTABLE_PAT",
    "ANTHROPIC_API_KEY",
    "APIFY_TOKEN",
    "CARTESIA_API_KEY",
    "CFF_ADMIN_PASSWORD",
    "CRON_SECRET",
    "FATHOM_API_KEY",
    "FIRECRAWL_API_KEY",
    "FLOW_ADMIN_SECRET",
    "GEMINI_API_KEY",
    "GOOGLE_CALENDAR_ICAL_URL",
    "GHL_API_KEY",
    "HELM_ENROLL_SECRET",
    "HELM_SALESOS_SECRET",
    "INSTAGRAM_HOT_LEADS_WORKER_KEY",
    "NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY",
    "PANDADOC_API_KEY",
    "SALESOS_AGENT_KEY",
    "SALESOS_PASSWORD",
    "SALESOS_SESSION_TOKEN",
    "SKOOL_ADMIN_SECRET",
    "STRIPE_SECRET_KEY",
    "SUPABASE_CALLS_SERVICE_KEY",
    "UNIPILE_API_KEY",
  ].sort();
  assert.deepEqual([...IDENTITY_SECRET_CONFLICT_ENV_NAMES].sort(), expected);

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const discovered = new Set();
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".next", "node_modules"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:[cm]?[jt]s|tsx)$/.test(entry.name)) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
          const name = match[1];
          if (name !== "SALESOS_IDENTITY_SECRET" && /(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_PAT|_ICAL_URL)$/.test(name)) discovered.add(name);
        }
      }
    }
  };
  visit(root);
  assert.deepEqual([...discovered].sort(), expected);
});
