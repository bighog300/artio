import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function runCheckEnv(extraEnv: Record<string, string | undefined>) {
  return spawnSync("node", ["scripts/check-env.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: undefined,
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      CRON_SECRET: undefined,
      NEXT_PUBLIC_MAPBOX_TOKEN: undefined,
      NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: undefined,
      VERCEL: undefined,
      CI: undefined,
      ...extraEnv,
    },
    encoding: "utf8",
  });
}

test("check-env skips strict checks outside deploy context", () => {
  const result = runCheckEnv({});
  assert.equal(result.status, 0);
  assert.match(result.stdout, /non-deploy context detected/);
});

test("check-env requires CRON_SECRET in deploy context", () => {
  const result = runCheckEnv({ CI: "true", AUTH_SECRET: "a", DATABASE_URL: "postgres://db" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CRON_SECRET/);
});

test("check-env accepts NEXTAUTH_SECRET without AUTH_SECRET in deploy context", () => {
  const result = runCheckEnv({
    CI: "true",
    NEXTAUTH_SECRET: "nextauth-secret",
    DATABASE_URL: "postgres://db",
    CRON_SECRET: "cron-secret",
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /AUTH_SECRET is missing/);
});

test("check-env fails when AUTH_SECRET and NEXTAUTH_SECRET differ", () => {
  const result = runCheckEnv({
    CI: "true",
    NEXTAUTH_SECRET: "nextauth-secret",
    AUTH_SECRET: "auth-secret",
    DATABASE_URL: "postgres://db",
    CRON_SECRET: "cron-secret",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /both set but differ/);
});

test("check-env accepts either mapbox token variable", () => {
  const withCanonical = runCheckEnv({
    VERCEL: "1",
    AUTH_SECRET: "a",
    DATABASE_URL: "postgres://db",
    CRON_SECRET: "cron",
    AI_INGEST_IMAGE_ENABLED: "1",
    NEXT_PUBLIC_MAPBOX_TOKEN: "token",
  });
  assert.equal(withCanonical.status, 0);

  const withAccessToken = runCheckEnv({
    VERCEL: "1",
    AUTH_SECRET: "a",
    DATABASE_URL: "postgres://db",
    CRON_SECRET: "cron",
    AI_INGEST_IMAGE_ENABLED: "1",
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: "token",
  });
  assert.equal(withAccessToken.status, 0);
});
