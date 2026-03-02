import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminVenueGeocode } from "../app/api/admin/venues/[id]/geocode/route";

const venueId = "11111111-1111-4111-8111-111111111111";

test("admin venue geocode denies non-admin requests", async () => {
  const res = await handleAdminVenueGeocode(Promise.resolve({ id: venueId }), {
    requireAdminUser: async () => { throw new Error("forbidden"); },
    appDb: {
      venue: { findUnique: async () => null, update: async () => null },
    } as never,
    geocodeAddress: async () => ({ lat: 0, lng: 0 }),
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "forbidden");
});

test("admin venue geocode success updates lat/lng", async () => {
  const updates: Array<{ lat: number; lng: number }> = [];
  const venue = {
    id: venueId,
    name: "Venue",
    status: "APPROVED",
    addressLine1: "1 Main Street",
    addressLine2: null,
    city: "London",
    region: null,
    postcode: "E1 6AN",
    country: "GB",
    lat: null,
    lng: null,
  };

  const res = await handleAdminVenueGeocode(Promise.resolve({ id: venueId }), {
    requireAdminUser: async () => ({ id: "admin", email: "admin@example.com", role: "ADMIN" }),
    appDb: {
      venue: {
        findUnique: async () => venue,
        update: async ({ data }: { data: { lat: number; lng: number } }) => {
          updates.push(data);
          return { ...venue, ...data };
        },
      },
    } as never,
    geocodeAddress: async () => ({ lat: 51.5, lng: -0.1 }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(updates[0], { lat: 51.5, lng: -0.1 });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.item.publishBlockers.some((x: string) => x.includes("Coordinates are required")), false);
});
