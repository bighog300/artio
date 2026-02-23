import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handlePostMyVenue, VenueLimitReachedError } from "@/lib/my-venue-create-route";

test("creates venue, draft submission, owner membership and onboarding", async () => {
  const venues: Array<{ id: string; slug: string; name: string; isPublished: boolean }> = [];
  const memberships: Array<{ venueId: string; userId: string; role: string }> = [];
  const submissions: Array<{ venueId: string; userId: string; status: string }> = [];
  let onboardingCalls = 0;

  const req = new NextRequest("http://localhost/api/my/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Aurora Hall", city: "Lisbon", country: "Portugal" }),
  });

  const res = await handlePostMyVenue(req, {
    requireAuth: async () => ({ id: "user-1", email: "owner@example.com" }),
    findExistingManagedVenue: async () => null,
    findVenueBySlug: async (slug) => venues.find((item) => item.slug === slug) ?? null,
    assertCanCreateVenue: async () => undefined,
    createVenue: async (data) => {
      const venue = { id: "venue-1", slug: data.slug, name: data.name, isPublished: false };
      venues.push(venue);
      return venue;
    },
    ensureOwnerMembership: async (venueId, userId) => {
      memberships.push({ venueId, userId, role: "OWNER" });
    },
    upsertVenueDraftSubmission: async (venueId, userId) => {
      submissions.push({ venueId, userId, status: "DRAFT" });
    },
    setOnboardingFlag: async () => { onboardingCalls += 1; },
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.created, true);
  assert.equal(body.venue.slug, "aurora-hall");
  assert.equal(venues.length, 1);
  assert.deepEqual(memberships[0], { venueId: "venue-1", userId: "user-1", role: "OWNER" });
  assert.deepEqual(submissions[0], { venueId: "venue-1", userId: "user-1", status: "DRAFT" });
  assert.equal(onboardingCalls, 1);
});

test("is idempotent and returns existing managed venue", async () => {
  let createCalls = 0;
  const deps = {
    requireAuth: async () => ({ id: "user-1", email: "owner@example.com" }),
    findExistingManagedVenue: async () => ({ id: "venue-existing", slug: "existing-venue", name: "Existing Venue", isPublished: false }),
    findVenueBySlug: async () => null,
    assertCanCreateVenue: async () => undefined,
    createVenue: async () => {
      createCalls += 1;
      return { id: "venue-new", slug: "existing-venue-2", name: "Existing Venue", isPublished: false };
    },
    ensureOwnerMembership: async () => undefined,
    upsertVenueDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  };

  const first = await handlePostMyVenue(new NextRequest("http://localhost/api/my/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Existing Venue", city: "Paris" }),
  }), deps);
  const second = await handlePostMyVenue(new NextRequest("http://localhost/api/my/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Existing Venue", city: "Paris" }),
  }), deps);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(createCalls, 0);
  const body = await second.json();
  assert.equal(body.created, false);
  assert.equal(body.venue.id, "venue-existing");
});

test("validates required name and returns 400", async () => {
  const req = new NextRequest("http://localhost/api/my/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "A" }),
  });

  const res = await handlePostMyVenue(req, {
    requireAuth: async () => ({ id: "user-1" }),
    findExistingManagedVenue: async () => null,
    findVenueBySlug: async () => null,
    assertCanCreateVenue: async () => undefined,
    createVenue: async () => ({ id: "venue-1", slug: "a", name: "A", isPublished: false }),
    ensureOwnerMembership: async () => undefined,
    upsertVenueDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 400);
});

test("handles slug collisions with numeric suffix", async () => {
  const existing = new Set(["collision-hall"]);
  const req = new NextRequest("http://localhost/api/my/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Collision Hall" }),
  });

  const res = await handlePostMyVenue(req, {
    requireAuth: async () => ({ id: "user-2" }),
    findExistingManagedVenue: async () => null,
    findVenueBySlug: async (slug) => (existing.has(slug) ? { id: slug } : null),
    assertCanCreateVenue: async () => undefined,
    createVenue: async (data) => ({ id: "venue-2", slug: data.slug, name: data.name, isPublished: false }),
    ensureOwnerMembership: async () => undefined,
    upsertVenueDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.venue.slug, "collision-hall-2");
});

test("returns unauthorized when auth is missing", async () => {
  const req = new NextRequest("http://localhost/api/my/venues", { method: "POST" });
  const res = await handlePostMyVenue(req, {
    requireAuth: async () => { throw new Error("unauthorized"); },
    findExistingManagedVenue: async () => null,
    findVenueBySlug: async () => null,
    assertCanCreateVenue: async () => undefined,
    createVenue: async () => ({ id: "venue-1", slug: "x", name: "X", isPublished: false }),
    ensureOwnerMembership: async () => undefined,
    upsertVenueDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 401);
});

test("returns venue_limit_reached when owner already has 3 venues", async () => {
  const req = new NextRequest("http://localhost/api/my/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Limit Hall", city: "Lisbon" }),
  });

  const res = await handlePostMyVenue(req, {
    requireAuth: async () => ({ id: "publisher-1", role: "EDITOR" }),
    findExistingManagedVenue: async () => null,
    findVenueBySlug: async () => null,
    assertCanCreateVenue: async () => {
      throw new VenueLimitReachedError(3);
    },
    createVenue: async () => ({ id: "venue-limit", slug: "limit-hall", name: "Limit Hall", isPublished: false }),
    ensureOwnerMembership: async () => undefined,
    upsertVenueDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.deepEqual(body, { error: "venue_limit_reached", limit: 3 });
});

test("allows creation when owner has 2 venues", async () => {
  const req = new NextRequest("http://localhost/api/my/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Open Hall", city: "Lisbon" }),
  });

  let created = false;
  const res = await handlePostMyVenue(req, {
    requireAuth: async () => ({ id: "publisher-2", role: "EDITOR" }),
    findExistingManagedVenue: async () => null,
    findVenueBySlug: async () => null,
    assertCanCreateVenue: async () => undefined,
    createVenue: async () => {
      created = true;
      return { id: "venue-open", slug: "open-hall", name: "Open Hall", isPublished: false };
    },
    ensureOwnerMembership: async () => undefined,
    upsertVenueDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.equal(created, true);
});
