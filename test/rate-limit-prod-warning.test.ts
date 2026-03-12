import test from "node:test";
import assert from "node:assert/strict";
import { __resetRateLimitWarningsForTests, enforceRateLimit } from "@/lib/rate-limit";

test("rate limit throws loud error in production-like env when Upstash env vars are missing", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;
  const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
  const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalError = console.error;
  const errors: string[] = [];

  try {
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetRateLimitWarningsForTests();
    console.error = ((message?: unknown) => {
      errors.push(String(message ?? ""));
    }) as typeof console.error;

    await assert.rejects(
      enforceRateLimit({ key: "missing-upstash", limit: 10, windowMs: 1000 }),
      /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required/,
    );

    assert.equal(errors.length >= 1, true);
    assert.match(errors[0], /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required/);
  } finally {
    console.error = originalError;
    if (prevNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevVercel == null) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevUrl == null) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = prevUrl;
    if (prevToken == null) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = prevToken;
    __resetRateLimitWarningsForTests();
  }
});
