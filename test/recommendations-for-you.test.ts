import test from "node:test";
import assert from "node:assert/strict";
import { scoreForYouEvents, getForYouRecommendations } from "../lib/recommendations-for-you.ts";
import { handleForYouGet } from "../lib/api-recommendations-for-you.ts";
import { AuthError } from "../lib/auth.ts";

test("API rejects unauthenticated requests with 401 JSON (no redirect)", async () => {
  const req = {
    nextUrl: new URL("http://localhost/api/recommendations/for-you"),
    headers: new Headers({ cookie: "next-auth.session-token=fake" }),
  } as never;
  const res = await handleForYouGet(req, {
    requireAuthFn: async () => { throw new AuthError(); },
    getForYouRecommendationsFn: async () => ({ windowDays: 7, items: [], candidateCount: 0 }),
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("location"), null);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
});

test("API returns 401 only for AuthError from auth guard", async () => {
  const req = {
    nextUrl: new URL("http://localhost/api/recommendations/for-you"),
    headers: new Headers({ cookie: "next-auth.session-token=fake" }),
  } as never;

  const res = await handleForYouGet(req, {
    requireAuthFn: async () => { throw new AuthError(); },
    getForYouRecommendationsFn: async () => ({ windowDays: 7, items: [], candidateCount: 0 }),
  });

  assert.equal(res.status, 401);
});

test("API returns 500 for non-auth errors from auth guard", async () => {
  const req = {
    nextUrl: new URL("http://localhost/api/recommendations/for-you"),
    headers: new Headers({ cookie: "next-auth.session-token=fake" }),
  } as never;

  const res = await handleForYouGet(req, {
    requireAuthFn: async () => { throw new Error("boom"); },
    getForYouRecommendationsFn: async () => ({ windowDays: 7, items: [], candidateCount: 0 }),
  });

  assert.equal(res.status, 500);
});

test("scoring produces capped reasons and diversity dampening", () => {
  const now = new Date("2026-02-01T10:00:00.000Z");
  const venueId = "venue-1";
  const events = [1, 2, 3].map((n) => ({
    id: `e${n}`,
    title: `Event ${n}`,
    slug: `event-${n}`,
    startAt: new Date(`2026-02-0${n}T12:00:00.000Z`),
    lat: null,
    lng: null,
    venueId,
    venue: { name: "Venue", slug: "venue", city: null, lat: null, lng: null },
    images: [],
    eventArtists: [{ artistId: "a1" }],
    eventTags: [{ tagId: "t1", tag: { slug: "tag" } }],
  }));

  const ranked = scoreForYouEvents({
    now,
    events,
    followedVenueIds: new Set([venueId]),
    followedArtistIds: new Set(["a1"]),
    savedSearchMatches: new Map([["e1", ["Weekend near me"]]]),
    nearbyMatches: new Set(["e1", "e2", "e3"]),
    affinityVenueIds: new Set([venueId]),
    affinityArtistIds: new Set(["a1"]),
    affinityTagIds: new Set(["t1"]),
    likedVenueIds: new Set(),
    likedArtistIds: new Set(),
    likedTagIds: new Set(),
    dislikedVenueIds: new Set(),
    dislikedArtistIds: new Set(),
    dislikedTagIds: new Set(),
    locationLabel: "Bristol",
    radiusKm: 25,
  });

  assert.ok(ranked[0].reasons.length <= 3);
  const third = ranked.find((item) => item.event.id === "e3");
  assert.ok(third);
  assert.equal(third!.score, third!.rawScore - 3);
});

test("candidate pool cap and published filtering are respected", async () => {
  const allEvents = Array.from({ length: 450 }, (_, i) => ({
    id: `id-${i + 1}`,
    title: `Event ${i + 1}`,
    slug: `event-${i + 1}`,
    startAt: new Date("2026-03-10T10:00:00.000Z"),
    lat: null,
    lng: null,
    venueId: `v-${(i % 3) + 1}`,
    venue: { name: "Venue", slug: "venue", city: null, lat: null, lng: null },
    images: [],
    eventArtists: [{ artistId: `a-${(i % 4) + 1}` }],
    eventTags: [{ tagId: `t-${(i % 5) + 1}`, tag: { slug: "x" } }],
    isPublished: i % 9 !== 0,
  }));

  const db = {
    user: { findUnique: async () => ({ locationLat: null, locationLng: null, locationRadiusKm: 25, locationLabel: null }) },
    follow: { findMany: async () => [{ targetType: "VENUE", targetId: "v-1" }] },
    savedSearch: { findMany: async () => [] },
    engagementEvent: { findMany: async () => [] },
    event: {
      findMany: async (args: any) => {
        if (args.select?.id && !args.select?.title) {
          return allEvents.slice(0, Math.min(args.take ?? allEvents.length, allEvents.length)).map((e) => ({ id: e.id }));
        }
        const ids = new Set(args.where.id.in as string[]);
        return allEvents.filter((e) => ids.has(e.id) && e.isPublished).map((e) => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          startAt: e.startAt,
          lat: e.lat,
          lng: e.lng,
          venueId: e.venueId,
          venue: e.venue,
          images: e.images,
          eventArtists: e.eventArtists,
          eventTags: e.eventTags,
        }));
      },
    },
  } as never;

  const result = await getForYouRecommendations(db, { userId: "u1", days: 30, limit: 30 });
  assert.ok(result.candidateCount <= 400);
  const unpublishedIds = new Set(allEvents.filter((e) => !e.isPublished).map((e) => e.id));
  assert.equal(result.items.some((item) => unpublishedIds.has(item.event.id)), false);
});


test("recommendations exclude explicitly disliked events for 30 days", async () => {
  const now = new Date("2026-03-01T10:00:00.000Z");
  const realNow = Date.now;
  Date.now = () => now.getTime();

  const db = {
    user: { findUnique: async () => ({ locationLat: null, locationLng: null, locationRadiusKm: 25, locationLabel: null }) },
    follow: { findMany: async () => [{ targetType: "VENUE", targetId: "v-1" }] },
    savedSearch: { findMany: async () => [] },
    engagementEvent: {
      findMany: async () => [
        { targetId: "event-hidden", metaJson: { feedback: "down" } },
        { targetId: "event-visible", metaJson: { feedback: "up" } },
      ],
    },
    event: {
      findMany: async (args: any) => {
        if (args.select?.id && !args.select?.title && !args.select?.venueId) {
          return [{ id: "event-hidden" }, { id: "event-visible" }];
        }
        if (args.select?.venueId && args.select?.eventArtists && args.select?.eventTags && !args.select?.title) {
          return [
            { id: "event-hidden", venueId: "v-1", eventArtists: [], eventTags: [] },
            { id: "event-visible", venueId: "v-1", eventArtists: [], eventTags: [] },
          ];
        }
        const ids = new Set(args.where.id.in as string[]);
        const all = [
          { id: "event-hidden", title: "Hidden", slug: "hidden", startAt: new Date("2026-03-03T10:00:00.000Z"), venueId: "v-1" },
          { id: "event-visible", title: "Visible", slug: "visible", startAt: new Date("2026-03-04T10:00:00.000Z"), venueId: "v-1" },
        ];
        return all.filter((e) => ids.has(e.id)).map((e) => ({
          ...e,
          lat: null,
          lng: null,
          venue: { name: "Venue", slug: "venue", city: null, lat: null, lng: null },
          images: [],
          eventArtists: [],
          eventTags: [],
        }));
      },
    },
  } as never;

  const result = await getForYouRecommendations(db, { userId: "u-dislike", days: 30, limit: 10 });
  Date.now = realNow;
  assert.equal(result.items.some((item) => item.event.id === "event-hidden"), false);
  assert.equal(result.items.some((item) => item.event.id === "event-visible"), true);
});

test("liked similarity adds score boost and reason", () => {
  const now = new Date("2026-02-01T10:00:00.000Z");
  const baseEvent = {
    id: "evt-1",
    title: "Event",
    slug: "event",
    startAt: new Date("2026-02-03T10:00:00.000Z"),
    lat: null,
    lng: null,
    venueId: "venue-liked",
    venue: { name: "Venue", slug: "venue", city: null, lat: null, lng: null },
    images: [],
    eventArtists: [],
    eventTags: [],
  };

  const withoutLike = scoreForYouEvents({
    now,
    events: [baseEvent],
    followedVenueIds: new Set(),
    followedArtistIds: new Set(),
    savedSearchMatches: new Map(),
    nearbyMatches: new Set(),
    affinityVenueIds: new Set(),
    affinityArtistIds: new Set(),
    affinityTagIds: new Set(),
    likedVenueIds: new Set(),
    likedArtistIds: new Set(),
    likedTagIds: new Set(),
    dislikedVenueIds: new Set(),
    dislikedArtistIds: new Set(),
    dislikedTagIds: new Set(),
  })[0];

  const withLike = scoreForYouEvents({
    now,
    events: [baseEvent],
    followedVenueIds: new Set(),
    followedArtistIds: new Set(),
    savedSearchMatches: new Map(),
    nearbyMatches: new Set(),
    affinityVenueIds: new Set(),
    affinityArtistIds: new Set(),
    affinityTagIds: new Set(),
    likedVenueIds: new Set(["venue-liked"]),
    likedArtistIds: new Set(),
    likedTagIds: new Set(),
    dislikedVenueIds: new Set(),
    dislikedArtistIds: new Set(),
    dislikedTagIds: new Set(),
  })[0];

  assert.equal(withLike.score, withoutLike.score + 2);
  assert.equal(withLike.reasons.includes("Because you liked similar events"), true);
});
