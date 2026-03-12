import test from "node:test";
import assert from "node:assert/strict";
import { enrichVenueFromSnapshot } from "@/lib/ingest/enrich-venue-from-snapshot";

function baseVenue() {
  return {
    id: "venue-1",
    description: null,
    openingHours: null,
    contactEmail: null,
    instagramUrl: null,
    facebookUrl: null,
    featuredAssetId: null,
  };
}

test("enrichVenueFromSnapshot sets featuredAssetId from venueImage.assetId", async () => {
  const venueUpdates: Array<{ featuredAssetId?: string }> = [];

  const db = {
    venue: {
      findUnique: async () => baseVenue(),
      update: async ({ data }: { data: { featuredAssetId?: string } }) => {
        venueUpdates.push(data);
        return { id: "venue-1" };
      },
    },
    venueEnrichmentLog: {
      create: async () => ({ id: "log-1" }),
    },
    venueHomepageImageCandidate: {
      findFirst: async () => ({ venueImageId: "venue-image-1" }),
    },
    venueImage: {
      findUnique: async () => ({ assetId: "asset-1" }),
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
  } as any;

  const result = await enrichVenueFromSnapshot({
    db,
    venueId: "venue-1",
    runId: "run-1",
    sourceDomain: "https://example.org/snapshot",
    snapshot: {
      venueDescription: "A much richer description",
      venueOpeningHours: null,
      venueContactEmail: null,
      venueInstagramUrl: null,
      venueFacebookUrl: null,
    },
  });

  assert.equal(result.enriched, true);
  assert.equal(venueUpdates.some((u) => u.featuredAssetId === "asset-1"), true);
  assert.equal(venueUpdates.some((u) => u.featuredAssetId === "venue-image-1"), false);
});

test("enrichVenueFromSnapshot does not update featuredAssetId when venueImage lookup is missing", async () => {
  const venueUpdates: Array<{ featuredAssetId?: string }> = [];

  const db = {
    venue: {
      findUnique: async () => baseVenue(),
      update: async ({ data }: { data: { featuredAssetId?: string } }) => {
        venueUpdates.push(data);
        return { id: "venue-1" };
      },
    },
    venueEnrichmentLog: {
      create: async () => ({ id: "log-1" }),
    },
    venueHomepageImageCandidate: {
      findFirst: async () => ({ venueImageId: "venue-image-1" }),
    },
    venueImage: {
      findUnique: async () => null,
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
  } as any;

  const result = await enrichVenueFromSnapshot({
    db,
    venueId: "venue-1",
    runId: "run-1",
    sourceDomain: "https://example.org/snapshot",
    snapshot: {
      venueDescription: "A much richer description",
      venueOpeningHours: null,
      venueContactEmail: null,
      venueInstagramUrl: null,
      venueFacebookUrl: null,
    },
  });

  assert.equal(result.enriched, true);
  assert.equal(venueUpdates.some((u) => "featuredAssetId" in u), false);
});
