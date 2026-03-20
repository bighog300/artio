import test from "node:test";
import assert from "node:assert/strict";
import { createVenueStubFromCandidate, createVenueStubFromCandidateDeps } from "@/lib/ingest/create-venue-stub-from-candidate";

type VenueRow = { id: string; lat: number | null; lng: number | null };

function createDb() {
  const created: VenueRow[] = [];
  const updates: Array<{ where: { id: string }; data: { lat: number; lng: number } }> = [];

  return {
    created,
    updates,
    venue: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async () => {
        const row = { id: "venue-1", lat: null, lng: null };
        created.push(row);
        return { id: row.id };
      },
      update: async (args: { where: { id: string }; data: { lat: number; lng: number } }) => {
        updates.push(args);
        return { id: args.where.id };
      },
    },
  };
}

const originalGeocode = createVenueStubFromCandidateDeps.forwardGeocodeVenueAddressToLatLng;

test.afterEach(() => {
  createVenueStubFromCandidateDeps.forwardGeocodeVenueAddressToLatLng = originalGeocode;
});

test("updates venue lat/lng when geocoder returns coordinates", async () => {
  const db = createDb();
  createVenueStubFromCandidateDeps.forwardGeocodeVenueAddressToLatLng = async () => ({ lat: 40.7, lng: -74.0 });

  const result = await createVenueStubFromCandidate({
    candidateUrl: "https://example.com",
    candidateTitle: "Example Venue",
    regionId: null,
    country: "US",
    region: "NY",
    db: db as never,
  });

  assert.deepEqual(result, { venueId: "venue-1" });
  assert.equal(db.updates.length, 1);
  assert.deepEqual(db.updates[0], {
    where: { id: "venue-1" },
    data: { lat: 40.7, lng: -74.0 },
  });
});

test("returns venueId when geocoder throws", async () => {
  const db = createDb();
  createVenueStubFromCandidateDeps.forwardGeocodeVenueAddressToLatLng = async () => {
    throw new Error("boom");
  };

  const result = await createVenueStubFromCandidate({
    candidateUrl: "https://example.com",
    candidateTitle: "Example Venue",
    regionId: null,
    country: "US",
    region: "NY",
    db: db as never,
  });

  assert.deepEqual(result, { venueId: "venue-1" });
  assert.equal(db.updates.length, 0);
});

test("returns venueId and does not update when geocoder returns null", async () => {
  const db = createDb();
  createVenueStubFromCandidateDeps.forwardGeocodeVenueAddressToLatLng = async () => null;

  const result = await createVenueStubFromCandidate({
    candidateUrl: "https://example.com",
    candidateTitle: "Example Venue",
    regionId: null,
    country: "US",
    region: "NY",
    db: db as never,
  });

  assert.deepEqual(result, { venueId: "venue-1" });
  assert.equal(db.updates.length, 0);
});
