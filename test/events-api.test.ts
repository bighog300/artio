import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getEvents } from "../app/api/events/route.ts";
import { db } from "../lib/db.ts";

test("GET /api/events accepts date-only range and limit=200", async () => {
  const originalFindMany = db.event.findMany;
  let capturedTake: number | undefined;
  let capturedWhereStartAt: unknown;
  let capturedDeletedAt: unknown;

  db.event.findMany = (async (args) => {
    capturedTake = args.take;
    capturedWhereStartAt = (args.where as { AND?: Array<{ startAt?: unknown }> })?.AND?.find((entry) => entry.startAt)?.startAt;
    capturedDeletedAt = (args.where as { deletedAt?: unknown }).deletedAt;
    return [];
  }) as typeof db.event.findMany;

  try {
    const req = new NextRequest("http://localhost/api/events?from=2026-02-01&to=2026-03-15&limit=200");
    const res = await getEvents(req);

    assert.equal(res.status, 200);
    assert.equal(capturedTake, 201);
    assert.deepEqual(capturedWhereStartAt, {
      gte: new Date("2026-02-01T00:00:00.000Z"),
      lte: new Date("2026-03-15T23:59:59.999Z"),
    });
  } finally {
    db.event.findMany = originalFindMany;
  }
});

test("GET /api/events rejects invalid date input", async () => {
  const req = new NextRequest("http://localhost/api/events?from=not-a-date&to=2026-03-15&limit=200");
  const res = await getEvents(req);

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "invalid_request");
});

test("GET /api/events includes image fields for cards", async () => {
  const originalFindMany = db.event.findMany;
  const originalArtworkEventGroupBy = db.artworkEvent.groupBy;

  db.event.findMany = (async () => ([{
    id: "evt_1",
    slug: "test-event",
    title: "Test Event",
    description: null,
    startAt: new Date("2026-02-01T20:00:00.000Z"),
    endAt: null,
    timezone: "UTC",
    venueId: null,
    lat: null,
    lng: null,
    isPublished: true,
    publishedAt: null,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    featuredImageUrl: "https://example.com/featured.jpg",
    venue: null,
    images: [{ url: "https://example.com/gallery.jpg", isPrimary: false, sortOrder: 1, asset: null }],
    eventTags: [],
    eventArtists: [],
  } as any])) as typeof db.event.findMany;
  db.artworkEvent.groupBy = (async () => []) as typeof db.artworkEvent.groupBy;

  try {
    const req = new NextRequest("http://localhost/api/events?limit=1");
    const res = await getEvents(req);

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].featuredImageUrl, "https://example.com/gallery.jpg");
    assert.equal(body.items[0].primaryImageUrl, "https://example.com/gallery.jpg");
    assert.equal(Array.isArray(body.items[0].images), true);
  } finally {
    db.event.findMany = originalFindMany;
    db.artworkEvent.groupBy = originalArtworkEventGroupBy;
  }
});

test("GET /api/events returns structured image with failure/processing semantics and legacy flat fields", async () => {
  const originalFindMany = db.event.findMany;
  const originalArtworkEventGroupBy = db.artworkEvent.groupBy;

  db.event.findMany = (async () => ([{
    id: "evt_2",
    slug: "event-2",
    title: "Event 2",
    description: null,
    startAt: new Date("2026-02-01T20:00:00.000Z"),
    endAt: null,
    timezone: "UTC",
    venueId: null,
    lat: null,
    lng: null,
    isPublished: true,
    publishedAt: null,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    featuredImageUrl: "https://legacy.example/featured.jpg",
    venue: null,
    images: [{
      url: "https://legacy.example/gallery.jpg",
      isPrimary: true,
      sortOrder: 0,
      asset: {
        url: null,
        originalUrl: "https://blob.example/original.jpg",
        processingStatus: "UPLOADED",
        processingError: null,
        variants: [],
      },
    }],
    eventTags: [],
    eventArtists: [],
  } as any])) as typeof db.event.findMany;
  db.artworkEvent.groupBy = (async () => []) as typeof db.artworkEvent.groupBy;

  try {
    const res = await getEvents(new NextRequest("http://localhost/api/events?limit=1"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.items[0].image.url, "https://blob.example/original.jpg");
    assert.equal(body.items[0].image.source, "original");
    assert.equal(body.items[0].image.isProcessing, true);
    assert.equal(body.items[0].image.hasFailure, false);
    assert.equal(body.items[0].featuredImageUrl, "https://blob.example/original.jpg");
    assert.equal(body.items[0].primaryImageUrl, "https://blob.example/original.jpg");
  } finally {
    db.event.findMany = originalFindMany;
    db.artworkEvent.groupBy = originalArtworkEventGroupBy;
  }
});
