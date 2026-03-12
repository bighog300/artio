import test from "node:test";
import assert from "node:assert/strict";
import { importApprovedArtworkImage } from "../lib/ingest/import-approved-artwork-image";

const previousImageEnabled = process.env.AI_INGEST_IMAGE_ENABLED;

test.after(() => {
  process.env.AI_INGEST_IMAGE_ENABLED = previousImageEnabled;
});

test("imports artwork candidate image into Asset and ArtworkImage and updates featuredAssetId", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  const calls = {
    artworkImageCreate: 0,
    artworkUpdate: 0,
  };

  const result = await importApprovedArtworkImage({
    appDb: {
      artwork: {
        findUnique: async () => ({ featuredAssetId: null, featuredAsset: null }),
        update: async () => {
          calls.artworkUpdate += 1;
          return { id: "artwork-1" };
        },
      },
      artworkImage: {
        create: async ({ data }) => {
          calls.artworkImageCreate += 1;
          assert.equal(data.artworkId, "artwork-1");
          assert.equal(data.assetId, "asset-1");
          return { id: "artwork-image-1" };
        },
      },
      asset: {
        create: async ({ data }) => {
          assert.equal(data.kind, "IMAGE");
          return { id: "asset-1", url: "https://blob.example/artwork.jpg" };
        },
      },
    },
    candidateId: "candidate-1",
    runId: "run-1",
    artworkId: "artwork-1",
    title: "Blue Sky",
    sourceUrl: "https://example.com/event",
    candidateImageUrl: "https://cdn.example.com/artwork.jpg",
    requestId: "request-1",
  }, {
    fetchImageWithGuards: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      sizeBytes: 3,
      contentType: "image/jpeg",
      finalUrl: "https://cdn.example.com/artwork.jpg",
    }),
    uploadArtworkImageToBlob: async () => ({
      url: "https://blob.example/artwork.jpg",
      path: "artworks/ingest/artwork-1/candidate-1/image.jpg",
    }),
  });

  assert.equal(calls.artworkImageCreate, 1);
  assert.equal(calls.artworkUpdate, 1);
  assert.deepEqual(result, { attached: true, warning: null, imageUrl: "https://blob.example/artwork.jpg" });
});

test("skips import when artwork already has featuredAssetId", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  let fetchImageCalls = 0;

  const result = await importApprovedArtworkImage({
    appDb: {
      artwork: {
        findUnique: async () => ({ featuredAssetId: "asset-existing", featuredAsset: { url: "https://blob.example/existing.jpg" } }),
        update: async () => ({ id: "artwork-1" }),
      },
      artworkImage: {
        create: async () => ({ id: "artwork-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artwork.jpg" }),
      },
    },
    candidateId: "candidate-1",
    runId: "run-1",
    artworkId: "artwork-1",
    title: "Blue Sky",
    sourceUrl: "https://example.com/event",
    candidateImageUrl: "https://cdn.example.com/artwork.jpg",
    requestId: "request-1",
  }, {
    fetchImageWithGuards: async () => {
      fetchImageCalls += 1;
      return {
        bytes: new Uint8Array([1, 2, 3]),
        sizeBytes: 3,
        contentType: "image/jpeg",
        finalUrl: "https://cdn.example.com/artwork.jpg",
      };
    },
    uploadArtworkImageToBlob: async () => ({
      url: "https://blob.example/artwork.jpg",
      path: "artworks/ingest/artwork-1/candidate-1/image.jpg",
    }),
  });

  assert.equal(fetchImageCalls, 0);
  assert.deepEqual(result, { attached: false, warning: null, imageUrl: "https://blob.example/existing.jpg" });
});

test("returns warning when image fetch fails", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  const result = await importApprovedArtworkImage({
    appDb: {
      artwork: {
        findUnique: async () => ({ featuredAssetId: null, featuredAsset: null }),
        update: async () => ({ id: "artwork-1" }),
      },
      artworkImage: {
        create: async () => ({ id: "artwork-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artwork.jpg" }),
      },
    },
    candidateId: "candidate-1",
    runId: "run-1",
    artworkId: "artwork-1",
    title: "Blue Sky",
    sourceUrl: "https://example.com/event",
    candidateImageUrl: "https://cdn.example.com/artwork.jpg",
    requestId: "request-1",
  }, {
    fetchImageWithGuards: async () => {
      throw new Error("fetch timeout");
    },
    uploadArtworkImageToBlob: async () => ({
      url: "https://blob.example/artwork.jpg",
      path: "artworks/ingest/artwork-1/candidate-1/image.jpg",
    }),
  });

  assert.equal(result.attached, false);
  assert.equal(result.imageUrl, null);
  assert.match(result.warning ?? "", /image-import failed: fetch timeout/);
});

test("returns no-op result when candidate image URL is null", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  const result = await importApprovedArtworkImage({
    appDb: {
      artwork: {
        findUnique: async () => ({ featuredAssetId: null, featuredAsset: null }),
        update: async () => ({ id: "artwork-1" }),
      },
      artworkImage: {
        create: async () => ({ id: "artwork-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artwork.jpg" }),
      },
    },
    candidateId: "candidate-1",
    runId: "run-1",
    artworkId: "artwork-1",
    title: "Blue Sky",
    sourceUrl: "https://example.com/event",
    candidateImageUrl: null,
    requestId: "request-1",
  });

  assert.deepEqual(result, { attached: false, warning: null, imageUrl: null });
});
