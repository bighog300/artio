import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleVenueSelfPublish } from "@/lib/my-venue-self-publish-route";

const venueId = "11111111-1111-4111-8111-111111111111";

function buildVenue(overrides: Partial<{ isPublished: boolean; deletedAt: Date | null }> = {}) {
  return {
    id: venueId,
    slug: "my-venue",
    name: "My Venue",
    description: "A complete venue profile with enough content for validation.",
    featuredAssetId: "asset-1",
    city: "London",
    country: "UK",
    websiteUrl: "https://example.com",
    deletedAt: null,
    isPublished: false,
    ...overrides,
  };
}

test("ADMIN can publish own venue directly", async () => {
  let state = buildVenue({ isPublished: false });
  const audits: string[] = [];
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/publish`, { method: "POST" });

  const res = await handleVenueSelfPublish(req, { venueId, isPublished: true }, {
    requireVenueRole: async () => ({ id: "admin-1", email: "admin@example.com", name: "Admin", role: "ADMIN" }),
    findVenueForPublish: async () => state,
    updateVenuePublishState: async (_, isPublished) => {
      state = { ...state, isPublished };
      return state;
    },
    logAdminAction: async ({ action }) => { audits.push(action); },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.venue.isPublished, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0], "VENUE_SELF_PUBLISH_TOGGLED");
});

test("ADMIN can unpublish venue directly", async () => {
  let state = buildVenue({ isPublished: true });
  const audits: string[] = [];
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/unpublish`, { method: "POST" });

  const res = await handleVenueSelfPublish(req, { venueId, isPublished: false }, {
    requireVenueRole: async () => ({ id: "admin-1", email: "admin@example.com", name: "Admin", role: "ADMIN" }),
    findVenueForPublish: async () => state,
    updateVenuePublishState: async (_, isPublished) => {
      state = { ...state, isPublished };
      return state;
    },
    logAdminAction: async ({ action }) => { audits.push(action); },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.venue.isPublished, false);
  assert.equal(audits.length, 1);
});

test("EDITOR cannot direct publish", async () => {
  let state = buildVenue({ isPublished: false });
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/publish`, { method: "POST" });

  const res = await handleVenueSelfPublish(req, { venueId, isPublished: true }, {
    requireVenueRole: async () => ({ id: "editor-1", email: "editor@example.com", name: "Editor", role: "EDITOR" }),
    findVenueForPublish: async () => state,
    updateVenuePublishState: async (_, isPublished) => {
      state = { ...state, isPublished };
      return state;
    },
    logAdminAction: async () => undefined,
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "forbidden");
  assert.equal(body.error.message, "Direct publishing not permitted");
  assert.equal(state.isPublished, false);
});

test("direct publish blocked if venue is archived", async () => {
  let state = buildVenue({ isPublished: false, deletedAt: new Date("2026-01-01T00:00:00.000Z") });
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/publish`, { method: "POST" });

  const res = await handleVenueSelfPublish(req, { venueId, isPublished: true }, {
    requireVenueRole: async () => ({ id: "admin-1", email: "admin@example.com", name: "Admin", role: "ADMIN" }),
    findVenueForPublish: async () => state,
    updateVenuePublishState: async (_, isPublished) => {
      state = { ...state, isPublished };
      return state;
    },
    logAdminAction: async () => undefined,
  });

  assert.equal(res.status, 409);
  assert.equal(state.isPublished, false);
});


test("Trusted Publisher can publish own venue directly", async () => {
  let state = buildVenue({ isPublished: false });
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/publish`, { method: "POST" });

  const res = await handleVenueSelfPublish(req, { venueId, isPublished: true }, {
    requireVenueRole: async () => ({ id: "editor-1", email: "trusted@example.com", name: "Trusted", role: "EDITOR", isTrustedPublisher: true }),
    findVenueForPublish: async () => state,
    updateVenuePublishState: async (_, isPublished) => {
      state = { ...state, isPublished };
      return state;
    },
    logAdminAction: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.equal(state.isPublished, true);
});

test("Trusted Publisher cannot publish someone else's venue", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/publish`, { method: "POST" });

  const res = await handleVenueSelfPublish(req, { venueId, isPublished: true }, {
    requireVenueRole: async () => {
      throw new Error("forbidden");
    },
    findVenueForPublish: async () => buildVenue(),
    updateVenuePublishState: async () => buildVenue({ isPublished: true }),
    logAdminAction: async () => undefined,
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.message, "Venue editor role required");
});

test("Revoked trusted publisher cannot publish and published state is unchanged", async () => {
  let state = buildVenue({ isPublished: true });
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/publish`, { method: "POST" });

  const res = await handleVenueSelfPublish(req, { venueId, isPublished: true }, {
    requireVenueRole: async () => ({ id: "editor-1", email: "editor@example.com", name: "Editor", role: "EDITOR", isTrustedPublisher: false }),
    findVenueForPublish: async () => state,
    updateVenuePublishState: async (_, isPublished) => {
      state = { ...state, isPublished };
      return state;
    },
    logAdminAction: async () => undefined,
  });

  assert.equal(res.status, 403);
  assert.equal(state.isPublished, true);
});
