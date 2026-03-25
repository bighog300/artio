import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getArtwork } from "../app/api/artwork/route.ts";
import { db } from "../lib/db.ts";

test("GET /api/artwork applies year range and medium multi filters", async () => {
  const originalFindMany = db.artwork.findMany;
  const originalCount = db.artwork.count;
  let where: any;
  db.artwork.findMany = (async (args: any) => { where = args.where; return []; }) as never;
  db.artwork.count = (async () => 0) as never;
  try {
    const req = new NextRequest("http://localhost/api/artwork?yearFrom=1990&yearTo=2000&medium=Painting&medium=Sculpture");
    const res = await getArtwork(req);
    assert.equal(res.status, 200);
    assert.equal(where.year.gte, 1990);
    assert.equal(where.year.lte, 2000);
    assert.deepEqual(where.medium.in, ["Painting", "Sculpture"]);
    assert.equal(where.isPublished, true);
  } finally {
    db.artwork.findMany = originalFindMany;
    db.artwork.count = originalCount;
  }
});

test("GET /api/artwork uses views sorting query path and returns views30", async () => {
  const oq = db.$queryRaw;
  const of = db.artwork.findMany;
  let queryCount = 0;
  db.$queryRaw = (async () => {
    queryCount += 1;
    if (queryCount === 1) return [{ id: "art-1", views30: 42 }];
    return [{ total: 1 }];
  }) as never;
  db.artwork.findMany = (async () => [
    {
      id: "art-1",
      slug: "art-1",
      title: "Artwork 1",
      year: null,
      medium: null,
      priceAmount: null,
      currency: null,
      updatedAt: new Date(),
      artist: { id: "artist-1", name: "Artist", slug: "artist" },
      featuredAsset: { url: null },
      images: [],
    },
  ]) as never;
  try {
    const req = new NextRequest("http://localhost/api/artwork?sort=VIEWS_30D_DESC");
    const res = await getArtwork(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.items), true);
    assert.equal(body.items[0]?.views30, 42);
    assert.equal(body.items[0]?.coverUrl, null);
    assert.equal(body.items[0]?.image?.url, null);
    assert.equal(body.items[0]?.image?.source, "placeholder");
    assert.equal(body.items[0]?.image?.isProcessing, false);
    assert.equal(body.items[0]?.image?.hasFailure, false);
  } finally {
    db.$queryRaw = oq;
    db.artwork.findMany = of;
  }
});

test("GET /api/artwork returns 429 when public read rate limit is exceeded", async () => {
  const originalFindMany = db.artwork.findMany;
  const originalCount = db.artwork.count;
  db.artwork.findMany = (async () => []) as never;
  db.artwork.count = (async () => 0) as never;

  try {
    const url = "http://localhost/api/artwork";
    const headers = { "x-forwarded-for": "198.51.100.33" };

    let response = await getArtwork(new NextRequest(url, { headers }));
    for (let i = 1; i < 140 && response.status !== 429; i += 1) {
      response = await getArtwork(new NextRequest(url, { headers }));
    }

    assert.equal(response.status, 429);
  } finally {
    db.artwork.findMany = originalFindMany;
    db.artwork.count = originalCount;
  }
});
