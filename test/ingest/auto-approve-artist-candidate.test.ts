import test from "node:test";
import assert from "node:assert/strict";
import { autoApproveArtistCandidate, autoApproveArtistCandidateDeps } from "@/lib/ingest/auto-approve-artist-candidate";

type Candidate = {
  id: string;
  status: "PENDING" | "APPROVED";
  name: string;
  bio: string | null;
  mediums: string[];
  websiteUrl: string | null;
  sourceUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  extractionProvider: string | null;
  eventLinks: Array<{ eventId: string }>;
};

function createDb(candidate: Candidate) {
  const tx = {
    artist: {
      findFirst: async () => null,
      findMany: async () => [],
      findUnique: async () => null,
      create: async () => ({ id: "artist-1" }),
    },
    eventArtist: {
      upsert: async () => ({ id: "ea-1" }),
    },
    ingestExtractedArtist: {
      update: async () => ({ id: candidate.id }),
    },
  };

  return {
    ingestExtractedArtist: {
      findUnique: async () => candidate,
    },
    artist: {
      findFirst: async () => null,
      findUnique: async () => null,
      update: async () => ({ id: "artist-1" }),
    },
    $transaction: async <T>(fn: (trx: typeof tx) => Promise<T>) => fn(tx),
  };
}

const baseCandidate: Candidate = {
  id: "candidate-1",
  status: "PENDING",
  name: "Artist",
  bio: "Bio",
  mediums: ["Painting"],
  websiteUrl: "https://artist.example.com",
  sourceUrl: "https://en.wikipedia.org/wiki/Artist",
  instagramUrl: null,
  twitterUrl: null,
  extractionProvider: "openai",
  eventLinks: [],
};

const originalImporter = autoApproveArtistCandidateDeps.importApprovedArtistImage;

test.afterEach(() => {
  autoApproveArtistCandidateDeps.importApprovedArtistImage = originalImporter;
});

test("passes candidate websiteUrl and sourceUrl to image import", async () => {
  const db = createDb(baseCandidate);
  const calls: Array<Record<string, unknown>> = [];
  autoApproveArtistCandidateDeps.importApprovedArtistImage = async (args) => {
    calls.push(args as unknown as Record<string, unknown>);
    return { attached: false, warning: null, imageUrl: null };
  };

  const result = await autoApproveArtistCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: true,
  });

  assert.deepEqual(result, { artistId: "artist-1", published: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.websiteUrl, baseCandidate.websiteUrl);
  assert.equal(calls[0]?.sourceUrl, baseCandidate.sourceUrl);
});

test("resolves successfully even when image import rejects", async () => {
  const db = createDb(baseCandidate);
  autoApproveArtistCandidateDeps.importApprovedArtistImage = async () => {
    throw new Error("import failed");
  };

  const result = await autoApproveArtistCandidate({
    candidateId: baseCandidate.id,
    db: db as never,
    autoPublish: true,
  });

  assert.deepEqual(result, { artistId: "artist-1", published: true });
});
