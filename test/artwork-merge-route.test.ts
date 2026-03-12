import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAdminIngestArtworkMerge } from "../lib/admin-ingest-artwork-merge-route";

type Candidate = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  sourceEventId: string;
  medium: string | null;
  year: number | null;
  dimensions: string | null;
  description: string | null;
  sourceEvent: { venueId: string | null };
};

test("POST merge approves candidate and sets createdArtworkId", async () => {
  const candidate: Candidate = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "PENDING",
    sourceEventId: "22222222-2222-4222-8222-222222222222",
    medium: "Oil",
    year: 2020,
    dimensions: "20x30",
    description: "desc",
    sourceEvent: { venueId: "33333333-3333-4333-8333-333333333333" },
  };

  let updatedCandidate: { status?: string; createdArtworkId?: string } | null = null;

  const tx = {
    artwork: { update: async () => ({ id: "44444444-4444-4444-8444-444444444444" }) },
    ingestExtractedArtwork: {
      update: async ({ data }: { data: { status: string; createdArtworkId: string } }) => {
        updatedCandidate = data;
        candidate.status = data.status as Candidate["status"];
        return { id: candidate.id };
      },
    },
    artworkEvent: { createMany: async () => ({ count: 1 }) },
    artworkVenue: { createMany: async () => ({ count: 1 }) },
    adminAuditLog: { create: async () => ({ id: "audit-1" }) },
  };

  const req = new NextRequest("http://localhost/api/admin/ingest/artworks/11111111-1111-4111-8111-111111111111/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ existingArtworkId: "44444444-4444-4444-8444-444444444444" }),
  });

  const res = await handleAdminIngestArtworkMerge(req, { id: candidate.id }, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: {
      ingestExtractedArtwork: { findUnique: async () => candidate },
      artwork: {
        findUnique: async () => ({ id: "44444444-4444-4444-8444-444444444444", medium: null, year: null, dimensions: null, description: null }),
      },
      $transaction: async <T>(cb: (trx: typeof tx) => Promise<T>) => cb(tx),
    } as never,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { artworkId: "44444444-4444-4444-8444-444444444444", merged: true });
  assert.equal(updatedCandidate?.status, "APPROVED");
  assert.equal(updatedCandidate?.createdArtworkId, "44444444-4444-4444-8444-444444444444");
});

test("POST merge returns 409 for already-approved candidate", async () => {
  const req = new NextRequest("http://localhost/api/admin/ingest/artworks/11111111-1111-4111-8111-111111111111/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ existingArtworkId: "44444444-4444-4444-8444-444444444444" }),
  });

  const res = await handleAdminIngestArtworkMerge(req, { id: "11111111-1111-4111-8111-111111111111" }, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: {
      ingestExtractedArtwork: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          status: "APPROVED",
          sourceEventId: "22222222-2222-4222-8222-222222222222",
          medium: null,
          year: null,
          dimensions: null,
          description: null,
          sourceEvent: { venueId: null },
        }),
      },
      artwork: { findUnique: async () => ({ id: "44444444-4444-4444-8444-444444444444", medium: null, year: null, dimensions: null, description: null }) },
    } as never,
  });

  assert.equal(res.status, 409);
});

test("POST merge returns 404 when existingArtworkId does not exist", async () => {
  const req = new NextRequest("http://localhost/api/admin/ingest/artworks/11111111-1111-4111-8111-111111111111/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ existingArtworkId: "44444444-4444-4444-8444-444444444444" }),
  });

  const res = await handleAdminIngestArtworkMerge(req, { id: "11111111-1111-4111-8111-111111111111" }, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: {
      ingestExtractedArtwork: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          status: "PENDING",
          sourceEventId: "22222222-2222-4222-8222-222222222222",
          medium: null,
          year: null,
          dimensions: null,
          description: null,
          sourceEvent: { venueId: null },
        }),
      },
      artwork: { findUnique: async () => null },
    } as never,
  });

  assert.equal(res.status, 404);
});

test("POST merge creates artwork event and venue links", async () => {
  const calls = { eventLinks: 0, venueLinks: 0 };
  const tx = {
    artwork: { update: async () => ({ id: "44444444-4444-4444-8444-444444444444" }) },
    ingestExtractedArtwork: { update: async () => ({ id: "11111111-1111-4111-8111-111111111111" }) },
    artworkEvent: {
      createMany: async () => {
        calls.eventLinks += 1;
        return { count: 1 };
      },
    },
    artworkVenue: {
      createMany: async () => {
        calls.venueLinks += 1;
        return { count: 1 };
      },
    },
    adminAuditLog: { create: async () => ({ id: "audit-1" }) },
  };

  const req = new NextRequest("http://localhost/api/admin/ingest/artworks/11111111-1111-4111-8111-111111111111/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ existingArtworkId: "44444444-4444-4444-8444-444444444444" }),
  });

  const res = await handleAdminIngestArtworkMerge(req, { id: "11111111-1111-4111-8111-111111111111" }, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: {
      ingestExtractedArtwork: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          status: "PENDING",
          sourceEventId: "22222222-2222-4222-8222-222222222222",
          medium: null,
          year: null,
          dimensions: null,
          description: null,
          sourceEvent: { venueId: "33333333-3333-4333-8333-333333333333" },
        }),
      },
      artwork: { findUnique: async () => ({ id: "44444444-4444-4444-8444-444444444444", medium: null, year: null, dimensions: null, description: null }) },
      $transaction: async <T>(cb: (trx: typeof tx) => Promise<T>) => cb(tx),
    } as never,
  });

  assert.equal(res.status, 200);
  assert.equal(calls.eventLinks, 1);
  assert.equal(calls.venueLinks, 1);
});
