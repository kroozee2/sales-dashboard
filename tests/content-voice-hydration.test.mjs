import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const content = readFileSync(new URL("../app/content/page.tsx", import.meta.url), "utf8");
const useVoice = content.match(/function useVoice\([\s\S]*?\n}\n\n/)?.[0] ?? "";

test("Content voice support initializes identically on server and first client render", () => {
  assert.match(useVoice, /const \[supported, setSupported\] = useState\(false\)/);
  assert.match(useVoice, /useEffect\(\(\) => \{\s*setSupported\(/);
  assert.doesNotMatch(useVoice, /const supported = typeof window/);
});
