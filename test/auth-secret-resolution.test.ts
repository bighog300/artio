import test from "node:test";
import assert from "node:assert/strict";
import { getAuthSecretState, getResolvedAuthSecret } from "../lib/auth-secret";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("auth secret resolution: only NEXTAUTH_SECRET set", () => {
  process.env.NEXTAUTH_SECRET = "nextauth-only";
  delete process.env.AUTH_SECRET;

  const state = getAuthSecretState();
  assert.equal(state.resolvedSecret, "nextauth-only");
  assert.equal(state.hasMismatch, false);
  assert.equal(getResolvedAuthSecret(), "nextauth-only");
});

test("auth secret resolution: only AUTH_SECRET set", () => {
  delete process.env.NEXTAUTH_SECRET;
  process.env.AUTH_SECRET = "auth-only";

  const state = getAuthSecretState();
  assert.equal(state.resolvedSecret, "auth-only");
  assert.equal(state.hasMismatch, false);
  assert.equal(getResolvedAuthSecret(), "auth-only");
});

test("auth secret resolution: both secrets set to same value", () => {
  process.env.NEXTAUTH_SECRET = "same-secret";
  process.env.AUTH_SECRET = "same-secret";

  const state = getAuthSecretState();
  assert.equal(state.resolvedSecret, "same-secret");
  assert.equal(state.hasMismatch, false);
});

test("auth secret resolution: both secrets set to different values", () => {
  process.env.NEXTAUTH_SECRET = "nextauth-secret";
  process.env.AUTH_SECRET = "auth-secret";

  const state = getAuthSecretState();
  assert.equal(state.resolvedSecret, "nextauth-secret");
  assert.equal(state.hasMismatch, true);
});
