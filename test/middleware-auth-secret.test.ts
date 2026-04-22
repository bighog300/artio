import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("middleware resolves auth secret via shared helper", () => {
  const source = readFileSync("middleware.ts", "utf8");
  assert.match(source, /getResolvedAuthSecret/);
  assert.doesNotMatch(source, /process\.env\.AUTH_SECRET/);
});
