import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guardedFiles = [
  "app/my/page.tsx",
  "app/my/team/page.tsx",
  "app/(admin)/admin/ops/page.tsx",
] as const;

const forbiddenPatterns = [
  /127\.0\.0\.1:3000/,
  /localhost:3000/,
  /NEXT_PUBLIC_APP_URL\s*\?\?\s*"http:\/\/localhost:3000"/,
];

test("server component internal API fetches do not use localhost production fallbacks", () => {
  for (const file of guardedFiles) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(source),
        false,
        `${file} contains forbidden localhost internal fetch fallback matching ${pattern}`,
      );
    }
  }
});
