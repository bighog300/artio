import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { handleCalendarEventsGet } from "@/lib/calendar/calendar-events";

const sampleRows = [
  {
    id: "b",
    title: "Event B",
    slug: "event-b",
    startAt: new Date("2026-04-01T10:00:00.000Z"),
    endAt: null,
    venue: { id: "venue-2", name: "Venue 2" },
    eventArtists: [{ artistId: "artist-2" }],
    images: [],
    featuredImageUrl: null,
  },
  {
    id: "a",
    title: "Event A",
    slug: "event-a",
    startAt: new Date("2026-04-01T10:00:00.000Z"),
    endAt: null,
    venue: { id: "venue-1", name: "Venue 1" },
    eventArtists: [{ artistId: "artist-1" }],
    images: [],
    featuredImageUrl: null,
  },
];

test("GET /api/calendar-events scope=all does not require auth and requests range + deterministic ordering", async () => {
  let capturedArgs: any;
  const response = await handleCalendarEventsGet(new NextRequest("http://localhost/api/calendar-events?scope=all&from=2026-04-01&to=2026-04-30"), {
    getUser: async () => NextResponse.json({ error: "should-not-auth" }, { status: 401 }),
    findFavorites: async () => [],
    findFollows: async () => [],
    findEvents: async (args) => {
      capturedArgs = args;
      return sampleRows;
    },
  } as never);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.items.map((item: { id: string }) => item.id), ["b", "a"]);
  assert.deepEqual(capturedArgs.orderBy, [{ startAt: "asc" }, { id: "asc" }]);
  assert.equal(capturedArgs.where.isPublished, true);
});

test("GET /api/calendar-events scope=saved requires auth and returns only saved IDs", async () => {
  const unauthorized = await handleCalendarEventsGet(new NextRequest("http://localhost/api/calendar-events?scope=saved&from=2026-04-01&to=2026-04-30"), {
    getUser: async () => NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 }),
    findFavorites: async () => [],
    findFollows: async () => [],
    findEvents: async () => [],
  } as never);
  assert.equal(unauthorized.status, 401);

  let capturedArgs: any;
  const authorized = await handleCalendarEventsGet(new NextRequest("http://localhost/api/calendar-events?scope=saved&from=2026-04-01&to=2026-04-30"), {
    getUser: async () => ({ id: "user-1" }),
    findFavorites: async () => [{ targetId: "a" }],
    findFollows: async () => [],
    findEvents: async (args) => {
      capturedArgs = args;
      return [sampleRows[1]];
    },
  } as never);
  const body = await authorized.json();

  assert.equal(authorized.status, 200);
  assert.deepEqual(capturedArgs.where.id, { in: ["a"] });
  assert.deepEqual(body.items.map((item: { id: string }) => item.id), ["a"]);
});

test("GET /api/calendar-events scope=following requires auth and filters by followed venues with stable ordering", async () => {
  let capturedArgs: any;
  const response = await handleCalendarEventsGet(new NextRequest("http://localhost/api/calendar-events?scope=following&from=2026-04-01&to=2026-04-30"), {
    getUser: async () => ({ id: "user-1" }),
    findFavorites: async () => [],
    findFollows: async () => [{ targetType: "VENUE", targetId: "venue-1" }],
    findEvents: async (args) => {
      capturedArgs = args;
      return [sampleRows[1]];
    },
  } as never);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(capturedArgs.orderBy, [{ startAt: "asc" }, { id: "asc" }]);
  assert.deepEqual(capturedArgs.where.OR, [{ venueId: { in: ["venue-1"] } }]);
  assert.deepEqual(body.items.map((item: { id: string }) => item.id), ["a"]);
});
