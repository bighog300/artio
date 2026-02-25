import { resolveImageUrl } from "@/lib/assets";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type ArtworkCoverSource = {
  featuredAsset?: { url: string | null } | null;
  images?: Array<{ asset?: { url: string | null } | null }>;
};

export type PublishedArtworkListItem = {
  id: string;
  slug: string | null;
  title: string;
  coverUrl: string | null;
  artist: { id: string; name: string };
};

export type ArtworkViews30QueryInput = {
  page: number;
  pageSize: number;
  query?: string;
  artistId?: string;
  venueId?: string;
  eventId?: string;
  mediums: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string;
  hasPrice?: boolean;
  hasImages?: boolean;
};

export type TrendingArtworkListItem = {
  id: string;
  slug: string | null;
  title: string;
  coverUrl: string | null;
  artist: { name: string; slug: string };
  views30: number;
};

export function resolveArtworkCoverUrl(artwork: ArtworkCoverSource): string | null {
  if (artwork.featuredAsset?.url) return artwork.featuredAsset.url;
  const firstImage = artwork.images?.find((image) => image.asset?.url);
  return resolveImageUrl(firstImage?.asset?.url, null);
}

export function getArtworkPublicHref(artwork: { id: string; slug?: string | null }) {
  return `/artwork/${artwork.slug ?? artwork.id}`;
}

export function publishedArtworksByArtistWhere(artistId: string) {
  return { artistId, isPublished: true, deletedAt: null };
}

export function publishedArtworksByVenueWhere(venueId: string) {
  return { isPublished: true, deletedAt: null, venues: { some: { venueId } } };
}

export function publishedArtworksByEventWhere(eventId: string) {
  return { isPublished: true, deletedAt: null, events: { some: { eventId } } };
}


type PublishedArtworkRow = {
  id: string;
  slug: string | null;
  title: string;
  artist: { id: string; name: string };
  featuredAsset: { url: string | null } | null;
  images: Array<{ asset: { url: string | null } | null }>;
};

type ArtworkCountDeps = {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
};

function artworkCountDeps(): ArtworkCountDeps {
  return { count: (args) => db.artwork.count(args) };
}

export async function countPublishedArtworksByArtist(artistId: string, deps: ArtworkCountDeps = artworkCountDeps()) {
  return deps.count({ where: publishedArtworksByArtistWhere(artistId) });
}

export async function countPublishedArtworksByVenue(venueId: string, deps: ArtworkCountDeps = artworkCountDeps()) {
  return deps.count({ where: publishedArtworksByVenueWhere(venueId) });
}

export async function countPublishedArtworksByEvent(eventId: string, deps: ArtworkCountDeps = artworkCountDeps()) {
  return deps.count({ where: publishedArtworksByEventWhere(eventId) });
}

export async function countAllArtworksByArtist(artistId: string, deps: ArtworkCountDeps = artworkCountDeps()) {
  return deps.count({ where: { artistId } });
}

function mapPublishedArtworkRow(item: PublishedArtworkRow): PublishedArtworkListItem {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    artist: item.artist,
    coverUrl: resolveImageUrl(item.featuredAsset?.url, item.images[0]?.asset?.url),
  };
}

const selectRelatedArtwork = {
  id: true,
  slug: true,
  title: true,
  artist: { select: { id: true, name: true } },
  featuredAsset: { select: { url: true } },
  images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], take: 1, select: { asset: { select: { url: true } } } },
};

export async function listPublishedArtworksByArtist(artistId: string, limit = 6): Promise<PublishedArtworkListItem[]> {
  const items = await db.artwork.findMany({ where: publishedArtworksByArtistWhere(artistId), orderBy: { updatedAt: "desc" }, take: limit, select: selectRelatedArtwork });
  return items.map(mapPublishedArtworkRow);
}

export async function listPublishedArtworksByVenue(venueId: string, limit = 6): Promise<PublishedArtworkListItem[]> {
  const items = await db.artwork.findMany({ where: publishedArtworksByVenueWhere(venueId), orderBy: { updatedAt: "desc" }, take: limit, select: selectRelatedArtwork });
  return items.map(mapPublishedArtworkRow);
}

export async function listPublishedArtworksByEvent(eventId: string, limit = 6): Promise<PublishedArtworkListItem[]> {
  const items = await db.artwork.findMany({ where: publishedArtworksByEventWhere(eventId), orderBy: { updatedAt: "desc" }, take: limit, select: selectRelatedArtwork });
  return items.map(mapPublishedArtworkRow);
}

type ArtistFeaturedDeps = {
  findMany: (args: {
    where: { artistId: string; artwork: { isPublished: true; deletedAt: null } };
    orderBy: Array<{ sortOrder: "asc" } | { createdAt: "asc" }>;
    take: number;
    select: { artwork: { select: typeof selectRelatedArtwork } };
  }) => Promise<Array<{ artwork: PublishedArtworkRow }>>;
};

function artistFeaturedDeps(): ArtistFeaturedDeps {
  return { findMany: (args) => db.artistFeaturedArtwork.findMany(args) };
}

export async function listFeaturedArtworksByArtist(artistId: string, limit = 6, deps: ArtistFeaturedDeps = artistFeaturedDeps()): Promise<PublishedArtworkListItem[]> {
  const items = await deps.findMany({
    where: { artistId, artwork: { isPublished: true, deletedAt: null } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: { artwork: { select: selectRelatedArtwork } },
  });
  return items.map((item) => mapPublishedArtworkRow(item.artwork));
}

export async function listPublishedArtworkIdsByViews30(input: ArtworkViews30QueryInput) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 30);
  start.setUTCHours(0, 0, 0, 0);

  const [rows, totalRows] = await Promise.all([
    db.$queryRaw<Array<{ id: string; views30: bigint | number | null }>>`
      WITH filtered AS (
        SELECT a."id", a."updatedAt"
        FROM "Artwork" a
        WHERE a."isPublished" = true
          AND a."deletedAt" IS NULL
          ${input.artistId ? Prisma.sql`AND a."artistId" = ${input.artistId}::uuid` : Prisma.empty}
          ${input.yearFrom != null ? Prisma.sql`AND a."year" >= ${input.yearFrom}` : Prisma.empty}
          ${input.yearTo != null ? Prisma.sql`AND a."year" <= ${input.yearTo}` : Prisma.empty}
          ${input.priceMin != null ? Prisma.sql`AND a."priceAmount" >= ${input.priceMin}` : Prisma.empty}
          ${input.priceMax != null ? Prisma.sql`AND a."priceAmount" <= ${input.priceMax}` : Prisma.empty}
          ${input.currency ? Prisma.sql`AND a."currency" = ${input.currency.toUpperCase()}` : Prisma.empty}
          ${input.hasPrice ? Prisma.sql`AND a."priceAmount" IS NOT NULL` : Prisma.empty}
          ${input.hasImages ? Prisma.sql`AND (a."featuredAssetId" IS NOT NULL OR EXISTS (SELECT 1 FROM "ArtworkImage" ai WHERE ai."artworkId" = a."id"))` : Prisma.empty}
          ${input.query ? Prisma.sql`AND (a."title" ILIKE ${`%${input.query}%`} OR a."description" ILIKE ${`%${input.query}%`})` : Prisma.empty}
          ${input.venueId ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ArtworkVenue" av WHERE av."artworkId" = a."id" AND av."venueId" = ${input.venueId}::uuid)` : Prisma.empty}
          ${input.eventId ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ArtworkEvent" ae WHERE ae."artworkId" = a."id" AND ae."eventId" = ${input.eventId}::uuid)` : Prisma.empty}
          ${input.mediums.length ? Prisma.sql`AND LOWER(COALESCE(a."medium", '')) IN (${Prisma.join(input.mediums.map((value) => value.toLowerCase()))})` : Prisma.empty}
      )
      SELECT f."id", COALESCE(SUM(pvd."views"), 0) as "views30"
      FROM filtered f
      LEFT JOIN "PageViewDaily" pvd
        ON pvd."entityId" = f."id"
       AND pvd."entityType" = 'ARTWORK'::"AnalyticsEntityType"
       AND pvd."day" >= ${start}
      GROUP BY f."id", f."updatedAt"
      ORDER BY "views30" DESC, f."updatedAt" DESC
      OFFSET ${(input.page - 1) * input.pageSize}
      LIMIT ${input.pageSize}
    `,
    db.$queryRaw<Array<{ total: bigint | number }>>`
      SELECT COUNT(*) as total
      FROM "Artwork" a
      WHERE a."isPublished" = true
        AND a."deletedAt" IS NULL
        ${input.artistId ? Prisma.sql`AND a."artistId" = ${input.artistId}::uuid` : Prisma.empty}
        ${input.yearFrom != null ? Prisma.sql`AND a."year" >= ${input.yearFrom}` : Prisma.empty}
        ${input.yearTo != null ? Prisma.sql`AND a."year" <= ${input.yearTo}` : Prisma.empty}
        ${input.priceMin != null ? Prisma.sql`AND a."priceAmount" >= ${input.priceMin}` : Prisma.empty}
        ${input.priceMax != null ? Prisma.sql`AND a."priceAmount" <= ${input.priceMax}` : Prisma.empty}
        ${input.currency ? Prisma.sql`AND a."currency" = ${input.currency.toUpperCase()}` : Prisma.empty}
        ${input.hasPrice ? Prisma.sql`AND a."priceAmount" IS NOT NULL` : Prisma.empty}
        ${input.hasImages ? Prisma.sql`AND (a."featuredAssetId" IS NOT NULL OR EXISTS (SELECT 1 FROM "ArtworkImage" ai WHERE ai."artworkId" = a."id"))` : Prisma.empty}
        ${input.query ? Prisma.sql`AND (a."title" ILIKE ${`%${input.query}%`} OR a."description" ILIKE ${`%${input.query}%`})` : Prisma.empty}
        ${input.venueId ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ArtworkVenue" av WHERE av."artworkId" = a."id" AND av."venueId" = ${input.venueId}::uuid)` : Prisma.empty}
        ${input.eventId ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ArtworkEvent" ae WHERE ae."artworkId" = a."id" AND ae."eventId" = ${input.eventId}::uuid)` : Prisma.empty}
        ${input.mediums.length ? Prisma.sql`AND LOWER(COALESCE(a."medium", '')) IN (${Prisma.join(input.mediums.map((value) => value.toLowerCase()))})` : Prisma.empty}
    `,
  ]);

  return {
    ids: rows.map((row) => row.id),
    viewsById: new Map(rows.map((row) => [row.id, Number(row.views30 ?? 0)])),
    total: Number(totalRows[0]?.total ?? 0),
  };
}

export async function getTrendingArtworks30({ limit = 10 }: { limit?: number } = {}): Promise<TrendingArtworkListItem[]> {
  const { ids, viewsById } = await listPublishedArtworkIdsByViews30({
    page: 1,
    pageSize: limit,
    mediums: [],
    hasImages: false,
    hasPrice: false,
  });
  if (!ids.length) return [];

  const found = await db.artwork.findMany({
    where: { id: { in: ids }, isPublished: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      artist: { select: { name: true, slug: true } },
      featuredAsset: { select: { url: true } },
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1, select: { asset: { select: { url: true } } } },
    },
  });
  const itemsById = new Map(found.map((item) => [item.id, item]));
  return ids
    .map((id) => itemsById.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      coverUrl: resolveImageUrl(item.featuredAsset?.url, item.images[0]?.asset?.url),
      artist: item.artist,
      views30: viewsById.get(item.id) ?? 0,
    }));
}
