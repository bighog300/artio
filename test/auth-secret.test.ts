import test from "node:test";
import assert from "node:assert/strict";

const ORIGINAL_ENV = { ...process.env };

let authOptions: Awaited<ReturnType<typeof loadAuthModule>>["authOptions"];
let getAuthSecret: Awaited<ReturnType<typeof loadAuthModule>>["getAuthSecret"];

function loadAuthModule() {
  return import("../lib/auth");
}

test.before(async () => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "development",
    NEXTAUTH_SECRET: "initial-nextauth-secret",
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

test("getAuthSecret prefers NEXTAUTH_SECRET", () => {
  process.env.NEXTAUTH_SECRET = "nextauth-secret";
  process.env.AUTH_SECRET = "auth-secret";

  assert.equal(getAuthSecret(), "nextauth-secret");
});

test("getAuthSecret falls back to AUTH_SECRET when NEXTAUTH_SECRET is missing", () => {
  delete process.env.NEXTAUTH_SECRET;
  process.env.AUTH_SECRET = "auth-secret";

  assert.equal(getAuthSecret(), "auth-secret");
});

test("getAuthSecret resolves differing secrets to NEXTAUTH_SECRET", () => {
  process.env.NEXTAUTH_SECRET = "nextauth-secret";
  process.env.AUTH_SECRET = "different-auth-secret";

  assert.equal(getAuthSecret(), "nextauth-secret");
});

test("authOptions secret uses canonical getAuthSecret value", () => {
  process.env.NEXTAUTH_SECRET = "initial-nextauth-secret";
  process.env.AUTH_SECRET = "initial-auth-secret";

  assert.equal(authOptions.secret, getAuthSecret());
});
