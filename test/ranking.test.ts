import test from "node:test";
import assert from "node:assert/strict";
import { applyConservativeRanking, computeEngagementBoosts } from "../lib/ranking.ts";

test("ranking helper applies conservative boosts within day buckets", async () => {
  const candidates = [
    { id: "a", startAt: new Date("2026-03-01T09:00:00.000Z"), venueId: "v1", eventArtists: [{ artistId: "ar1" }], eventTags: [{ tag: { slug: "painting" } }] },
    { id: "b", startAt: new Date("2026-03-01T10:00:00.000Z"), venueId: "v2", eventArtists: [{ artistId: "ar2" }], eventTags: [{ tag: { slug: "photo" } }] },
    { id: "c", startAt: new Date("2026-03-02T09:00:00.000Z"), venueId: "v2", eventArtists: [{ artistId: "ar2" }], eventTags: [{ tag: { slug: "photo" } }] },
  ];

  const boosts = await computeEngagementBoosts({
    engagementEvent: { findMany: async () => [{ targetId: "clicked" }] },
    event: {
      findMany: async () => [{ id: "clicked", venueId: "v2", eventArtists: [{ artistId: "ar2" }], eventTags: [{ tag: { slug: "photo" } }] }],
    },
  }, "user-1", candidates);

  const ranked = applyConservativeRanking(candidates, boosts);
  assert.deepEqual(ranked.map((item) => item.id), ["b", "a", "c"]);
});

test("computeEngagementBoosts applies findMany caps", async () => {
  let engagementTake: number | undefined;
  let eventsTake: number | undefined;

  await computeEngagementBoosts(
    {
      engagementEvent: {
        findMany: async (args) => {
          engagementTake = args.take;
          return [{ targetId: "clicked" }];
        },
      },
      event: {
        findMany: async (args) => {
          eventsTake = args.take;
          return [{ id: "clicked", venueId: null, eventArtists: [], eventTags: [] }];
        },
      },
    },
    "user-1",
    [{ id: "c1", startAt: new Date(), venueId: null, eventArtists: [], eventTags: [] }],
  );

  assert.equal(engagementTake, 1000);
  assert.equal(eventsTake, 1000);
});
