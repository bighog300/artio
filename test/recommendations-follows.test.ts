import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../lib/db.ts";
import { excludeAlreadyFollowedIds, getFollowRecommendations, type FollowRecommendationsResponse } from "../lib/recommendations-follows.ts";

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

test("getFollowRecommendations caps follow and public entity lookups", async () => {
  const originalFollowFindMany = db.follow.findMany;
  const originalFollowGroupBy = db.follow.groupBy;
  const originalArtistFindMany = db.artist.findMany;
  const originalVenueFindMany = db.venue.findMany;
  const originalEventArtistGroupBy = db.eventArtist.groupBy;
  const originalEventGroupBy = db.event.groupBy;

  let followTake: number | undefined;
  const artistTakes: number[] = [];
  const venueTakes: number[] = [];

  try {
    db.follow.findMany = (async (args) => {
      followTake = args.take;
      return [];
    }) as typeof db.follow.findMany;
    db.follow.groupBy = (async (args) => {
      if (args.where?.targetType === "ARTIST") return [{ targetId: "artist-1", _count: { _all: 5 } }];
      return [{ targetId: "venue-1", _count: { _all: 4 } }];
    }) as typeof db.follow.groupBy;
    db.eventArtist.groupBy = (async () => []) as typeof db.eventArtist.groupBy;
    db.event.groupBy = (async () => []) as typeof db.event.groupBy;
    db.artist.findMany = (async (args) => {
      artistTakes.push(Number(args.take));
      return [{ id: "artist-1", slug: "artist-1", name: "Artist 1" }] as never;
    }) as typeof db.artist.findMany;
    db.venue.findMany = (async (args) => {
      venueTakes.push(Number(args.take));
      return [{ id: "venue-1", slug: "venue-1", name: "Venue 1" }] as never;
    }) as typeof db.venue.findMany;

    await getFollowRecommendations({ userId: "user-1" });
    await getFollowRecommendations({});

    assert.equal(followTake, 200);
    assert.equal(artistTakes.includes(200), true);
    assert.equal(venueTakes.includes(200), true);
  } finally {
    db.follow.findMany = originalFollowFindMany;
    db.follow.groupBy = originalFollowGroupBy;
    db.artist.findMany = originalArtistFindMany;
    db.venue.findMany = originalVenueFindMany;
    db.eventArtist.groupBy = originalEventArtistGroupBy;
    db.event.groupBy = originalEventGroupBy;
  }
});
