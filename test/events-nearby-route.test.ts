import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getNearby } from "../app/api/events/nearby/route.ts";
import { db } from "../lib/db.ts";

const baseEvent = {
  id: "evt",
  lat: 51.5,
  lng: -2.6,
  startAt: new Date("2026-03-01T10:00:00.000Z"),
  venue: { name: "Venue", slug: "venue", city: "Bristol", lat: 51.5, lng: -2.6 },
  images: [],
  eventTags: [{ tag: { name: "Street", slug: "street-art" } }],
};

test("GET /api/events/nearby rejects days with date range", async () => {
  const req = new NextRequest("http://localhost/api/events/nearby?lat=51.4&lng=-2.5&radiusKm=10&days=7&from=2026-03-01");
  const res = await getNearby(req);
  assert.equal(res.status, 400);
});

test("GET /api/events/nearby applies q and tags filters", async () => {
  const originalFindMany = db.event.findMany;
  let whereValue: any;
  db.event.findMany = (async (args) => {
    whereValue = args.where;
    return [{ ...baseEvent, id: "evt_1" }] as any;
  }) as typeof db.event.findMany;
  try {
    const req = new NextRequest("http://localhost/api/events/nearby?lat=51.4&lng=-2.5&radiusKm=25&q=street&tags=street-art");
    const res = await getNearby(req);
    assert.equal(res.status, 200);
    assert.equal(whereValue.AND.some((entry: any) => entry.OR), true);
    assert.equal(whereValue.AND.some((entry: any) => entry.eventTags), true);
  } finally {
    db.event.findMany = originalFindMany;
  }
});

test("GET /api/events/nearby returns nextCursor and appends without duplicates", async () => {
  const originalFindMany = db.event.findMany;
  let calls = 0;
  db.event.findMany = (async () => {
    calls += 1;
    if (calls === 1) {
      return [
        { ...baseEvent, id: "evt_1", startAt: new Date("2026-03-01T10:00:00.000Z") },
        { ...baseEvent, id: "evt_2", startAt: new Date("2026-03-01T11:00:00.000Z") },
        { ...baseEvent, id: "evt_3", startAt: new Date("2026-03-01T12:00:00.000Z") },
      ] as any;
    }
    return [] as any;
  }) as typeof db.event.findMany;

  try {
    const req = new NextRequest("http://localhost/api/events/nearby?lat=51.4&lng=-2.5&radiusKm=25&limit=1");
    const res = await getNearby(req);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.items.length, 1);
    assert.ok(body.nextCursor);

    const req2 = new NextRequest(`http://localhost/api/events/nearby?lat=51.4&lng=-2.5&radiusKm=25&limit=1&cursor=${body.nextCursor}`);
    const res2 = await getNearby(req2);
    const body2 = await res2.json();
    assert.equal(res2.status, 200);
    assert.equal(new Set(body2.items.map((item: { id: string }) => item.id)).size, body2.items.length);
  } finally {
    db.event.findMany = originalFindMany;
  }
});

test("GET /api/events/nearby hasMore remains true when post-radius filtering drops batch", async () => {
  const originalFindMany = db.event.findMany;
  let call = 0;
  db.event.findMany = (async () => {
    call += 1;
    if (call === 1) {
      return [
        { ...baseEvent, id: "far_1", lat: 0, lng: 0 },
        { ...baseEvent, id: "near_1", lat: 51.5, lng: -2.6 },
        { ...baseEvent, id: "far_2", lat: 0, lng: 0 },
      ] as any;
    }
    if (call === 2) {
      return [
        { ...baseEvent, id: "near_2", startAt: new Date("2026-03-02T10:00:00.000Z") },
        { ...baseEvent, id: "near_3", startAt: new Date("2026-03-03T10:00:00.000Z") },
      ] as any;
    }
    return [] as any;
  }) as typeof db.event.findMany;

  try {
    const req = new NextRequest("http://localhost/api/events/nearby?lat=51.5&lng=-2.6&radiusKm=10&limit=1");
    const res = await getNearby(req);
    const body = await res.json();
    assert.equal(body.items.length, 1);
    assert.ok(body.nextCursor);
  } finally {
    db.event.findMany = originalFindMany;
  }
});

test("GET /api/events/nearby supports sort=soonest ordering", async () => {
  const originalFindMany = db.event.findMany;
  db.event.findMany = (async () => [
    { ...baseEvent, id: "evt_b", startAt: new Date("2026-03-02T10:00:00.000Z") },
    { ...baseEvent, id: "evt_a", startAt: new Date("2026-03-01T10:00:00.000Z") },
  ] as any) as typeof db.event.findMany;

  try {
    const req = new NextRequest("http://localhost/api/events/nearby?lat=51.5&lng=-2.6&radiusKm=10&limit=1&sort=soonest");
    const res = await getNearby(req);
    const body = await res.json();
    assert.equal(body.items[0].id, "evt_b");
  } finally {
    db.event.findMany = originalFindMany;
  }
});


test("GET /api/events/nearby sort=distance uses haversine ordering", async () => {
  const originalFindMany = db.event.findMany;
  db.event.findMany = (async () => [
    { ...baseEvent, id: "evt_far", lat: 0, lng: 1, startAt: new Date("2026-03-01T10:00:00.000Z") },
    { ...baseEvent, id: "evt_near", lat: 1, lng: 0, startAt: new Date("2026-03-01T10:00:00.000Z") },
  ] as any) as typeof db.event.findMany;

  try {
    const req = new NextRequest("http://localhost/api/events/nearby?lat=1&lng=1&radiusKm=200&sort=distance");
    const res = await getNearby(req);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.items[0].id, "evt_near");
    assert.equal(typeof body.items[0].distanceKm, "number");
    assert.equal(body.items[0].image?.url, null);
    assert.equal(body.items[0].primaryImageUrl, null);
  } finally {
    db.event.findMany = originalFindMany;
  }
});
