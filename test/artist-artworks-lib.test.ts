import test from "node:test";
import assert from "node:assert/strict";
import { getArtistArtworks } from "../lib/artists.ts";
import { db } from "../lib/db.ts";

test("getArtistArtworks returns published artist artworks", async () => {
  const oa = db.artist.findFirst;
  const of = db.artwork.findMany;
  const oc = db.artwork.count;
  const off = db.artistFeaturedArtwork.findMany;
  db.artist.findFirst = (async () => ({ id: "a1", slug: "artist", name: "Artist" })) as never;
  db.artwork.findMany = (async () => [{
    id: "w1", slug: "work", title: "Work", year: 2020, medium: "Painting", dimensions: null, description: null, priceAmount: 1000, currency: "USD", updatedAt: new Date(),
    images: [{ id: "i1", sortOrder: 0, alt: null, asset: { url: "https://img" } }],
  }]) as never;
  db.artwork.count = (async () => 1) as never;
  db.artistFeaturedArtwork.findMany = (async () => [{ artworkId: "w1" }]) as never;
  try {
    const result = await getArtistArtworks("artist", { limit: 24 });
    assert.equal(result.total, 1);
    assert.equal(result.artworks[0]?.featured, true);
  } finally {
    db.artist.findFirst = oa;
    db.artwork.findMany = of;
    db.artwork.count = oc;
    db.artistFeaturedArtwork.findMany = off;
  }
});
