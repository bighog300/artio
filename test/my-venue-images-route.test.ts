import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleCreateVenueImage, handleDeleteVenueImage, handlePatchVenueImage, handleReorderVenueImages, handleSetVenueCover } from "../lib/my-venue-images-route.ts";

const venueId = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";

test("create venue image returns unauthorized for anonymous user", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/images`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/a.jpg" }),
  });

  const res = await handleCreateVenueImage(req, Promise.resolve({ id: venueId }), {
    requireAuth: async () => { throw new Error("unauthorized"); },
    requireVenueMembership: async () => undefined,
    findMaxSortOrder: async () => 0,
    findAssetById: async () => null,
    createVenueImage: async () => ({ id: imageId, venueId, assetId: null, url: "https://example.com/a.jpg", alt: null, sortOrder: 1 }),
  });

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "unauthorized");
});

test("create venue image resolves assetId and stores asset-backed url", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/images`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assetId: "33333333-3333-4333-8333-333333333333", alt: "cover" }),
  });

  const res = await handleCreateVenueImage(req, Promise.resolve({ id: venueId }), {
    requireAuth: async () => ({ id: "user-1" }),
    requireVenueMembership: async () => undefined,
    findMaxSortOrder: async () => 1,
    findAssetById: async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      url: "https://cdn.example.com/venue.jpg",
      width: 1200,
      height: 800,
      mime: "image/jpeg",
      mimeType: null,
      sizeBytes: 2200,
      byteSize: null,
    }),
    createVenueImage: async (input) => {
      assert.equal(input.assetId, "33333333-3333-4333-8333-333333333333");
      assert.equal(input.url, "https://cdn.example.com/venue.jpg");
      return { id: imageId, venueId, assetId: input.assetId, url: input.url, alt: input.alt, sortOrder: input.sortOrder };
    },
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.image.assetId, "33333333-3333-4333-8333-333333333333");
});

test("patch venue image returns forbidden when user is not venue member", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/images/${imageId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ alt: "new" }),
  });

  const res = await handlePatchVenueImage(req, Promise.resolve({ imageId }), {
    requireAuth: async () => ({ id: "user-1" }),
    findVenueImageForUser: async () => null,
    updateVenueImageAlt: async () => ({ id: imageId, venueId, url: "https://example.com/a.jpg", alt: "new", sortOrder: 1 }),
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "forbidden");
});

test("delete venue image validates image id", async () => {
  const req = new NextRequest("http://localhost/api/my/venues/images/not-a-uuid", { method: "DELETE" });
  const res = await handleDeleteVenueImage(req, Promise.resolve({ imageId: "not-a-uuid" }), {
    requireAuth: async () => ({ id: "user-1" }),
    findVenueImageForUser: async () => null,
    deleteVenueImage: async () => ({ id: imageId, venueId, url: "https://example.com/a.jpg", alt: null, sortOrder: 1 }),
    deleteBlobByUrl: async () => undefined,
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "invalid_request");
});

test("reorder venue images rejects ids outside venue", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/images/reorder`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderedIds: [imageId, "33333333-3333-4333-8333-333333333333"] }),
  });

  const res = await handleReorderVenueImages(req, Promise.resolve({ id: venueId }), {
    requireAuth: async () => ({ id: "user-1" }),
    requireVenueMembership: async () => undefined,
    findVenueImageIds: async () => [imageId],
    reorderVenueImages: async () => undefined,
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "invalid_request");
});

test("set venue cover returns unauthorized for anonymous user", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/cover`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageId }),
  });

  const res = await handleSetVenueCover(req, Promise.resolve({ id: venueId }), {
    requireAuth: async () => { throw new Error("unauthorized"); },
    requireVenueMembership: async () => undefined,
    findVenueImageById: async () => ({ id: imageId, url: "https://example.com/a.jpg", assetId: null }),
    updateVenueCover: async () => ({ featuredAssetId: null, featuredImageUrl: "https://example.com/a.jpg" }),
  });

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "unauthorized");
});

test("set venue cover returns forbidden when user is not member", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/cover`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageId }),
  });

  const res = await handleSetVenueCover(req, Promise.resolve({ id: venueId }), {
    requireAuth: async () => ({ id: "user-1" }),
    requireVenueMembership: async () => { throw new Error("forbidden"); },
    findVenueImageById: async () => ({ id: imageId, url: "https://example.com/a.jpg", assetId: null }),
    updateVenueCover: async () => ({ featuredAssetId: null, featuredImageUrl: "https://example.com/a.jpg" }),
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "forbidden");
});

test("set venue cover returns invalid_request when image does not belong to venue", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/cover`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageId }),
  });

  const res = await handleSetVenueCover(req, Promise.resolve({ id: venueId }), {
    requireAuth: async () => ({ id: "user-1" }),
    requireVenueMembership: async () => undefined,
    findVenueImageById: async () => null,
    updateVenueCover: async () => ({ featuredAssetId: null, featuredImageUrl: "https://example.com/a.jpg" }),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "invalid_request");
});

test("set venue cover sets featuredAssetId when selected image has asset", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/cover`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageId }),
  });

  const res = await handleSetVenueCover(req, Promise.resolve({ id: venueId }), {
    requireAuth: async () => ({ id: "user-1" }),
    requireVenueMembership: async () => undefined,
    findVenueImageById: async () => ({ id: imageId, url: "https://example.com/a.jpg", assetId: "33333333-3333-4333-8333-333333333333" }),
    updateVenueCover: async (_venueId, payload) => {
      assert.deepEqual(payload, { featuredAssetId: "33333333-3333-4333-8333-333333333333", featuredImageUrl: null });
      return payload;
    },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.cover.featuredAssetId, "33333333-3333-4333-8333-333333333333");
  assert.equal(body.cover.featuredImageUrl, null);
});

test("set venue cover sets featuredImageUrl when selected image has no asset", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/cover`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ venueImageId: imageId }),
  });

  const res = await handleSetVenueCover(req, Promise.resolve({ id: venueId }), {
    requireAuth: async () => ({ id: "user-1" }),
    requireVenueMembership: async () => undefined,
    findVenueImageById: async () => ({ id: imageId, url: "https://example.com/no-asset.jpg", assetId: null }),
    updateVenueCover: async (_venueId, payload) => {
      assert.deepEqual(payload, { featuredAssetId: null, featuredImageUrl: "https://example.com/no-asset.jpg" });
      return payload;
    },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.cover.featuredAssetId, null);
  assert.equal(body.cover.featuredImageUrl, "https://example.com/no-asset.jpg");
});

test("set venue cover clears cover when imageId is null", async () => {
  const req = new NextRequest(`http://localhost/api/my/venues/${venueId}/cover`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageId: null }),
  });

  const res = await handleSetVenueCover(req, Promise.resolve({ id: venueId }), {
    requireAuth: async () => ({ id: "user-1" }),
    requireVenueMembership: async () => undefined,
    findVenueImageById: async () => {
      throw new Error("should_not_lookup_image");
    },
    updateVenueCover: async (_venueId, payload) => {
      assert.deepEqual(payload, { featuredAssetId: null, featuredImageUrl: null });
      return payload;
    },
  });

  assert.equal(res.status, 200);
});
