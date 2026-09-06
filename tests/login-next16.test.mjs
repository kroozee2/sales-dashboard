import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginPage = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("the login redirect is safe when Next returns null search params", () => {
  assert.match(loginPage, /params\?\.get\("next"\)/);
});

test("navigation components normalize nullable Next 16 pathnames", () => {
  for (const path of [
    "../components/activity-tracker.tsx",
    "../components/AIAssistant.tsx",
    "../components/sub-tabs.tsx",
    "../components/sidebar.tsx",
  ]) {
    const file = source(path);
    const pathnameCalls = file.match(/const pathname = usePathname\(\);/g) ?? [];
    assert.equal(pathnameCalls.length, 0, `${path} leaves a nullable pathname`);
    assert.match(file, /const pathname = usePathname\(\) \?\? "";/);
  }
});
