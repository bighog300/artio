import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handlePostMyVenue } from "@/lib/my-venue-create-route";

test("persists canonical geolocation fields on venue create", async () => {
  let createPayload: Record<string, unknown> | null = null;

  const req = new NextRequest("http://localhost/api/my/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Geo Venue",
      city: "Lisbon",
      country: "Portugal",
      addressLine1: "Rua Example 123",
      postcode: "1000-001",
      lat: 38.7223,
      lng: -9.1393,
    }),
  });

  const res = await handlePostMyVenue(req, {
    requireAuth: async () => ({ id: "user-1", email: "owner@example.com" }),
    findExistingManagedVenue: async () => null,
    findVenueBySlug: async () => null,
    assertCanCreateVenue: async () => undefined,
    createVenue: async (data) => {
      createPayload = data as unknown as Record<string, unknown>;
      return { id: "venue-1", slug: data.slug, name: data.name, isPublished: false };
    },
    ensureOwnerMembership: async () => undefined,
    upsertVenueDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.equal(createPayload?.addressLine1, "Rua Example 123");
  assert.equal(createPayload?.postcode, "1000-001");
  assert.equal(createPayload?.lat, 38.7223);
  assert.equal(createPayload?.lng, -9.1393);
});

test("maps legacy address and website fields on create", async () => {
  let createPayload: Record<string, unknown> | null = null;

  const req = new NextRequest("http://localhost/api/my/venues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Legacy Venue",
      city: "Porto",
      address: "Legacy Address 5",
      website: "https://legacy.example.com",
    }),
  });

  const res = await handlePostMyVenue(req, {
    requireAuth: async () => ({ id: "user-1", email: "owner@example.com" }),
    findExistingManagedVenue: async () => null,
    findVenueBySlug: async () => null,
    assertCanCreateVenue: async () => undefined,
    createVenue: async (data) => {
      createPayload = data as unknown as Record<string, unknown>;
      return { id: "venue-2", slug: data.slug, name: data.name, isPublished: false };
    },
    ensureOwnerMembership: async () => undefined,
    upsertVenueDraftSubmission: async () => undefined,
    setOnboardingFlag: async () => undefined,
    logAudit: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.equal(createPayload?.addressLine1, "Legacy Address 5");
  assert.equal(createPayload?.websiteUrl, "https://legacy.example.com");
});
