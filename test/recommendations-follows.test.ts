import assert from "node:assert/strict";
import test from "node:test";
import { excludeAlreadyFollowedIds, type FollowRecommendationsResponse } from "../lib/recommendations-follows.ts";

test("excludeAlreadyFollowedIds removes followed ids", () => {
  const result = excludeAlreadyFollowedIds(["a1", "a2", "a3"], new Set(["a2"]));
  assert.deepEqual(result, ["a1", "a3"]);
});

test("recommendations response shape is stable", () => {
  const response: FollowRecommendationsResponse = {
    artists: [
      {
        id: "artist-1",
        slug: "artist-1",
        name: "Artist One",
        followersCount: 42,
        reason: "Artists performing at venues you follow",
      },
    ],
    venues: [
      {
        id: "venue-1",
        slug: "venue-1",
        name: "Venue One",
        followersCount: 13,
        reason: "Venues hosting artists you follow",
      },
    ],
  };

  assert.equal(Array.isArray(response.artists), true);
  assert.equal(Array.isArray(response.venues), true);
  assert.deepEqual(Object.keys(response.artists[0]).sort(), ["followersCount", "id", "name", "reason", "slug"]);
  assert.deepEqual(Object.keys(response.venues[0]).sort(), ["followersCount", "id", "name", "reason", "slug"]);
});
