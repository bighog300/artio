import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("POST creates tag and validates duplicate slug as 409", () => {
  const source = readFileSync("app/api/admin/tags/route.ts", "utf8");
  assert.match(source, /export async function POST/);
  assert.match(source, /await db\.tag\.create\(\{ data: parsed\.data \}\)/);
  assert.match(source, /apiError\(409, "conflict", "Tag slug already exists"\)/);
});

test("PATCH updates tag fields", () => {
  const source = readFileSync("app/api/admin/tags/[id]/route.ts", "utf8");
  assert.match(source, /export async function PATCH/);
  assert.match(source, /await db\.tag\.update\(\{ where: \{ id: parsedParams\.data\.id \}, data: parsed\.data \}\)/);
});

test("DELETE returns 409 when tag is in use", () => {
  const source = readFileSync("app/api/admin/tags/[id]/route.ts", "utf8");
  assert.match(source, /await db\.eventTag\.count\(\{ where: \{ tagId: parsedParams\.data\.id \} \}\)/);
  assert.match(source, /Response\.json\(\{ error: "tag_in_use", count \}, \{ status: 409 \}\)/);
});

test("DELETE removes tag when count is zero", () => {
  const source = readFileSync("app/api/admin/tags/[id]/route.ts", "utf8");
  assert.match(source, /await db\.tag\.delete\(\{ where: \{ id: parsedParams\.data\.id \} \}\)/);
  assert.match(source, /Response\.json\(\{ ok: true \}\)/);
});
