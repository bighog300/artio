import test from "node:test";
import assert from "node:assert/strict";
import { canSelfPublish } from "../lib/auth";

test("canSelfPublish returns true for ADMIN", () => {
  assert.equal(canSelfPublish({ role: "ADMIN" }), true);
});

test("canSelfPublish returns true for trusted publishers", () => {
  assert.equal(canSelfPublish({ role: "EDITOR", isTrustedPublisher: true }), true);
});

test("canSelfPublish returns false for non-trusted editor", () => {
  assert.equal(canSelfPublish({ role: "EDITOR", isTrustedPublisher: false }), false);
});

test("canSelfPublish returns false for nullish users", () => {
  assert.equal(canSelfPublish(null), false);
  assert.equal(canSelfPublish(undefined), false);
});
