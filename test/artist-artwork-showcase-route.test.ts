import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/api/artists/[slug]/artworks/route.ts";
import { db } from "../lib/db.ts";

test("GET /api/artists/[slug]/artworks returns showcase payload", async () => {
  const oa = db.artist.findFirst;
  const of = db.artwork.findMany;
  const oc = db.artwork.count;
  const off = db.artistFeaturedArtwork.findMany;
  db.artist.findFirst = (async () => ({ id: "a1", slug: "picasso", name: "Picasso" })) as never;
  db.artwork.findMany = (async () => []) as never;
  db.artwork.count = (async () => 0) as never;
  db.artistFeaturedArtwork.findMany = (async () => []) as never;
  try {
    const req = new NextRequest("http://localhost/api/artists/picasso/artworks?sort=newest");
    const res = await GET(req, { params: Promise.resolve({ slug: "picasso" }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 0);
  } finally {
    db.artist.findFirst = oa;
    db.artwork.findMany = of;
    db.artwork.count = oc;
    db.artistFeaturedArtwork.findMany = off;
  }
});
