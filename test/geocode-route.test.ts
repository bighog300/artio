import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as geocodeGet } from "../app/api/geocode/route.ts";

type EnvSnapshot = {
  geonames?: string;
  mapbox?: string;
};

const originalFetch = globalThis.fetch;

function snapshotEnv(): EnvSnapshot {
  return {
    geonames: process.env.GEONAMES_USERNAME,
    mapbox: process.env.MAPBOX_ACCESS_TOKEN,
  };
}

function restoreEnv(snapshot: EnvSnapshot) {
  if (snapshot.geonames == null) delete process.env.GEONAMES_USERNAME;
  else process.env.GEONAMES_USERNAME = snapshot.geonames;

  if (snapshot.mapbox == null) delete process.env.MAPBOX_ACCESS_TOKEN;
  else process.env.MAPBOX_ACCESS_TOKEN = snapshot.mapbox;
}

test("GET /api/geocode provider selection", async (t) => {
  const env = snapshotEnv();

  await t.test("prefers GeoNames when both providers are configured", async () => {
    process.env.GEONAMES_USERNAME = "x";
    process.env.MAPBOX_ACCESS_TOKEN = "y";

    let requestedUrl = "";
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ geonames: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await geocodeGet(new NextRequest("http://localhost/api/geocode?q=London"));
    assert.equal(res.status, 200);
    assert.match(requestedUrl, /geonames\.org\/searchJSON/);
  });

  await t.test("uses Mapbox when only Mapbox is configured", async () => {
    delete process.env.GEONAMES_USERNAME;
    process.env.MAPBOX_ACCESS_TOKEN = "y";

    let requestedUrl = "";
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await geocodeGet(new NextRequest("http://localhost/api/geocode?q=London"));
    assert.equal(res.status, 200);
    assert.match(requestedUrl, /api\.mapbox\.com\/geocoding/);
  });

  await t.test("returns 501 when neither provider is configured", async () => {
    delete process.env.GEONAMES_USERNAME;
    delete process.env.MAPBOX_ACCESS_TOKEN;

    globalThis.fetch = (async () => {
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    const res = await geocodeGet(new NextRequest("http://localhost/api/geocode?q=London"));
    assert.equal(res.status, 501);
    assert.deepEqual(await res.json(), { error: "not_configured" });
  });

  restoreEnv(env);
  globalThis.fetch = originalFetch;
});

test("GET /api/geocode normalizes GeoNames response", async () => {
  const env = snapshotEnv();
  process.env.GEONAMES_USERNAME = "x";
  delete process.env.MAPBOX_ACCESS_TOKEN;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        geonames: [
          { name: "Bristol", adminName1: "England", countryName: "United Kingdom", lat: "51.4552", lng: "-2.5967" },
          { name: "Bad", lat: null, lng: "1" },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const res = await geocodeGet(new NextRequest("http://localhost/api/geocode?q=Bristol"));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.results.length, 1);
  assert.deepEqual(body.results[0], {
    label: "Bristol, England, United Kingdom",
    lat: 51.4552,
    lng: -2.5967,
  });

  restoreEnv(env);
  globalThis.fetch = originalFetch;
});
