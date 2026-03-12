import test from "node:test";
import assert from "node:assert/strict";

const ORIGINAL_ENV = { ...process.env };

let authOptions: Awaited<ReturnType<typeof loadAuthModule>>["authOptions"];
let getAuthSecret: Awaited<ReturnType<typeof loadAuthModule>>["getAuthSecret"];

function loadAuthModule() {
  return import(`../lib/auth.ts?cacheBust=${Date.now()}`);
}

test.before(async () => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "development",
    AUTH_SECRET: "initial-auth-secret",
    AUTH_GOOGLE_ID: ORIGINAL_ENV.AUTH_GOOGLE_ID ?? "google-id",
    AUTH_GOOGLE_SECRET: ORIGINAL_ENV.AUTH_GOOGLE_SECRET ?? "google-secret",
  };

  const module = await loadAuthModule();
  authOptions = module.authOptions;
  getAuthSecret = module.getAuthSecret;
});

test.after(() => {
  process.env = ORIGINAL_ENV;
});

test("getAuthSecret reads AUTH_SECRET", () => {
  process.env.AUTH_SECRET = "auth-secret";
  assert.equal(getAuthSecret(), "auth-secret");
});

test("getAuthSecret generates stable ephemeral secret in development when AUTH_SECRET is missing", () => {
  delete process.env.AUTH_SECRET;

  const secretA = getAuthSecret();
  const secretB = getAuthSecret();

  assert.ok(secretA.length > 0);
  assert.equal(secretA, secretB);
});

test("authOptions secret uses canonical getAuthSecret value", () => {
  process.env.AUTH_SECRET = "initial-auth-secret";
  assert.equal(authOptions.secret, getAuthSecret());
});
