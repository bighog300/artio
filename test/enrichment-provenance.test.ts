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
    featuredAssetId: "asset-1",
  };
}

test("enrichVenueFromSnapshot logs sourceDomain hostname from snapshot URL", async () => {
  let enrichmentLogData: any = null;

  const db = {
    venue: {
      findUnique: async () => baseVenue(),
      update: async () => ({ id: "venue-1" }),
    },
    venueEnrichmentLog: {
      create: async ({ data }: { data: any }) => {
        enrichmentLogData = data;
        return { id: "log-1" };
      },
    },
    venueHomepageImageCandidate: {
      findFirst: async () => null,
    },
    venueImage: {
      findUnique: async () => null,
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
  } as any;

  await enrichVenueFromSnapshot({
    db,
    venueId: "venue-1",
    runId: "run-1",
    sourceDomain: "https://www.moma.org/calendar/exhibitions",
    snapshot: {
      venueDescription: "A much richer description that is long enough to be highly confident in extraction quality.",
      venueOpeningHours: null,
      venueContactEmail: null,
      venueInstagramUrl: null,
      venueFacebookUrl: null,
    },
  });

  assert.equal(enrichmentLogData.sourceDomain, "www.moma.org");
});

test("enrichVenueFromSnapshot logs fieldConfidence for each changed field", async () => {
  let enrichmentLogData: any = null;

  const db = {
    venue: {
      findUnique: async () => ({ ...baseVenue(), featuredAssetId: "asset-1" }),
      update: async () => ({ id: "venue-1" }),
    },
    venueEnrichmentLog: {
      create: async ({ data }: { data: any }) => {
        enrichmentLogData = data;
        return { id: "log-1" };
      },
    },
    venueHomepageImageCandidate: {
      findFirst: async () => null,
    },
    venueImage: {
      findUnique: async () => null,
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
  } as any;

  await enrichVenueFromSnapshot({
    db,
    venueId: "venue-1",
    runId: "run-1",
    sourceDomain: "https://example.com/venues/1",
    snapshot: {
      venueDescription: "A much richer description that clearly exceeds threshold length for confidence scoring.",
      venueOpeningHours: "Tue-Sun 10:00-18:00",
      venueContactEmail: "info@example.com",
      venueInstagramUrl: "https://instagram.com/examplevenue",
      venueFacebookUrl: "https://facebook.com/examplevenue",
    },
  });

  const changedFields = enrichmentLogData.changedFields as string[];
  const fieldConfidence = enrichmentLogData.fieldConfidence as Record<string, number>;

  for (const field of changedFields) {
    assert.equal(typeof fieldConfidence[field], "number", `Missing confidence for ${field}`);
  }
});
