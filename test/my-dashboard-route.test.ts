import test from "node:test";
import assert from "node:assert/strict";
import { handleGetMyDashboard } from "@/lib/my-dashboard-route";

const now = new Date();
const day = (daysAgo: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));

function baseDeps() {
  return {
    requireAuth: async () => ({ id: "user-1", role: "EDITOR" as const }),
    findOwnedArtistByUserId: async () => ({
      id: "artist-1",
      name: "Artist",
      slug: "artist",
      bio: "bio",
      websiteUrl: "https://artist.test",
      featuredAssetId: "asset-1",
      avatarImageUrl: null,
      featuredAsset: { url: "https://img/avatar.jpg" },
    }),
    listManagedVenuesByUserId: async () => [{ id: "venue-1" }],
    listManagedVenueDetailsByUserId: async () => [],
    listArtworksByArtistId: async () => [],
    listEventsByContext: async () => [],
    listArtworkViewDailyRows: async () => [],
    listRecentAuditActivity: async () => [],
    listEventsPipelineByUserId: async () => [],
    listVenuesQuickPickByUserId: async () => [],
  };
}

test("/api/my/dashboard returns 401 when unauthenticated", async () => {
  const deps = baseDeps();
  deps.requireAuth = async () => { throw new Error("unauthorized"); };

  const res = await handleGetMyDashboard(deps);
  assert.equal(res.status, 401);
});

test("/api/my/dashboard returns onboarding payload when user has no artist", async () => {
  const deps = baseDeps();
  deps.findOwnedArtistByUserId = async () => null;

  const res = await handleGetMyDashboard(deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.needsOnboarding, true);
  assert.equal(body.nextHref, "/my/artist");
});



test("/api/my/dashboard includes events pipeline when provided", async () => {
  const deps = baseDeps();
  deps.listEventsPipelineByUserId = async () => [{
    id: "event-1",
    title: "Pipeline Event",
    startAtISO: day(-2).toISOString(),
    venueName: "Main Hall",
    statusLabel: "Changes requested",
    submissionStatus: "REJECTED",
    submittedAtISO: day(-3).toISOString(),
    decidedAtISO: day(-1).toISOString(),
    feedback: "Please update the event details before publishing.",
    isPublished: false,
  }];

  const res = await handleGetMyDashboard(deps);
  const body = await res.json();

  assert.equal(body.viewer.role, "EDITOR");
  assert.equal(body.eventsPipeline.items.length, 1);
  assert.equal(body.eventsPipeline.items[0].id, "event-1");
  assert.equal(body.eventsPipeline.items[0].statusLabel, "Changes requested");
  assert.equal(body.eventsPipeline.items[0].submissionStatus, "REJECTED");
  assert.equal(body.eventsPipeline.items[0].feedback, "Please update the event details before publishing.");
});


test("/api/my/dashboard sorts events pipeline by actionable priority", async () => {
  const deps = baseDeps();
  const now = new Date();
  const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

  deps.listEventsPipelineByUserId = async () => [
    {
      id: "submitted",
      title: "Submitted",
      startAtISO: iso(7 * 24 * 60 * 60 * 1000),
      updatedAtISO: iso(-1 * 60 * 60 * 1000),
      venueName: "Main Hall",
      statusLabel: "Submitted",
      submissionStatus: "IN_REVIEW",
      isPublished: false,
      featuredAssetId: "asset-submitted",
    },
    {
      id: "draft-ready",
      title: "Draft Ready",
      startAtISO: iso(5 * 24 * 60 * 60 * 1000),
      updatedAtISO: iso(-2 * 60 * 60 * 1000),
      venueName: "Main Hall",
      statusLabel: "Draft",
      submissionStatus: null,
      isPublished: false,
      featuredAssetId: "asset-ready",
    },
    {
      id: "needs-image",
      title: "Needs Image",
      startAtISO: iso(3 * 24 * 60 * 60 * 1000),
      updatedAtISO: iso(-3 * 60 * 60 * 1000),
      venueName: "Main Hall",
      statusLabel: "Draft",
      submissionStatus: null,
      isPublished: false,
      featuredAssetId: null,
      featuredImageUrl: null,
    },
    {
      id: "changes-requested",
      title: "Changes Requested",
      startAtISO: iso(2 * 24 * 60 * 60 * 1000),
      updatedAtISO: iso(-4 * 60 * 60 * 1000),
      venueName: "Main Hall",
      statusLabel: "Changes requested",
      submissionStatus: "REJECTED",
      isPublished: false,
      featuredAssetId: "asset-changes",
    },
    {
      id: "approved",
      title: "Approved",
      startAtISO: iso(9 * 24 * 60 * 60 * 1000),
      updatedAtISO: iso(-5 * 60 * 60 * 1000),
      venueName: "Main Hall",
      statusLabel: "Approved",
      submissionStatus: "APPROVED",
      isPublished: false,
      featuredAssetId: "asset-approved",
    },
    {
      id: "published-upcoming",
      title: "Published Upcoming",
      startAtISO: iso(10 * 24 * 60 * 60 * 1000),
      updatedAtISO: iso(-6 * 60 * 60 * 1000),
      venueName: "Main Hall",
      statusLabel: "Published",
      submissionStatus: null,
      isPublished: true,
      featuredAssetId: "asset-published",
    },
    {
      id: "published-past",
      title: "Published Past",
      startAtISO: iso(-2 * 24 * 60 * 60 * 1000),
      updatedAtISO: iso(-30 * 60 * 1000),
      venueName: "Main Hall",
      statusLabel: "Published",
      submissionStatus: null,
      isPublished: true,
      featuredAssetId: "asset-past",
    },
  ];

  const res = await handleGetMyDashboard(deps);
  const body = await res.json();

  assert.deepEqual(
    body.eventsPipeline.items.map((item: { id: string }) => item.id),
    ["changes-requested", "needs-image", "draft-ready", "submitted", "approved"],
  );
});

test("/api/my/dashboard includes venues quick-pick when provided", async () => {
  const deps = baseDeps();
  deps.listVenuesQuickPickByUserId = async () => [
    { id: "venue-1", name: "Main Hall" },
    { id: "venue-2", name: "Annex" },
  ];

  const res = await handleGetMyDashboard(deps);
  const body = await res.json();

  assert.deepEqual(body.venuesQuickPick, [
    { id: "venue-1", name: "Main Hall" },
    { id: "venue-2", name: "Annex" },
  ]);
});
test("/api/my/dashboard computes stats, inbox counts, and top artworks ordering", async () => {
  const deps = baseDeps();
  deps.listManagedVenuesByUserId = async () => [{ id: "venue-1" }, { id: "venue-2" }, { id: "venue-3" }];
  deps.listManagedVenueDetailsByUserId = async () => [
    { id: "venue-1", slug: "venue-one", name: "Venue One", city: "Paris", country: "FR", isPublished: true, featuredAssetId: "asset-1", featuredAsset: { url: "https://img/v1.jpg" }, submissions: [] },
    { id: "venue-2", slug: null, name: "Venue Two", city: null, country: null, isPublished: false, featuredAssetId: null, featuredAsset: null, submissions: [{ status: "IN_REVIEW" }] },
    { id: "venue-3", slug: "venue-three", name: "Venue Three", city: "Berlin", country: "DE", isPublished: false, featuredAssetId: null, featuredAsset: null, submissions: [{ status: "REJECTED" }] },
  ];
  deps.listArtworksByArtistId = async () => [
    { id: "a1", title: "Draft", slug: "draft", isPublished: false, featuredAssetId: null, updatedAt: day(1), featuredAsset: null, images: [], _count: { images: 0 } },
    { id: "a2", title: "Published High", slug: "high", isPublished: true, featuredAssetId: "asset-a2", updatedAt: day(2), featuredAsset: { url: "https://img/a2.jpg" }, images: [{ asset: { url: "https://img/a2.jpg" } }], _count: { images: 1 } },
  ];
  deps.listEventsByContext = async () => [
    { id: "e1", title: "No venue", slug: "event-1", startAt: day(-5), updatedAt: day(0), isPublished: false, venueId: null, venue: null },
    { id: "e2", title: "Venue set", slug: "event-2", startAt: day(-10), updatedAt: day(4), isPublished: true, venueId: "venue-1", venue: { name: "Hall" } },
  ];
  deps.listArtworkViewDailyRows = async () => [
    { entityId: "a2", day: day(0), views: 10 },
    { entityId: "a2", day: day(5), views: 6 },
  ];
  deps.findOwnedArtistByUserId = async () => ({
    id: "artist-1",
    name: "Artist",
    slug: "artist",
    bio: "",
    websiteUrl: "https://artist.test",
    featuredAssetId: null,
    avatarImageUrl: null,
    featuredAsset: null,
  });

  const res = await handleGetMyDashboard(deps);
  const body = await res.json();

  assert.equal(body.stats.artworks.total, 2);
  assert.equal(body.stats.artworks.drafts, 1);
  assert.equal(body.stats.artworks.missingCover, 1);
  assert.equal(body.stats.events.missingVenue, 1);
  assert.equal(body.stats.venues.submissionsPending, 1);

  const byId = Object.fromEntries(body.actionInbox.map((item: { id: string }) => [item.id, item]));
  assert.equal(byId["artwork-missing-cover"].count, 1);
  assert.equal(byId["venue-missing-cover"].count, 2);
  assert.equal(byId["venue-needs-edits"].count, 1);
  assert.equal(byId["venue-submitted"].count, 1);
  assert.equal(byId["venue-needs-edits"].severity, "warn");
  assert.equal(byId["venue-incomplete"].severity, "warn");
  assert.equal(byId["venue-needs-edits"].href, "/my/venues?filter=needsEdits");
  assert.equal(byId["venue-submitted"].href, "/my/venues?filter=submitted");
  assert.equal(byId["artwork-missing-cover"].href, "/my/artwork?filter=missingCover");
  assert.equal(byId["venue-incomplete"].href, "/my/venues?filter=missingCover");
  assert.equal(byId["profile-missing-bio"], undefined);

  const actionOrder = body.actionInbox.map((item: { id: string }) => item.id);
  assert.equal(actionOrder.indexOf("venue-needs-edits") < actionOrder.indexOf("venue-submitted"), true);
  const firstInfoIndex = body.actionInbox.findIndex((item: { severity: string }) => item.severity === "info");
  if (firstInfoIndex >= 0) {
    assert.equal(body.actionInbox.slice(0, firstInfoIndex).every((item: { severity: string }) => item.severity === "warn"), true);
  }
  assert.equal(actionOrder.includes("profile-missing-bio"), false);
  assert.equal(body.topArtworks30[0].id, "a2");
});

test("/api/my/dashboard prefers allowed audit activity in recent list", async () => {
  const deps = baseDeps();
  deps.listRecentAuditActivity = async () => [
    { action: "ARTWORK_UPDATED", targetId: "artwork-1", createdAt: day(0) },
    { action: "IGNORED_EVENT", targetId: "event-1", createdAt: day(1) },
  ];

  const res = await handleGetMyDashboard(deps);
  const body = await res.json();
  assert.equal(body.recent.length, 1);
  assert.match(body.recent[0].label, /Artwork Updated/i);
});

test("/api/my/dashboard includes scoped venue entities and venue stats", async () => {
  const deps = baseDeps();
  deps.listManagedVenuesByUserId = async () => [{ id: "venue-1" }, { id: "venue-2" }, { id: "venue-3" }];
  deps.listManagedVenueDetailsByUserId = async () => [
    { id: "venue-1", slug: "venue-one", name: "Venue One", city: "Paris", country: "FR", isPublished: true, featuredAssetId: "asset-1", featuredAsset: { url: "https://img/v1.jpg" }, submissions: [] },
    { id: "venue-2", slug: null, name: "Venue Two", city: null, country: null, isPublished: false, featuredAssetId: null, featuredAsset: null, submissions: [{ status: "IN_REVIEW" }] },
    { id: "venue-3", slug: "venue-three", name: "Venue Three", city: "Berlin", country: "DE", isPublished: false, featuredAssetId: null, featuredAsset: null, submissions: [{ status: "REJECTED" }] },
    { id: "venue-unmanaged", slug: "hidden", name: "Hidden Venue", city: null, country: null, isPublished: true, featuredAssetId: null, featuredAsset: null, submissions: [] },
  ];

  const res = await handleGetMyDashboard(deps);
  const body = await res.json();

  assert.equal(body.entities.venues.length, 3);
  assert.deepEqual(body.entities.venues.map((venue: { id: string }) => venue.id), ["venue-1", "venue-2", "venue-3"]);
  assert.equal(body.stats.venues.totalManaged, 3);
  assert.equal(body.stats.venues.published, 1);
  assert.equal(body.stats.venues.drafts, 2);
  assert.equal(body.stats.venues.submissionsPending, 1);
  assert.equal(body.links.venuesNewHref, "/my/venues/new");
  assert.equal(body.links.venuesHref, "/my/venues");
});

test("/api/my/dashboard falls back to synthesized recent updates", async () => {
  const deps = baseDeps();
  deps.listArtworksByArtistId = async () => [
    { id: "a1", title: "Draft", slug: "draft", isPublished: false, featuredAssetId: null, updatedAt: day(0), featuredAsset: null, images: [], _count: { images: 0 } },
  ];
  deps.listEventsByContext = async () => [
    { id: "e1", title: "Event", slug: "event-1", startAt: day(-1), updatedAt: day(1), isPublished: false, venueId: null, venue: null },
  ];

  const res = await handleGetMyDashboard(deps);
  const body = await res.json();
  assert.equal(body.recent.length, 2);
  assert.match(body.recent[0].label, /Updated artwork|Updated event/);
});
