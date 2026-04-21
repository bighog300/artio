import { db } from "@/lib/db";
import { resolveArtworkCoverUrl } from "@/lib/artworks";

export type CuratedCollectionArtwork = {
  id: string;
  slug: string | null;
  title: string;
  artist: { id: string; name: string; slug: string };
  coverUrl: string | null;
};

export type CuratedCollectionPublic = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  publishStartsAt: Date | null;
  publishEndsAt: Date | null;
  homeRank: number | null;
  artworks: CuratedCollectionArtwork[];
  updatedAt?: Date;
  itemCount?: number;
};

export type CollectionSortMode = "CURATED" | "VIEWS_30D_DESC" | "NEWEST";
export type CollectionSurface = "home" | "artwork";

export type CollectionQueryInput = {
  sort?: CollectionSortMode;
  page?: number;
  pageSize?: number;
};

const artworkSelect = {
  id: true,
  slug: true,
  title: true,
  updatedAt: true,
  artist: { select: { id: true, name: true, slug: true } },
  featuredAsset: { select: { url: true } },
  images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], take: 1, select: { asset: { select: { url: true } } } },
};

export function getCollectionVisibilityWhere(now = new Date()) {
  return {
    isPublished: true,
    AND: [
      { OR: [{ publishStartsAt: null }, { publishStartsAt: { lte: now } }] },
      { OR: [{ publishEndsAt: null }, { publishEndsAt: { gt: now } }] },
    ],
  };
}

function getSurfaceWhere(surface: CollectionSurface) {
  return surface === "home" ? { showOnHome: true } : { showOnArtwork: true };
}

export function getCollectionOrderBy() {
  return [{ homeRank: "asc" as const }, { updatedAt: "desc" as const }, { id: "asc" as const }];
}

export async function listPublishedCuratedCollections(limitItems = 8, surface: CollectionSurface = "home"): Promise<CuratedCollectionPublic[]> {
  try {
    const collections = await db.curatedCollection.findMany({
      where: { ...getCollectionVisibilityWhere(), ...getSurfaceWhere(surface) },
      orderBy: getCollectionOrderBy(),
      select: { id: true, slug: true, title: true, description: true, publishStartsAt: true, publishEndsAt: true, homeRank: true, updatedAt: true },
    });
    if (!collections.length) return [];

    const items = await db.curatedCollectionItem.findMany({
      where: { collectionId: { in: collections.map((collection) => collection.id) }, artwork: { isPublished: true } },
      orderBy: [{ collectionId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { collectionId: true, artwork: { select: artworkSelect } },
    });

    const grouped = new Map<string, CuratedCollectionArtwork[]>();
    for (const item of items) {
      const row = grouped.get(item.collectionId) ?? [];
      if (row.length < limitItems) {
        row.push({ id: item.artwork.id, slug: item.artwork.slug, title: item.artwork.title, artist: item.artwork.artist, coverUrl: resolveArtworkCoverUrl(item.artwork) });
      }
      grouped.set(item.collectionId, row);
    }

    return collections.map((collection) => ({ ...collection, artworks: grouped.get(collection.id) ?? [] }));
  } catch (err) {
    console.error("[listPublishedCuratedCollections] DB error:", err);
    return [];
  }
}

async function getViews30ByArtworkIds(artworkIds: string[]) {
  if (!artworkIds.length) return new Map<string, number>();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 30);
  start.setUTCHours(0, 0, 0, 0);

  const rows = await db.pageViewDaily.groupBy({
    by: ["entityId"],
    where: { entityType: "ARTWORK", entityId: { in: artworkIds }, day: { gte: start } },
    _sum: { views: true },
  });
  return new Map(rows.map((row) => [row.entityId, Number(row._sum.views ?? 0)]));
}

export async function getPublishedCuratedCollectionBySlug(slug: string, input: CollectionQueryInput = {}): Promise<CuratedCollectionPublic | null> {
  const sort = input.sort ?? "CURATED";
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, input.pageSize ?? 48));

  const collection = await db.curatedCollection.findFirst({
    where: { slug, ...getCollectionVisibilityWhere() },
    select: { id: true, slug: true, title: true, description: true, publishStartsAt: true, publishEndsAt: true, homeRank: true, updatedAt: true },
  });
  if (!collection) return null;
  const items = await db.curatedCollectionItem.findMany({
    where: { collectionId: collection.id, artwork: { isPublished: true } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { artwork: { select: artworkSelect }, sortOrder: true },
  });

  const mapped = items.map((item) => ({
    id: item.artwork.id,
    slug: item.artwork.slug,
    title: item.artwork.title,
    artist: item.artwork.artist,
    coverUrl: resolveArtworkCoverUrl(item.artwork),
    updatedAt: item.artwork.updatedAt,
    sortOrder: item.sortOrder,
  }));

  let ordered = mapped;
  if (sort === "NEWEST") {
    ordered = [...mapped].sort((a, b) => Number(new Date(b.updatedAt ?? 0)) - Number(new Date(a.updatedAt ?? 0)));
  } else if (sort === "VIEWS_30D_DESC") {
    const viewsById = await getViews30ByArtworkIds(mapped.map((item) => item.id));
    ordered = [...mapped].sort((a, b) => {
      const diff = (viewsById.get(b.id) ?? 0) - (viewsById.get(a.id) ?? 0);
      if (diff !== 0) return diff;
      return Number(new Date(b.updatedAt ?? 0)) - Number(new Date(a.updatedAt ?? 0));
    });
  }

  const startIndex = (page - 1) * pageSize;
  const paged = ordered.slice(startIndex, startIndex + pageSize);

  return {
    ...collection,
    itemCount: mapped.length,
    artworks: paged.map((item) => ({ id: item.id, slug: item.slug, title: item.title, artist: item.artist, coverUrl: item.coverUrl })),
  };
}
