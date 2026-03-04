import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/api/artists/[slug]/artworks/route.ts";
import { db } from "../lib/db.ts";

type MockArtwork = {
  id: string;
  slug: string;
  title: string;
  year: number;
  medium: string;
  priceAmount: number | null;
  currency: string;
  updatedAt: Date;
  isPublished?: boolean;
};

const ARTWORKS: MockArtwork[] = [
  { id: "a-1", slug: "a-1", title: "Apple", year: 2018, medium: "painting", priceAmount: null, currency: "USD", updatedAt: new Date("2024-01-01T00:00:00.000Z") },
  { id: "a-2", slug: "a-2", title: "Boat", year: 2020, medium: "painting", priceAmount: 3000, currency: "USD", updatedAt: new Date("2024-02-01T00:00:00.000Z") },
  { id: "a-3", slug: "a-3", title: "Cloud", year: 2015, medium: "sculpture", priceAmount: 1200, currency: "USD", updatedAt: new Date("2024-03-01T00:00:00.000Z") },
  { id: "a-4", slug: "a-4", title: "Dawn", year: 2022, medium: "painting", priceAmount: null, currency: "USD", updatedAt: new Date("2024-04-01T00:00:00.000Z") },
  { id: "a-5", slug: "a-5", title: "Elm", year: 2010, medium: "sculpture", priceAmount: 500, currency: "USD", updatedAt: new Date("2024-05-01T00:00:00.000Z") },
];

function installDbMocks() {
  const original = {
    artistFindFirst: db.artist.findFirst,
    artworkFindMany: db.artwork.findMany,
    artworkCount: db.artwork.count,
    artworkFindFirst: db.artwork.findFirst,
    featuredFindMany: db.artistFeaturedArtwork.findMany,
  };

  db.artist.findFirst = (async ({ where }: { where: { slug: string } }) => {
    if (where.slug === "unknown") return null;
    return { id: "artist-1", slug: where.slug, name: "Artist", websiteUrl: "https://artist.example" };
  }) as never;

  db.artwork.findFirst = (async ({ where }: { where: { id: string } }) => {
    const found = ARTWORKS.find((item) => item.id === where.id);
    return found ? { id: found.id, updatedAt: found.updatedAt } : null;
  }) as never;

  db.artwork.findMany = (async ({ where, orderBy, take }: { where: any; orderBy: any; take: number }) => {
    let filtered = ARTWORKS.filter((item) => (item.isPublished ?? true));
    if (where?.medium?.contains) {
      filtered = filtered.filter((item) => item.medium.toLowerCase().includes(String(where.medium.contains).toLowerCase()));
    }
    if (where?.priceAmount?.not === null) {
      filtered = filtered.filter((item) => item.priceAmount != null);
    }
    if (where?.OR) {
      filtered = filtered.filter((item) => {
        return where.OR.some((rule: any) => {
          const updatedAtLt = rule.updatedAt?.lt ? item.updatedAt < rule.updatedAt.lt : false;
          const updatedAtGt = rule.updatedAt?.gt ? item.updatedAt > rule.updatedAt.gt : false;
          const updatedAtEq = rule.updatedAt instanceof Date ? item.updatedAt.getTime() === rule.updatedAt.getTime() : false;
          const idLt = rule.id?.lt ? item.id < rule.id.lt : false;
          const idGt = rule.id?.gt ? item.id > rule.id.gt : false;
          return updatedAtLt || updatedAtGt || (updatedAtEq && (idLt || idGt));
        });
      });
    }
    if (where?.id?.gt) filtered = filtered.filter((item) => item.id > where.id.gt);

    if (Array.isArray(orderBy) && orderBy[0]?.updatedAt === "desc") {
      filtered = filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1));
    } else if (Array.isArray(orderBy) && orderBy[0]?.updatedAt === "asc") {
      filtered = filtered.sort((a, b) => a.year - b.year || (a.id > b.id ? 1 : -1));
    } else {
      filtered = filtered.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    }

    return filtered.slice(0, take).map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      year: item.year,
      medium: item.medium,
      dimensions: null,
      description: null,
      priceAmount: item.priceAmount,
      currency: item.currency,
      updatedAt: item.updatedAt,
      images: [{ id: `${item.id}-img`, sortOrder: 0, alt: null, asset: { url: `https://img/${item.id}` } }],
    }));
  }) as never;

  db.artwork.count = (async ({ where }: { where: any }) => {
    let filtered = ARTWORKS.filter((item) => (item.isPublished ?? true));
    if (where?.medium?.contains) filtered = filtered.filter((item) => item.medium.toLowerCase().includes(String(where.medium.contains).toLowerCase()));
    if (where?.priceAmount?.not === null) filtered = filtered.filter((item) => item.priceAmount != null);
    return filtered.length;
  }) as never;

  db.artistFeaturedArtwork.findMany = (async () => [{ artworkId: "a-2" }, { artworkId: "a-4" }]) as never;

  return () => {
    db.artist.findFirst = original.artistFindFirst;
    db.artwork.findMany = original.artworkFindMany;
    db.artwork.count = original.artworkCount;
    db.artwork.findFirst = original.artworkFindFirst;
    db.artistFeaturedArtwork.findMany = original.featuredFindMany;
  };
}

test("GET returns 200 with artworks array for valid slug", async () => {
  const restore = installDbMocks();
  try {
    const req = new NextRequest("http://localhost/api/artists/picasso/artworks?sort=newest");
    const res = await GET(req, { params: Promise.resolve({ slug: "picasso" }) });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(body.artworks));
    assert.ok(body.artworks.length > 0);
  } finally {
    restore();
  }
});

test("GET ?tag=painting returns only artworks with that tag", async () => {
  const restore = installDbMocks();
  try {
    const req = new NextRequest("http://localhost/api/artists/picasso/artworks?tag=painting");
    const res = await GET(req, { params: Promise.resolve({ slug: "picasso" }) });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.artworks.every((item: any) => item.tags.includes("painting")));
  } finally {
    restore();
  }
});

test("GET ?forSale=true returns only artworks where forSale=true", async () => {
  const restore = installDbMocks();
  try {
    const req = new NextRequest("http://localhost/api/artists/picasso/artworks?forSale=true");
    const res = await GET(req, { params: Promise.resolve({ slug: "picasso" }) });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.artworks.length > 0);
    assert.ok(body.artworks.every((item: any) => item.forSale === true));
  } finally {
    restore();
  }
});

test("GET ?sort=oldest returns artworks sorted year ascending", async () => {
  const restore = installDbMocks();
  try {
    const req = new NextRequest("http://localhost/api/artists/picasso/artworks?sort=oldest");
    const res = await GET(req, { params: Promise.resolve({ slug: "picasso" }) });
    const body = await res.json();
    assert.equal(res.status, 200);
    const years = body.artworks.map((item: any) => item.year);
    assert.deepEqual(years, [...years].sort((a, b) => a - b));
  } finally {
    restore();
  }
});

test("GET with unknown slug returns empty artworks array", async () => {
  const restore = installDbMocks();
  try {
    const req = new NextRequest("http://localhost/api/artists/unknown/artworks");
    const res = await GET(req, { params: Promise.resolve({ slug: "unknown" }) });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body.artworks, []);
  } finally {
    restore();
  }
});

test("GET ?cursor= returns next page and correct nextCursor", async () => {
  const restore = installDbMocks();
  try {
    const firstReq = new NextRequest("http://localhost/api/artists/picasso/artworks?limit=2&sort=newest");
    const firstRes = await GET(firstReq, { params: Promise.resolve({ slug: "picasso" }) });
    const firstBody = await firstRes.json();
    assert.equal(firstRes.status, 200);
    assert.equal(firstBody.artworks.length, 2);
    assert.equal(typeof firstBody.nextCursor, "string");

    const secondReq = new NextRequest(`http://localhost/api/artists/picasso/artworks?limit=2&sort=newest&cursor=${firstBody.nextCursor}`);
    const secondRes = await GET(secondReq, { params: Promise.resolve({ slug: "picasso" }) });
    const secondBody = await secondRes.json();
    assert.equal(secondRes.status, 200);
    assert.equal(secondBody.artworks.length, 2);
    assert.notEqual(secondBody.artworks[0].id, firstBody.artworks[0].id);
  } finally {
    restore();
  }
});
