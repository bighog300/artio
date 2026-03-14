import test from "node:test";
import assert from "node:assert/strict";
import { autoApproveArtworkCandidate } from "../lib/ingest/auto-approve-artwork-candidate";

type Candidate = {
  id: string;
  status: "PENDING" | "APPROVED";
  title: string;
  artistName: string | null;
  sourceEventId: string;
  sourceEvent: { id: string; venueId: string | null } | null;
  sourceUrl: string;
  imageUrl: string | null;
  runId: string;
  medium?: string | null;
  year?: number | null;
  dimensions?: string | null;
  description?: string | null;
};

function createDb(args: { candidate: Candidate; artistId: string | null }) {
  const calls = {
    artworkUpdate: [] as unknown[],
    transactionCalled: 0,
  };

  const tx = {
    artwork: {
      findUnique: async () => null,
      create: async () => ({ id: "artwork-1" }),
    },
    artworkEvent: {
      create: async () => ({ id: "artwork-event-1" }),
    },
    artworkVenue: {
      create: async () => ({ id: "artwork-venue-1" }),
    },
    ingestExtractedArtwork: {
      update: async () => ({ id: args.candidate.id }),
    },
  };

  const db = {
    ingestExtractedArtwork: {
      findUnique: async () => args.candidate,
    },
    artist: {
      findFirst: async () => (args.artistId ? { id: args.artistId } : null),
    },
    artwork: {
      update: async (payload: unknown) => {
        calls.artworkUpdate.push(payload);
        return { id: "artwork-1" };
      },
    },
    $transaction: async <T>(fn: (trx: typeof tx) => Promise<T>) => {
      calls.transactionCalled += 1;
      return fn(tx);
    },
  };

  return { db, calls };
}

const baseCandidate: Candidate = {
  id: "candidate-1",
  status: "PENDING",
  title: "Sunrise",
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

test("autoApproveArtworkCandidate does not publish when image is missing", async () => {
  const { db, calls } = createDb({ candidate: baseCandidate, artistId: "artist-1" });

  const result = await autoApproveArtworkCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: true,
  });

  assert.deepEqual(result, { artworkId: "artwork-1", published: false });
  assert.equal(calls.artworkUpdate.length, 0);
});


test("autoApproveArtworkCandidate does not publish when image import fails", async () => {
  const candidateWithImageUrl = { ...baseCandidate, imageUrl: "https://example.com/image.jpg" };
  const { db, calls } = createDb({ candidate: candidateWithImageUrl, artistId: "artist-1" });

  const result = await autoApproveArtworkCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: true,
  });

  assert.deepEqual(result, { artworkId: "artwork-1", published: false });
  assert.equal(calls.artworkUpdate.length, 0);
});

test("autoApproveArtworkCandidate does not publish artwork when autoPublish=false", async () => {
  const { db, calls } = createDb({ candidate: baseCandidate, artistId: "artist-1" });

  const result = await autoApproveArtworkCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: false,
  });

  assert.deepEqual(result, { artworkId: "artwork-1", published: false });
  assert.equal(calls.artworkUpdate.length, 0);
});

test("autoApproveArtworkCandidate returns null when artist cannot be resolved", async () => {
  const candidateWithoutArtist = { ...baseCandidate, artistName: null };
  const { db, calls } = createDb({ candidate: candidateWithoutArtist, artistId: null });

  const result = await autoApproveArtworkCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: true,
  });

  assert.equal(result, null);
  assert.equal(calls.transactionCalled, 0);
  assert.equal(calls.artworkUpdate.length, 0);
});
