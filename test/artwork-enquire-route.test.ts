import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/api/artwork/[key]/enquire/route.ts", "utf8");

test("enquire route does not require auth", () => {
  assert.doesNotMatch(source, /requireAuth\(/);
});

test("enquire route enforces rate limiting", () => {
  assert.match(source, /enforceRateLimit\(/);
});

test("enquire route calls createArtworkInquiry", () => {
  assert.match(source, /createArtworkInquiry\(/);
});

test("enquire route enqueues buyer notification", () => {
  assert.match(source, /type:\s*"ARTWORK_INQUIRY_BUYER"/);
});

test("enquire route enqueues artist notification", () => {
  assert.match(source, /type:\s*"ARTWORK_INQUIRY_ARTIST"/);
});

test("enquire route returns 201 on success", () => {
  assert.match(source, /status:\s*201/);
});

test("enquire route returns 404 on null result", () => {
  assert.match(source, /if \(!result\) return apiError\(404,\s*"not_found",\s*"Artwork not found"\)/);
});
