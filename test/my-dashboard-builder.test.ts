import test from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { getMyDashboard } from "@/lib/my/dashboard/get-my-dashboard";

test("getMyDashboard returns validated payload with venue scope", async () => {
  const original = {
    venueMembershipFindMany: db.venueMembership.findMany,
    venueMembershipCount: db.venueMembership.count,
    artistFindUnique: db.artist.findUnique,
    eventFindMany: db.event.findMany,
    eventCount: db.event.count,
    artworkFindMany: db.artwork.findMany,
    artworkCount: db.artwork.count,
    venueInviteFindMany: db.venueInvite.findMany,
    accessRequestFindFirst: db.accessRequest.findFirst,
  };

  db.venueMembership.findMany = (async () => [
    {
      venueId: "venue-1",
      role: "OWNER",
      venue: {
        name: "Main Hall",
        city: "Paris",
        country: "FR",
        featuredAssetId: "asset-1",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        isPublished: false,
        submissions: [{ status: "IN_REVIEW" }],
      },
    },
  ]) as typeof db.venueMembership.findMany;

  db.artist.findUnique = (async () => ({ id: "artist-1" })) as typeof db.artist.findUnique;

  db.event.findMany = (async () => [
    {
      id: "event-1",
      title: "Opening Night",
      venueId: "venue-1",
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      startAt: new Date("2026-12-01T00:00:00.000Z"),
      isPublished: false,
      venue: { name: "Main Hall" },
      submissions: [{ status: "IN_REVIEW" }],
    },
  ]) as typeof db.event.findMany;

  db.artwork.findMany = (async () => [
    {
      id: "artwork-1",
      title: "Untitled",
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      isPublished: false,
      featuredAsset: null,
      _count: { images: 0 },
      venues: [],
    },
  ]) as typeof db.artwork.findMany;

  db.venueInvite.findMany = (async () => [
    {
      id: "invite-1",
      venueId: "venue-1",
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
    },
  ]) as typeof db.venueInvite.findMany;
  db.accessRequest.findFirst = (async () => null) as typeof db.accessRequest.findFirst;

  let eventCountCall = 0;
  db.event.count = (async () => {
    const results = [0, 1, 0, 0];
    return results[eventCountCall++] ?? 0;
  }) as typeof db.event.count;

  let venueCountCall = 0;
  db.venueMembership.count = (async () => {
    const results = [0, 1, 0, 0];
    return results[venueCountCall++] ?? 0;
  }) as typeof db.venueMembership.count;

  let artworkCountCall = 0;
  db.artwork.count = (async () => {
    const results = [1, 0];
    return results[artworkCountCall++] ?? 0;
  }) as typeof db.artwork.count;

  try {
    const data = await getMyDashboard({ userId: "user-1", venueId: "venue-1" });
    assert.equal(data.context.selectedVenueId, "venue-1");
    assert.equal(data.counts.venues.Submitted, 1);
    assert.equal(data.quickLists.venues[0]?.id, "venue-1");
    assert.equal(data.quickLists.upcomingEvents[0]?.id, "event-1");
    assert.equal(data.quickLists.recentArtwork[0]?.id, "artwork-1");
  } finally {
    db.venueMembership.findMany = original.venueMembershipFindMany;
    db.venueMembership.count = original.venueMembershipCount;
    db.artist.findUnique = original.artistFindUnique;
    db.event.findMany = original.eventFindMany;
    db.event.count = original.eventCount;
    db.artwork.findMany = original.artworkFindMany;
    db.artwork.count = original.artworkCount;
    db.venueInvite.findMany = original.venueInviteFindMany;
    db.accessRequest.findFirst = original.accessRequestFindFirst;
  }
});
