import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handlePatchMyEvent } from "@/lib/my-event-update-route";

const eventId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";

test("PATCH my event persists featuredAssetId", async () => {
  let updatedFeaturedAssetId: string | null | undefined;

  const req = new NextRequest(`http://localhost/api/my/events/${eventId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ featuredAssetId: assetId }),
  });

  const res = await handlePatchMyEvent(req, Promise.resolve({ eventId }), {
    requireAuth: async () => ({ id: "user-1" }),
    findSubmission: async () => ({
      id: "submission-1",
      submitterUserId: "user-1",
      status: "DRAFT",
      venue: { memberships: [{ id: "membership-1" }] },
      targetEvent: { isPublished: false },
    }),
    countOwnedAssets: async (assetIds) => {
      assert.deepEqual(assetIds, [assetId]);
      return 1;
    },
    updateEvent: async (_, data) => {
      updatedFeaturedAssetId = data.featuredAssetId;
      return { id: eventId, featuredAssetId: data.featuredAssetId ?? null };
    },
    updateSubmissionNote: async () => undefined,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(updatedFeaturedAssetId, assetId);
  assert.equal(body.featuredAssetId, assetId);
});

test("PATCH my event clears featuredAssetId", async () => {
  let updatedFeaturedAssetId: string | null | undefined = "existing";

  const req = new NextRequest(`http://localhost/api/my/events/${eventId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ featuredAssetId: null }),
  });

  const res = await handlePatchMyEvent(req, Promise.resolve({ eventId }), {
    requireAuth: async () => ({ id: "user-1" }),
    findSubmission: async () => ({
      id: "submission-1",
      submitterUserId: "user-1",
      status: "DRAFT",
      venue: { memberships: [{ id: "membership-1" }] },
      targetEvent: { isPublished: false },
    }),
    countOwnedAssets: async () => 0,
    updateEvent: async (_, data) => {
      updatedFeaturedAssetId = data.featuredAssetId;
      return { id: eventId, featuredAssetId: data.featuredAssetId ?? null };
    },
    updateSubmissionNote: async () => undefined,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(updatedFeaturedAssetId, null);
  assert.equal(body.featuredAssetId, null);
});
