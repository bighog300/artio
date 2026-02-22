import test from "node:test";
import assert from "node:assert/strict";
import { buildNearbyEventsQuery, fetchNearbyEvents } from "../lib/nearby-client-fetch.ts";

test("fetchNearbyEvents skips fetch when lat/lng/radius are invalid", async () => {
  let called = false;
  const result = await fetchNearbyEvents(
    {
      lat: "",
      lng: "-2.58",
      radiusKm: "NaN",
      filters: { sort: "distance", tags: [], days: 7 },
    },
    (async () => {
      called = true;
      return new Response();
    }) as typeof fetch,
  );

  assert.equal(called, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "Choose a location and radius to search nearby");
});

test("buildNearbyEventsQuery serializes finite numbers for nearby route", () => {
  const query = buildNearbyEventsQuery({
    lat: "51.454514",
    lng: "-2.587910",
    radiusKm: "25",
    filters: { sort: "distance", tags: ["street-art"], days: 30 },
  });

  assert.ok(query);
  assert.equal(query?.get("lat"), "51.454514");
  assert.equal(query?.get("lng"), "-2.587910");
  assert.equal(query?.get("radiusKm"), "25");
  assert.equal(query?.get("tags"), "street-art");
  assert.equal(query?.get("days"), "30");
});
