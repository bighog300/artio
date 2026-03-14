import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleMyArtistSubmit } from "../lib/my-artist-submit-route.ts";

const completeArtist = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ari-chen",
  name: "Ari Chen",
  bio: "A multidisciplinary artist exploring memory, migration, and speculative architecture through mixed media.",
  websiteUrl: "https://ari.example",
  featuredAssetId: "22222222-2222-4222-8222-222222222222",
  featuredImageUrl: null,
  featuredAsset: { url: "https://cdn.example/cover-from-asset.jpg" },
  images: [{ id: "img-1" }],
};

test("handleMyArtistSubmit returns unauthorized when user is anonymous", async () => {
  const req = new NextRequest("http://localhost/api/my/artist/submit", { method: "POST" });
  const res = await handleMyArtistSubmit(req, {
    requireAuth: async () => { throw new Error("unauthorized"); },
    findOwnedArtistByUserId: async () => completeArtist,
    getLatestSubmissionStatus: async () => null,
    createSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), submittedAt: new Date() }),
    enqueueSubmissionNotification: async () => undefined,
  });
  assert.equal(res.status, 401);
});

test("handleMyArtistSubmit returns forbidden when user has no owned artist", async () => {
  const req = new NextRequest("http://localhost/api/my/artist/submit", { method: "POST" });
  const res = await handleMyArtistSubmit(req, {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    findOwnedArtistByUserId: async () => null,
    getLatestSubmissionStatus: async () => null,
    createSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), submittedAt: new Date() }),
    enqueueSubmissionNotification: async () => undefined,
  });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "forbidden");
});

test("handleMyArtistSubmit returns NOT_READY with blocking checks", async () => {
  const req = new NextRequest("http://localhost/api/my/artist/submit", { method: "POST" });
  const res = await handleMyArtistSubmit(req, {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    findOwnedArtistByUserId: async () => ({ ...completeArtist, bio: "too short", featuredAssetId: null, images: [] }),
    getLatestSubmissionStatus: async () => null,
    createSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), submittedAt: new Date() }),
    enqueueSubmissionNotification: async () => undefined,
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "NOT_READY");
  assert.equal(Array.isArray(body.blocking), true);
  assert.equal(body.blocking.some((item: { id: string }) => item.id === "artist-avatar"), true);
});

test("handleMyArtistSubmit creates submission when artist is complete", async () => {
  let created = false;
  const req = new NextRequest("http://localhost/api/my/artist/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Ready for review" }),
  });

  const res = await handleMyArtistSubmit(req, {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    findOwnedArtistByUserId: async () => completeArtist,
    getLatestSubmissionStatus: async () => null,
    createSubmission: async (input) => {
      created = true;
      assert.equal(input.message, "Ready for review");
      assert.equal(input.snapshot.coverUrl, "https://cdn.example/cover-from-asset.jpg");
      return { id: "sub-1", status: "IN_REVIEW", createdAt: new Date("2026-01-01T00:00:00.000Z"), submittedAt: new Date() };
    },
    enqueueSubmissionNotification: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.equal(created, true);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const body = await res.json();
  assert.equal(body.submission.id, "sub-1");
});

test("handleMyArtistSubmit falls back to featuredImageUrl when featuredAsset is missing", async () => {
  const req = new NextRequest("http://localhost/api/my/artist/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Ready for review" }),
  });

  await handleMyArtistSubmit(req, {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    findOwnedArtistByUserId: async () => ({ ...completeArtist, featuredAsset: null, featuredImageUrl: "https://legacy.example/cover.jpg" }),
    getLatestSubmissionStatus: async () => null,
    createSubmission: async (input) => {
      assert.equal(input.snapshot.coverUrl, "https://legacy.example/cover.jpg");
      return { id: "sub-1", status: "IN_REVIEW", createdAt: new Date("2026-01-01T00:00:00.000Z"), submittedAt: new Date() };
    },
    enqueueSubmissionNotification: async () => undefined,
  });
});

test("handleMyArtistSubmit stores null coverUrl when no asset or legacy image exists", async () => {
  const req = new NextRequest("http://localhost/api/my/artist/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Ready for review" }),
  });

  await handleMyArtistSubmit(req, {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    findOwnedArtistByUserId: async () => ({ ...completeArtist, featuredAsset: null, featuredImageUrl: null }),
    getLatestSubmissionStatus: async () => null,
    createSubmission: async (input) => {
      assert.equal(input.snapshot.coverUrl, null);
      return { id: "sub-1", status: "IN_REVIEW", createdAt: new Date("2026-01-01T00:00:00.000Z"), submittedAt: new Date() };
    },
    enqueueSubmissionNotification: async () => undefined,
  });
});

test("handleMyArtistSubmit returns 409 when already submitted", async () => {
  const req = new NextRequest("http://localhost/api/my/artist/submit", { method: "POST" });
  const res = await handleMyArtistSubmit(req, {
    requireAuth: async () => ({ id: "user-1", email: "user@example.com" }),
    findOwnedArtistByUserId: async () => completeArtist,
    getLatestSubmissionStatus: async () => "IN_REVIEW",
    createSubmission: async () => ({ id: "sub-1", status: "IN_REVIEW", createdAt: new Date(), submittedAt: new Date() }),
    enqueueSubmissionNotification: async () => undefined,
  });
  assert.equal(res.status, 409);
});
