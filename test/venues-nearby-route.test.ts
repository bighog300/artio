import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getNearbyVenues } from "../app/api/venues/nearby/route.ts";
import { db } from "../lib/db.ts";

const baseVenue = {
  id: "venue-a",
  slug: "venue-a",
  name: "Venue A",
  city: "Bristol",
  lat: 51.5,
  lng: -2.6,
  images: [],
};

test("GET /api/venues/nearby validates query params", async () => {
  const req = new NextRequest("http://localhost/api/venues/nearby?lat=200&lng=-2.6&radiusKm=10");
  const res = await getNearbyVenues(req);
  assert.equal(res.status, 400);
});

test("GET /api/venues/nearby returns only published in-radius venues", async () => {
  const originalFindMany = db.venue.findMany;
  db.venue.findMany = (async () => [
    { ...baseVenue, id: "inside", slug: "inside", lat: 51.5001, lng: -2.6001 },
    { ...baseVenue, id: "outside", slug: "outside", lat: 40.0, lng: -3.0 },
  ] as any) as typeof db.venue.findMany;

  try {
    const req = new NextRequest("http://localhost/api/venues/nearby?lat=51.5&lng=-2.6&radiusKm=10");
    const res = await getNearbyVenues(req);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, "inside");
    assert.equal(body.items[0].image?.url, null);
    assert.equal(body.items[0].primaryImageUrl, null);
  } finally {
    db.venue.findMany = originalFindMany;
  }
});
