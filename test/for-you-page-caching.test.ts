import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("for-you page disables caching for auth gate", () => {
  const pagePath = join(process.cwd(), "app/for-you/page.tsx");
  const contents = readFileSync(pagePath, "utf8");

  assert.match(contents, /export const dynamic = ["']force-dynamic["'];/);
  assert.match(contents, /export const revalidate = 0;/);
  assert.match(contents, /noStore\(\);/);
});
