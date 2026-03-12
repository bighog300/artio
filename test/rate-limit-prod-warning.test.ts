import test from "node:test";
import assert from "node:assert/strict";
import { __resetRateLimitWarningsForTests, enforceRateLimit } from "@/lib/rate-limit";

test("rate limit warns once in production-like env when using memory fallback", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;
  const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
  const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalWarn = console.warn;
  const warnings: string[] = [];

  try {
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetRateLimitWarningsForTests();
    console.warn = ((message?: unknown) => {
      warnings.push(String(message ?? ""));
    }) as typeof console.warn;

    await enforceRateLimit({ key: "warn-once-a", limit: 10, windowMs: 1000 });
    await enforceRateLimit({ key: "warn-once-b", limit: 10, windowMs: 1000 });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Upstash Redis is not configured or unavailable/);
  } finally {
    console.warn = originalWarn;
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
