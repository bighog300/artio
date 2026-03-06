import test from "node:test";
import assert from "node:assert/strict";
import { getArtistArtworks } from "../lib/artists.ts";
import { db } from "../lib/db.ts";

type MockArtwork = {
  id: string;
  artistId: string;
  slug: string;
  title: string;
  year: number;
  medium: string;
  isPublished: boolean;
  priceAmount: number | null;
  updatedAt: Date;
};

const DATA: MockArtwork[] = [
  { id: "w1", artistId: "artist-1", slug: "w1", title: "A", year: 2024, medium: "painting", isPublished: true, priceAmount: 100, updatedAt: new Date("2024-05-01") },
  { id: "w2", artistId: "artist-1", slug: "w2", title: "B", year: 2023, medium: "painting", isPublished: false, priceAmount: 100, updatedAt: new Date("2024-04-01") },
  { id: "w3", artistId: "artist-1", slug: "w3", title: "C", year: 2022, medium: "sculpture", isPublished: true, priceAmount: null, updatedAt: new Date("2024-03-01") },
  { id: "w4", artistId: "artist-1", slug: "w4", title: "D", year: 2021, medium: "painting", isPublished: true, priceAmount: 300, updatedAt: new Date("2024-02-01") },
  { id: "w5", artistId: "artist-2", slug: "w5", title: "E", year: 2020, medium: "painting", isPublished: true, priceAmount: 400, updatedAt: new Date("2024-01-01") },
];

function installLibMocks() {
  const original = {
    artistFindFirst: db.artist.findFirst,
    artworkFindMany: db.artwork.findMany,
    artworkCount: db.artwork.count,
    artworkFindFirst: db.artwork.findFirst,
    featuredFindMany: db.artistFeaturedArtwork.findMany,
  };

  db.artist.findFirst = (async ({ where }: { where: { slug: string } }) => {
    if (where.slug !== "artist") return null;
    return { id: "artist-1", slug: "artist", name: "Artist", websiteUrl: null };
  }) as never;

  db.artwork.findFirst = (async ({ where }: { where: { id: string; artistId: string } }) => {
    const found = DATA.find((item) => item.id === where.id && item.artistId === where.artistId && item.isPublished);
    return found ? { id: found.id, updatedAt: found.updatedAt, title: found.title } : null;
  }) as never;

  db.artwork.findMany = (async ({ where, take, orderBy }: { where: any; take: number; orderBy: any }) => {
    let rows = DATA.filter((item) => item.artistId === where.artistId && item.isPublished && where.deletedAt === null);
    if (where.medium?.contains) rows = rows.filter((item) => item.medium.includes(String(where.medium.contains)));
    if (where.priceAmount?.not === null) rows = rows.filter((item) => item.priceAmount != null);
    if (where.OR) {
      rows = rows.filter((item) => where.OR.some((rule: any) => {
        if (rule.title?.gt) return item.title > rule.title.gt;
        if (rule.title && rule.id?.gt) return item.title === rule.title && item.id > rule.id.gt;
        const lt = rule.updatedAt?.lt ? item.updatedAt < rule.updatedAt.lt : false;
        const gt = rule.updatedAt?.gt ? item.updatedAt > rule.updatedAt.gt : false;
        const eq = rule.updatedAt instanceof Date ? item.updatedAt.getTime() === rule.updatedAt.getTime() : false;
        const idLt = rule.id?.lt ? item.id < rule.id.lt : false;
        const idGt = rule.id?.gt ? item.id > rule.id.gt : false;
        return lt || gt || (eq && (idLt || idGt));
      }));
    }
    if (Array.isArray(orderBy) && orderBy[0]?.updatedAt === "desc") {
      rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1));
    }
    return rows.slice(0, take).map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      year: item.year,
      medium: item.medium,
      dimensions: null,
      description: null,
      priceAmount: item.priceAmount,
      currency: "USD",
      updatedAt: item.updatedAt,
      images: [{ id: `${item.id}-img`, sortOrder: 0, alt: null, asset: { url: `https://img/${item.id}` } }],
    }));
  }) as never;

  db.artwork.count = (async ({ where }: { where: any }) => {
    let rows = DATA.filter((item) => item.artistId === where.artistId && item.isPublished && where.deletedAt === null);
    if (where.medium?.contains) rows = rows.filter((item) => item.medium.includes(String(where.medium.contains)));
    if (where.priceAmount?.not === null) rows = rows.filter((item) => item.priceAmount != null);
    return rows.length;
  }) as never;

  db.artistFeaturedArtwork.findMany = (async () => [{ artworkId: "w4" }]) as never;

  return () => {
    db.artist.findFirst = original.artistFindFirst;
    db.artwork.findMany = original.artworkFindMany;
    db.artwork.count = original.artworkCount;
    db.artwork.findFirst = original.artworkFindFirst;
    db.artistFeaturedArtwork.findMany = original.featuredFindMany;
  };
}

test("Returns artworks only for the given slug", async () => {
  const restore = installLibMocks();
  try {
    const result = await getArtistArtworks("artist", { limit: 10 });
    assert.ok(result.artworks.every((item) => item.id !== "w5"));
  } finally {
    restore();
  }
});

test("Excludes artworks where isPublished=false", async () => {
  const restore = installLibMocks();
  try {
    const result = await getArtistArtworks("artist", { limit: 10 });
    assert.ok(!result.artworks.some((item) => item.id === "w2"));
  } finally {
    restore();
  }
});

test("Applies tag filter correctly", async () => {
  const restore = installLibMocks();
  try {
    const result = await getArtistArtworks("artist", { tag: "painting", limit: 10 });
    assert.ok(result.artworks.length > 0);
    assert.ok(result.artworks.every((item) => item.tags.includes("painting")));
  } finally {
    restore();
  }
});

test("Applies forSale filter correctly", async () => {
  const restore = installLibMocks();
  try {
    const result = await getArtistArtworks("artist", { forSale: true, limit: 10 });
    assert.ok(result.artworks.length > 0);
    assert.ok(result.artworks.every((item) => item.forSale));
  } finally {
    restore();
  }
});

test("total reflects full count regardless of cursor position", async () => {
  const restore = installLibMocks();
  try {
    const first = await getArtistArtworks("artist", { limit: 2 });
    const second = await getArtistArtworks("artist", { limit: 2, cursor: first.nextCursor ?? undefined });
    assert.equal(first.total, 3);
    assert.equal(second.total, 3);
  } finally {
    restore();
  }
});

test("Returns nextCursor when more results exist beyond limit", async () => {
  const restore = installLibMocks();
  try {
    const result = await getArtistArtworks("artist", { limit: 2 });
    assert.equal(typeof result.nextCursor, "string");
  } finally {
    restore();
  }
});

test("Returns null nextCursor on last page", async () => {
  const restore = installLibMocks();
  try {
    const first = await getArtistArtworks("artist", { limit: 2 });
    const second = await getArtistArtworks("artist", { limit: 2, cursor: first.nextCursor ?? undefined });
    assert.equal(second.nextCursor, null);
  } finally {
    restore();
  }
});

test("Uses title-aware A-Z cursor predicate", async () => {
  const restore = installLibMocks();
  const originalFindMany = db.artwork.findMany;
  let capturedWhere: any;
  db.artwork.findMany = (async ({ where, take, orderBy }: { where: any; take: number; orderBy: any }) => {
    capturedWhere = where;
    return originalFindMany({ where, take, orderBy } as never);
  }) as never;

  try {
    await getArtistArtworks("artist", { sort: "az", limit: 2, cursor: "w3" });
    assert.deepEqual(capturedWhere.OR, [
      { title: { gt: "C" } },
      { title: "C", id: { gt: "w3" } },
    ]);
    assert.equal(capturedWhere.id, undefined);
  } finally {
    db.artwork.findMany = originalFindMany;
    restore();
  }
});
