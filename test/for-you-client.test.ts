import test from "node:test";
import assert from "node:assert/strict";
import { fetchForYouRecommendations, shouldAttemptForYouFetch } from "../components/recommendations/for-you-client";

test("fetchForYouRecommendations skips fetch when unauthenticated", async () => {
  let called = false;
  const result = await fetchForYouRecommendations({
    status: "unauthenticated",
    hasUser: false,
    fetchImpl: async () => {
      called = true;
      return new Response(null, { status: 200 });
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result, { kind: "skipped" });
});

test("fetchForYouRecommendations calls endpoint when authenticated", async () => {
  let calledUrl: string | null = null;
  const result = await fetchForYouRecommendations({
    status: "authenticated",
    hasUser: true,
    fetchImpl: async (input) => {
      calledUrl = String(input);
      return Response.json({ windowDays: 7, items: [] });
    },
  });

  assert.equal(calledUrl, "/api/recommendations/for-you?days=7&limit=20");
  assert.equal(result.kind, "success");
});

test("fetchForYouRecommendations skips fetch when user is missing", async () => {
  let called = false;
  const result = await fetchForYouRecommendations({
    status: "authenticated",
    hasUser: false,
    fetchImpl: async () => {
      called = true;
      return new Response(null, { status: 200 });
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result, { kind: "skipped" });
});

test("fetchForYouRecommendations returns unauthorized on 401", async () => {
  const result = await fetchForYouRecommendations({
    status: "authenticated",
    hasUser: true,
    fetchImpl: async () => new Response(null, { status: 401 }),
  });

  assert.deepEqual(result, { kind: "unauthorized" });
});

test("shouldAttemptForYouFetch enforces loading and unauthenticated gating", () => {
  assert.equal(
    shouldAttemptForYouFetch({ attempted: false, lockedOut: false, status: "loading", hasUser: true }),
    false,
  );
  assert.equal(
    shouldAttemptForYouFetch({ attempted: false, lockedOut: false, status: "unauthenticated", hasUser: false }),
    false,
  );
});

test("shouldAttemptForYouFetch allows one authenticated attempt and locks out retries", () => {
  assert.equal(
    shouldAttemptForYouFetch({ attempted: false, lockedOut: false, status: "authenticated", hasUser: true }),
    true,
  );
  assert.equal(
    shouldAttemptForYouFetch({ attempted: true, lockedOut: false, status: "authenticated", hasUser: true }),
    false,
  );
  assert.equal(
    shouldAttemptForYouFetch({ attempted: true, lockedOut: true, status: "authenticated", hasUser: true }),
    false,
  );
});
