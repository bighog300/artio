import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveImageUrl } from "@/lib/assets";
import { apiError } from "@/lib/api";
import { listPublishedArtworkIdsByViews30 } from "@/lib/artworks";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { artworkListQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

type ArtworkListItem = {
  id: string;
  slug: string;
  title: string;
  year: number | null;
  medium: string | null;
  priceAmount: number | null;
  currency: string | null;
  updatedAt: Date;
  artist: { id: string; name: string; slug: string };
  featuredAsset: { url: string } | null;
  images: Array<{ asset: { url: string } | null }>;
};

function buildWhere(input: ReturnType<typeof artworkListQuerySchema.parse>): Prisma.ArtworkWhereInput {
  const { query, artistId, venueId, eventId, mediums, yearFrom, yearTo, priceMin, priceMax, currency, hasPrice, hasImages } = input;
  return {
    isPublished: true,
    deletedAt: null,
    ...(artistId ? { artistId } : {}),
    ...(mediums.length ? { medium: { in: mediums, mode: "insensitive" } } : {}),
    ...(yearFrom != null || yearTo != null ? { year: { gte: yearFrom ?? undefined, lte: yearTo ?? undefined } } : {}),
    ...(priceMin != null || priceMax != null ? { priceAmount: { gte: priceMin ?? undefined, lte: priceMax ?? undefined } } : {}),
    ...(currency ? { currency: currency.toUpperCase() } : {}),
    ...(hasPrice ? { priceAmount: { not: null } } : {}),
    ...(hasImages ? { OR: [{ featuredAssetId: { not: null } }, { images: { some: {} } }] } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(venueId ? { venues: { some: { venueId } } } : {}),
    ...(eventId ? { events: { some: { eventId } } } : {}),
  };
}

function shouldIncludeViews(sort: string, includeViews: boolean) {
  return sort === "VIEWS_30D_DESC" || includeViews;
}

export async function GET(req: NextRequest) {
  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "public:artwork:list"),
      ...RATE_LIMITS.publicRead,
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    throw error;
  }

  const parsed = artworkListQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));

  const input = parsed.data;
  const where = buildWhere(input);
  const includeViews = shouldIncludeViews(input.sort, input.includeViews);

  const select = {
    id: true,
    slug: true,
    title: true,
    year: true,
    medium: true,
    priceAmount: true,
    currency: true,
    updatedAt: true,
    artist: { select: { id: true, name: true, slug: true } },
    featuredAsset: { select: { url: true } },
    images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], take: 1, select: { asset: { select: { url: true } } } },
  } satisfies Prisma.ArtworkSelect;

  if (input.sort === "VIEWS_30D_DESC") {
    const { ids, viewsById, total } = await listPublishedArtworkIdsByViews30(input);
    const itemsById = new Map<string, ArtworkListItem>();
    if (ids.length) {
      const found = await db.artwork.findMany({ where: { id: { in: ids } }, select });
      for (const item of found) itemsById.set(item.id, item as ArtworkListItem);
    }
    const items = ids.map((id) => itemsById.get(id)).filter(Boolean) as ArtworkListItem[];

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        year: item.year,
        medium: item.medium,
        priceAmount: item.priceAmount,
        currency: item.currency,
        artist: item.artist,
        coverUrl: resolveImageUrl(item.featuredAsset?.url, item.images[0]?.asset?.url),
        ...(includeViews ? { views30: viewsById.get(item.id) ?? 0 } : {}),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    });
  }

  const orderBy: Prisma.ArtworkOrderByWithRelationInput[] =
    input.sort === "OLDEST" ? [{ createdAt: "asc" }, { id: "asc" }]
      : input.sort === "YEAR_DESC" ? [{ year: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }]
      : input.sort === "YEAR_ASC" ? [{ year: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }]
      : input.sort === "PRICE_ASC" ? [{ priceAmount: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }]
      : input.sort === "PRICE_DESC" ? [{ priceAmount: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }]
      : [{ updatedAt: "desc" }];

  const [items, total] = await Promise.all([
    db.artwork.findMany({ where, orderBy, skip: (input.page - 1) * input.pageSize, take: input.pageSize, select }),
    db.artwork.count({ where }),
  ]);

  let viewsById = new Map<string, number>();
  if (includeViews && items.length) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 30);
    start.setUTCHours(0, 0, 0, 0);
    const grouped = await db.pageViewDaily.groupBy({
      by: ["entityId"],
      where: { entityType: "ARTWORK", entityId: { in: items.map((item) => item.id) }, day: { gte: start } },
      _sum: { views: true },
    });
    viewsById = new Map(grouped.map((row) => [row.entityId, row._sum.views ?? 0]));
  }

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      artist: item.artist,
      coverUrl: resolveImageUrl(item.featuredAsset?.url, item.images[0]?.asset?.url),
      year: item.year,
      medium: item.medium,
      priceAmount: item.priceAmount,
      currency: item.currency,
      ...(includeViews ? { views30: viewsById.get(item.id) ?? 0 } : {}),
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  });
}
