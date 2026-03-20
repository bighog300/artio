import test from "node:test";
import assert from "node:assert/strict";
import { importApprovedArtistImage } from "../lib/ingest/import-approved-artist-image";

const previousImageEnabled = process.env.AI_INGEST_IMAGE_ENABLED;

test.after(() => {
  process.env.AI_INGEST_IMAGE_ENABLED = previousImageEnabled;
});

test("returns disabled warning when AI_INGEST_IMAGE_ENABLED is not set", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "0";

  const result = await importApprovedArtistImage({
    appDb: {
      artist: {
        findUnique: async () => ({ featuredAssetId: null }),
        update: async () => ({}),
      },
      artistImage: {
        create: async () => ({ id: "artist-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artist.jpg" }),
      },
    },
    artistId: "artist-1",
    name: "Artist Name",
    websiteUrl: "https://artist.example",
    sourceUrl: "https://en.wikipedia.org/wiki/Artist",
    requestId: "request-1",
  }, {
    fetchHtmlWithGuards: async () => {
      throw new Error("should not be called");
    },
    fetchImageWithGuards: async () => {
      throw new Error("should not be called");
    },
    uploadArtistImageToBlob: async () => {
      throw new Error("should not be called");
    },
  });

  assert.deepEqual(result, {
    attached: false,
    warning: "image-import disabled: set AI_INGEST_IMAGE_ENABLED=1 to enable",
    imageUrl: null,
  });
});

test("returns early when artist already has featured image", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  let updated = false;
  const result = await importApprovedArtistImage({
    appDb: {
      artist: {
        findUnique: async () => ({ featuredAssetId: "asset-existing" }),
        update: async () => {
          updated = true;
          return {};
        },
      },
      artistImage: {
        create: async () => ({ id: "artist-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artist.jpg" }),
      },
    },
    artistId: "artist-1",
    name: "Artist Name",
    websiteUrl: "https://artist.example",
    sourceUrl: "https://en.wikipedia.org/wiki/Artist",
    requestId: "request-1",
  }, {
    fetchHtmlWithGuards: async () => {
      throw new Error("should not be called");
    },
    fetchImageWithGuards: async () => {
      throw new Error("should not be called");
    },
    uploadArtistImageToBlob: async () => {
      throw new Error("should not be called");
    },
  });

  assert.equal(updated, false);
  assert.deepEqual(result, { attached: false, warning: null, imageUrl: null });
});

test("uses websiteUrl og:image when available", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  const calls: string[] = [];
  const result = await importApprovedArtistImage({
    appDb: {
      artist: {
        findUnique: async () => ({ featuredAssetId: null }),
        update: async () => ({}),
      },
      artistImage: {
        create: async () => ({ id: "artist-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artist.jpg" }),
      },
    },
    artistId: "artist-1",
    name: "Artist Name",
    websiteUrl: "https://artist.example",
    sourceUrl: "https://en.wikipedia.org/wiki/Artist",
    instagramUrl: "https://instagram.com/artist",
    requestId: "request-1",
  }, {
    fetchHtmlWithGuards: async (url) => {
      calls.push(url);
      if (url === "https://artist.example") {
        return { html: '<meta property="og:image" content="https://artist.example/portrait.jpg">' };
      }
      return { html: "<html></html>" };
    },
    fetchImageWithGuards: async () => ({
      contentType: "image/jpeg",
      bytes: Buffer.from("image"),
      sizeBytes: 5,
    }),
    uploadArtistImageToBlob: async () => ({ url: "https://blob.example/artist.jpg", pathname: "/artist.jpg" }),
  });

  assert.equal(result.attached, true);
  assert.equal(calls[0], "https://artist.example");
});

test("falls back to twitter:image when og:image absent", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  const result = await importApprovedArtistImage({
    appDb: {
      artist: {
        findUnique: async () => ({ featuredAssetId: null }),
        update: async () => ({}),
      },
      artistImage: {
        create: async () => ({ id: "artist-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artist.jpg" }),
      },
    },
    artistId: "artist-1",
    name: "Artist Name",
    websiteUrl: "https://artist.example",
    sourceUrl: "https://en.wikipedia.org/wiki/Artist",
    instagramUrl: "https://instagram.com/artist",
    requestId: "request-1",
  }, {
    fetchHtmlWithGuards: async () => ({
      html: '<meta name="twitter:image" content="https://artist.example/twitter-portrait.jpg">',
    }),
    fetchImageWithGuards: async () => ({
      contentType: "image/jpeg",
      bytes: Buffer.from("image"),
      sizeBytes: 5,
    }),
    uploadArtistImageToBlob: async () => ({ url: "https://blob.example/artist.jpg", pathname: "/artist.jpg" }),
  });

  assert.equal(result.attached, true);
});

test("tries instagramUrl as third option", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  const calls: string[] = [];
  const result = await importApprovedArtistImage({
    appDb: {
      artist: {
        findUnique: async () => ({ featuredAssetId: null }),
        update: async () => ({}),
      },
      artistImage: {
        create: async () => ({ id: "artist-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artist.jpg" }),
      },
    },
    artistId: "artist-1",
    name: "Artist Name",
    websiteUrl: "https://artist.example",
    sourceUrl: "https://en.wikipedia.org/wiki/Artist",
    instagramUrl: "https://instagram.com/artist",
    requestId: "request-1",
  }, {
    fetchHtmlWithGuards: async (url) => {
      calls.push(url);
      if (url === "https://instagram.com/artist") {
        return { html: '<meta property="og:image" content="https://instagram.com/artist-profile.jpg">' };
      }
      return { html: "<html></html>" };
    },
    fetchImageWithGuards: async () => ({
      contentType: "image/jpeg",
      bytes: Buffer.from("image"),
      sizeBytes: 5,
    }),
    uploadArtistImageToBlob: async () => ({ url: "https://blob.example/artist.jpg", pathname: "/artist.jpg" }),
  });

  assert.equal(calls.length, 3);
  assert.equal(result.attached, true);
});

test("returns warning when all URLs fail to find an image", async () => {
  process.env.AI_INGEST_IMAGE_ENABLED = "1";

  let fetchImageCalled = false;
  const result = await importApprovedArtistImage({
    appDb: {
      artist: {
        findUnique: async () => ({ featuredAssetId: null }),
        update: async () => ({}),
      },
      artistImage: {
        create: async () => ({ id: "artist-image-1" }),
      },
      asset: {
        create: async () => ({ id: "asset-1", url: "https://blob.example/artist.jpg" }),
      },
    },
    artistId: "artist-1",
    name: "Artist Name",
    websiteUrl: "https://artist.example",
    sourceUrl: "https://en.wikipedia.org/wiki/Artist",
    instagramUrl: "https://instagram.com/artist",
    requestId: "request-1",
  }, {
    fetchHtmlWithGuards: async () => ({ html: "<html></html>" }),
    fetchImageWithGuards: async () => {
      fetchImageCalled = true;
      throw new Error("should not be called");
    },
    uploadArtistImageToBlob: async () => ({ url: "https://blob.example/artist.jpg", pathname: "/artist.jpg" }),
  });

  assert.equal(result.attached, false);
  assert.match(result.warning ?? "", /no image found on artist website/);
  assert.equal(fetchImageCalled, false);
});
