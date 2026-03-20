import test from "node:test";
import assert from "node:assert/strict";
import { autoApproveArtworkCandidate, autoApproveArtworkCandidateDeps } from "@/lib/ingest/auto-approve-artwork-candidate";

type Candidate = {
  id: string;
  status: "PENDING" | "APPROVED";
  title: string;
  artistName: string | null;
  sourceEventId: string;
  sourceEvent: { id: string; venueId: string | null } | null;
  sourceUrl: string;
  imageUrl: string | null;
  medium?: string | null;
  year?: number | null;
  dimensions?: string | null;
  description?: string | null;
};

function createDb(candidate: Candidate) {
  const tx = {
    artwork: {
      findUnique: async () => null,
      create: async () => ({ id: "artwork-1" }),
    },
    artworkEvent: {
      create: async () => ({ id: "ae-1" }),
    },
    artworkVenue: {
      create: async () => ({ id: "av-1" }),
    },
    ingestExtractedArtwork: {
      update: async () => ({ id: candidate.id }),
    },
  };

  return {
    ingestExtractedArtwork: {
      findUnique: async () => candidate,
    },
    artist: {
      findFirst: async () => ({ id: "artist-1" }),
      findUnique: async () => null,
      create: async () => ({ id: "artist-1" }),
    },
    artwork: {
      update: async () => ({ id: "artwork-1" }),
    },
    $transaction: async <T>(fn: (trx: typeof tx) => Promise<T>) => fn(tx),
  };
}

const baseCandidate: Candidate = {
  id: "candidate-1",
  status: "PENDING",
  title: "Sunrise",
  artistName: "Ari Artist",
  sourceEventId: "event-1",
  sourceEvent: { id: "event-1", venueId: "venue-1" },
  sourceUrl: "https://example.com/events/1",
  imageUrl: "https://example.com/image.jpg",
  medium: "Oil",
  year: 2024,
  dimensions: "20x30",
  description: "desc",
};

const originalImporter = autoApproveArtworkCandidateDeps.importApprovedArtworkImage;

test.afterEach(() => {
  autoApproveArtworkCandidateDeps.importApprovedArtworkImage = originalImporter;
});

test("passes candidate.imageUrl as candidateImageUrl when autoPublish=true", async () => {
  const db = createDb(baseCandidate);
  const calls: Array<Record<string, unknown>> = [];
  autoApproveArtworkCandidateDeps.importApprovedArtworkImage = async (args) => {
    calls.push(args as unknown as Record<string, unknown>);
    return { attached: false, warning: null, imageUrl: null };
  };

  const result = await autoApproveArtworkCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: true,
  });

  assert.deepEqual(result, { artworkId: "artwork-1", published: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.candidateImageUrl, baseCandidate.imageUrl);
});

test("still resolves when image import rejects", async () => {
  const db = createDb(baseCandidate);
  autoApproveArtworkCandidateDeps.importApprovedArtworkImage = async () => {
    throw new Error("import failed");
  };

  const result = await autoApproveArtworkCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: true,
  });

  assert.deepEqual(result, { artworkId: "artwork-1", published: false });
});

test("calls importer even when candidate.imageUrl is null", async () => {
  const db = createDb({ ...baseCandidate, imageUrl: null });
  const calls: Array<Record<string, unknown>> = [];
  autoApproveArtworkCandidateDeps.importApprovedArtworkImage = async (args) => {
    calls.push(args as unknown as Record<string, unknown>);
    return { attached: false, warning: null, imageUrl: null };
  };

  const result = await autoApproveArtworkCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: true,
  });

  assert.deepEqual(result, { artworkId: "artwork-1", published: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.candidateImageUrl, null);
});
