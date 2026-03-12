import test from "node:test";
import assert from "node:assert/strict";
import { autoApproveArtworkCandidate } from "../lib/ingest/auto-approve-artwork-candidate";
import { handleAdminIngestArtworkApprove } from "../app/api/admin/ingest/artworks/[id]/approve/route";

type ArtworkCandidate = {
  id: string;
  status: "PENDING" | "APPROVED";
  title: string;
  artistName: string | null;
  sourceEventId: string;
  sourceEvent: { id: string; venueId: string | null };
  sourceUrl: string;
  imageUrl: string | null;
  runId: string;
  medium?: string | null;
  year?: number | null;
  dimensions?: string | null;
  description?: string | null;
};

const baseCandidate: ArtworkCandidate = {
  id: "candidate-1",
  status: "PENDING",
  title: "Blue Sky",
  artistName: "Ari Artist",
  sourceEventId: "event-1",
  sourceEvent: { id: "event-1", venueId: "venue-1" },
  medium: "Oil",
  year: 2024,
  dimensions: "20x30",
  description: "desc",
  sourceUrl: "https://example.com/events/1",
  imageUrl: null,
  runId: "run-1",
};

function createAutoApproveDb({
  candidate = baseCandidate,
  existingBySlug = new Set<string>(),
}: {
  candidate?: ArtworkCandidate;
  existingBySlug?: Set<string>;
}) {
  const calls = {
    findUniqueSlug: [] as string[],
    artworkCreatePayloads: [] as Array<Record<string, unknown>>,
  };

  const tx = {
    artwork: {
      findUnique: async ({ where }: { where: { slug: string } }) => {
        calls.findUniqueSlug.push(where.slug);
        return existingBySlug.has(where.slug) ? { id: `existing-${where.slug}` } : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.artworkCreatePayloads.push(data);
        return { id: "artwork-1" };
      },
    },
    artworkEvent: {
      create: async () => ({ id: "artwork-event-1" }),
    },
    artworkVenue: {
      create: async () => ({ id: "artwork-venue-1" }),
    },
    ingestExtractedArtwork: {
      update: async () => ({ id: candidate.id }),
    },
  };

  const db = {
    ingestExtractedArtwork: {
      findUnique: async () => candidate,
    },
    artist: {
      findFirst: async () => ({ id: "artist-1" }),
    },
    artwork: {
      update: async () => ({ id: "artwork-1" }),
    },
    $transaction: async <T>(fn: (trx: typeof tx) => Promise<T>) => fn(tx),
  };

  return { db, calls };
}

test("auto-approve generates artwork slug from candidate title", async () => {
  const { db, calls } = createAutoApproveDb({});

  const result = await autoApproveArtworkCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: false,
  });

  assert.deepEqual(result, { artworkId: "artwork-1", published: false });
  assert.equal(calls.findUniqueSlug[0], "blue-sky");
  assert.equal(calls.artworkCreatePayloads[0]?.slug, "blue-sky");
});

test("auto-approve resolves slug collision with numeric suffix", async () => {
  const { db, calls } = createAutoApproveDb({ existingBySlug: new Set(["blue-sky"]) });

  const result = await autoApproveArtworkCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: false,
  });

  assert.deepEqual(result, { artworkId: "artwork-1", published: false });
  assert.deepEqual(calls.findUniqueSlug, ["blue-sky", "blue-sky-2"]);
  assert.equal(calls.artworkCreatePayloads[0]?.slug, "blue-sky-2");
});

test("admin approval route also generates artwork slug", async () => {
  const calls = {
    findUniqueSlug: [] as string[],
    artworkCreatePayloads: [] as Array<Record<string, unknown>>,
  };

  const candidate = { ...baseCandidate, id: "candidate-2" };

  const tx = {
    artwork: {
      findUnique: async ({ where }: { where: { slug: string } }) => {
        calls.findUniqueSlug.push(where.slug);
        return null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.artworkCreatePayloads.push(data);
        return { id: "artwork-2" };
      },
    },
    artworkEvent: { create: async () => ({ id: "ae-1" }) },
    artworkVenue: { create: async () => ({ id: "av-1" }) },
    ingestExtractedArtwork: { update: async () => ({ id: candidate.id }) },
  };

  const response = await handleAdminIngestArtworkApprove(
    { params: Promise.resolve({ id: candidate.id }) },
    {
      requireAdmin: async () => ({ id: "admin-1", role: "ADMIN" } as never),
      db: {
        ingestExtractedArtwork: { findUnique: async () => candidate },
        artist: { findFirst: async () => ({ id: "artist-1" }) },
        $transaction: async <T>(fn: (trx: typeof tx) => Promise<T>) => fn(tx),
      } as never,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(calls.findUniqueSlug[0], "blue-sky");
  assert.equal(calls.artworkCreatePayloads[0]?.slug, "blue-sky");
});
