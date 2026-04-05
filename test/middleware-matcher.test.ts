import test from "node:test";
import assert from "node:assert/strict";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config as middlewareConfig } from "../middleware";

test("middleware matcher excludes /api/auth/providers", () => {
  const matches = unstable_doesMiddlewareMatch({
    config: middlewareConfig,
    url: "/api/auth/providers",
  });

  assert.equal(matches, false);
});

test("middleware matcher still applies to non-excluded routes", () => {
  const matches = unstable_doesMiddlewareMatch({
    config: middlewareConfig,
    url: "/login",
  });

  assert.equal(matches, true);
});
