import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeUrl } from "../lib/ingest/canonical-url";

test("canonicalizeUrl strips www and normalizes https", () => {
  assert.equal(canonicalizeUrl("http://www.Example.com/path"), "https://example.com/path");
});

test("canonicalizeUrl removes trailing slash from non-root pathname", () => {
  assert.equal(canonicalizeUrl("https://example.com/path/"), "https://example.com/path");
  assert.equal(canonicalizeUrl("https://example.com/"), "https://example.com/");
});

test("canonicalizeUrl removes tracking query params", () => {
  assert.equal(
    canonicalizeUrl("https://example.com/path/?utm_source=google&utm_medium=cpc&fbclid=abc&id=42"),
    "https://example.com/path?id=42",
  );
});

test("canonicalizeUrl returns null for invalid URLs", () => {
  assert.equal(canonicalizeUrl("not a url"), null);
});

test("canonicalizeUrl matches URLs that differ only by www", () => {
  const first = canonicalizeUrl("https://www.example.com/events");
  const second = canonicalizeUrl("https://example.com/events");
  assert.equal(first, second);
});
