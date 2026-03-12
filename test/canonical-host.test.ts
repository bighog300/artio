import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { getCanonicalHost, shouldEnforceCanonicalHost } from "../lib/canonical-host";
import { middleware } from "../middleware";

const originalNextAuthUrl = process.env.NEXTAUTH_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalBetaMode = process.env.BETA_MODE;

test("getCanonicalHost returns host parsed from NEXTAUTH_URL", () => {
  process.env.NEXTAUTH_URL = "https://artpulse-demo.vercel.app";
  assert.equal(getCanonicalHost(), "artpulse-demo.vercel.app");
});

test("getCanonicalHost returns null when NEXTAUTH_URL is invalid", () => {
  process.env.NEXTAUTH_URL = "this-is-not-a-url";
  assert.equal(getCanonicalHost(), null);
});

test("shouldEnforceCanonicalHost only enforces in production and non-local hosts", () => {
  process.env.NODE_ENV = "production";
  assert.equal(shouldEnforceCanonicalHost("preview-123.vercel.app"), true);
  assert.equal(shouldEnforceCanonicalHost("localhost:3000"), false);
  assert.equal(shouldEnforceCanonicalHost("127.0.0.1:3000"), false);

  process.env.NODE_ENV = "development";
  assert.equal(shouldEnforceCanonicalHost("preview-123.vercel.app"), false);
});

test("middleware redirects non-api requests to canonical host and preserves path/query", async () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_URL = "https://artpulse-demo.vercel.app";
  process.env.BETA_MODE = "0";

  const req = new NextRequest("https://preview-abc.vercel.app/for-you?tab=latest", {
    headers: {
      "x-forwarded-proto": "https",
    },
  });

  const res = await middleware(req);

  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), "https://artpulse-demo.vercel.app/for-you?tab=latest");
});

test("middleware does not redirect localhost", async () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_URL = "https://artpulse-demo.vercel.app";
  process.env.BETA_MODE = "0";

  const req = new NextRequest("http://localhost:3000/for-you?tab=latest");
  const res = await middleware(req);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null);
});

test("middleware skips canonical-host redirects for /api routes", async () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_URL = "https://artpulse-demo.vercel.app";
  process.env.BETA_MODE = "0";

  const req = new NextRequest("https://preview-abc.vercel.app/api/notifications?unread=1");
  const res = await middleware(req);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null);
});


test("middleware CSP uses nonce-based script-src without unsafe-inline", async () => {
  process.env.NODE_ENV = "production";
  process.env.BETA_MODE = "0";

  const req = new NextRequest("https://artpulse-demo.vercel.app/events");
  const res = await middleware(req);

  const csp = res.headers.get("content-security-policy") || "";
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(csp, /script-src[^;]*nonce-/);
  assert.equal(Boolean(res.headers.get("x-nonce")), true);
});

test.after(() => {
  process.env.NEXTAUTH_URL = originalNextAuthUrl;
  process.env.NODE_ENV = originalNodeEnv;
  process.env.BETA_MODE = originalBetaMode;
});
