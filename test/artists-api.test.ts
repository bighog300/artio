import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { artistListQuerySchema } from "@/lib/validators";
import { GET as getArtists } from "@/app/api/artists/route";
import { db } from "@/lib/db";

test("artistListQuerySchema rejects pageSize above 100", () => {
  const parsed = artistListQuerySchema.safeParse({ pageSize: "101" });
  assert.equal(parsed.success, false);
});

test("artistListQuerySchema defaults page=1 and pageSize=48", () => {
  const parsed = artistListQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 48);
});

test("GET /api/artists returns { items, page, pageSize, total }", async () => {
  const originalFindMany = db.artist.findMany;
  const originalCount = db.artist.count;
  const originalFollowGroupBy = db.follow.groupBy;
  const originalArtworkGroupBy = db.artwork.groupBy;

  db.follow.groupBy = (async () => []) as never;
  db.artwork.groupBy = (async () => []) as never;

  db.artist.findMany = (async () => [
    {
      id: "a1",
      slug: "artist-1",
      name: "Artist 1",
      bio: null,
      avatarImageUrl: null,
      featuredImageUrl: null,
      mediums: [],
      images: [],
      eventArtists: [],
    },
  ]) as never;
  db.artist.count = (async () => 17) as never;

  try {
    const req = new NextRequest("http://localhost/api/artists?page=2&pageSize=10&query=art");
    const res = await getArtists(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["artists", "items", "page", "pageSize", "total"]);
    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 1);
    assert.equal(body.total, 1);
    assert.equal(Array.isArray(body.items), true);
  } finally {
    db.artist.findMany = originalFindMany;
    db.artist.count = originalCount;
    db.follow.groupBy = originalFollowGroupBy;
    db.artwork.groupBy = originalArtworkGroupBy;
  }
});

test("GET /api/artists returns structured image contract with legacy avatar compatibility", async () => {
  const originalFindMany = db.artist.findMany;
  const originalCount = db.artist.count;
  const originalFollowGroupBy = db.follow.groupBy;
  const originalArtworkGroupBy = db.artwork.groupBy;

  db.follow.groupBy = (async () => []) as never;
  db.artwork.groupBy = (async () => []) as never;
  db.artist.findMany = (async () => [
    {
      id: "a1",
      slug: "artist-1",
      name: "Artist 1",
      bio: null,
      avatarImageUrl: "https://legacy.example/avatar.jpg",
      featuredImageUrl: null,
      mediums: [],
      images: [{
        url: "https://legacy.example/gallery.jpg",
        alt: null,
        sortOrder: 0,
        isPrimary: true,
        width: 1200,
        height: 800,
        asset: {
          url: "https://blob.example/master.jpg",
          originalUrl: "https://blob.example/original.jpg",
          processingStatus: "FAILED",
          processingError: "decode_failed",
          variants: [{ variantName: "card", url: "https://blob.example/card.jpg" }],
        },
      }],
      eventArtists: [],
    },
  ]) as never;
  db.artist.count = (async () => 1) as never;

  try {
    const req = new NextRequest("http://localhost/api/artists");
    const res = await getArtists(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.items[0]?.image?.url, "https://blob.example/card.jpg");
    assert.equal(body.items[0]?.image?.source, "variant");
    assert.equal(body.items[0]?.image?.variant, "card");
    assert.equal(body.items[0]?.image?.isProcessing, false);
    assert.equal(body.items[0]?.image?.hasFailure, true);
    assert.equal(body.items[0]?.avatarImageUrl, "https://blob.example/card.jpg");
  } finally {
    db.artist.findMany = originalFindMany;
    db.artist.count = originalCount;
    db.follow.groupBy = originalFollowGroupBy;
    db.artwork.groupBy = originalArtworkGroupBy;
  }
});
