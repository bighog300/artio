import test from "node:test";
import assert from "node:assert/strict";
import { importApprovedArtistImage } from "../lib/ingest/import-approved-artist-image";

const previousImageEnabled = process.env.AI_INGEST_IMAGE_ENABLED;

test.after(() => {
  process.env.AI_INGEST_IMAGE_ENABLED = previousImageEnabled;
});

test("imports artist og:image into Asset and ArtistImage and updates featuredAssetId", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  let artistImageCreateCalls = 0;
  let artistUpdateCalls = 0;

  const result = await importApprovedArtistImage({
    appDb: {
      artist: {
        findUnique: async () => ({ featuredAssetId: null, featuredAsset: null }),
        update: async () => {
          artistUpdateCalls += 1;
          return { id: "artist-1" };
        },
      },
      artistImage: {
        create: async ({ data }) => {
          artistImageCreateCalls += 1;
          assert.equal(data.artistId, "artist-1");
          assert.equal(data.assetId, "asset-1");
          return { id: "artist-image-1" };
        },
      },
      asset: {
        create: async ({ data }) => {
          assert.equal(data.kind, "IMAGE");
          assert.equal(data.alt, "Artist Name");
          return { id: "asset-1", url: "https://blob.example/artist.jpg" };
        },
      },
    },
    artistId: "artist-1",
    candidateId: "candidate-1",
    name: "Artist Name",
    websiteUrl: "https://artist.example",
    sourceUrl: "https://en.wikipedia.org/wiki/Artist",
    requestId: "request-1",
  }, {
    fetchHtmlWithGuards: async () => ({
      finalUrl: "https://artist.example/",
      status: 200,
      contentType: "text/html",
      bytes: 120,
      html: '<html><head><meta property="og:image" content="/hero.jpg"></head></html>',
    }),
    fetchImageWithGuards: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      sizeBytes: 3,
      contentType: "image/jpeg",
      finalUrl: "https://artist.example/hero.jpg",
    }),
    uploadArtistImageToBlob: async () => ({
      url: "https://blob.example/artist.jpg",
      path: "artists/ingest/artist-1/candidate-1/image.jpg",
    }),
  });

  assert.equal(artistImageCreateCalls, 1);
  assert.equal(artistUpdateCalls, 1);
  assert.deepEqual(result, { attached: true, warning: null, imageUrl: "https://blob.example/artist.jpg" });
});

test("falls back to sourceUrl og:image when website has no og:image", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  let htmlCalls = 0;

  const result = await importApprovedArtistImage({
    appDb: {
      artist: {
        findUnique: async () => ({ featuredAssetId: null, featuredAsset: null }),
        update: async () => ({ id: "artist-1" }),
      },
      artistImage: {
        create: async () => ({ id: "artist-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artist.jpg" }),
      },
    },
    artistId: "artist-1",
    candidateId: "candidate-1",
    name: "Artist Name",
    websiteUrl: "https://artist.example",
    sourceUrl: "https://en.wikipedia.org/wiki/Artist",
    requestId: "request-1",
  }, {
    fetchHtmlWithGuards: async (url) => {
      htmlCalls += 1;
      if (url === "https://artist.example") {
        return { finalUrl: url, status: 200, contentType: "text/html", bytes: 10, html: "<html></html>" };
      }
      return {
        finalUrl: url,
        status: 200,
        contentType: "text/html",
        bytes: 120,
        html: '<html><head><meta property="og:image" content="https://cdn.example.com/wiki.jpg"></head></html>',
      };
    },
    fetchImageWithGuards: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      sizeBytes: 3,
      contentType: "image/jpeg",
      finalUrl: "https://cdn.example.com/wiki.jpg",
    }),
    uploadArtistImageToBlob: async () => ({
      url: "https://blob.example/artist.jpg",
      path: "artists/ingest/artist-1/candidate-1/image.jpg",
    }),
  });

  assert.equal(htmlCalls, 2);
  assert.equal(result.attached, true);
  assert.equal(result.warning, null);
});
