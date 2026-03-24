import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { artistListQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";
import { resolveEntityPrimaryImage } from "@/lib/public-images";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "public:artists:list"),
      ...RATE_LIMITS.publicRead,
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    throw error;
  }

  const parsed = artistListQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));

  const { query, page, pageSize, sort } = parsed.data;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "10") || 10, 10);
  const where = {
    isPublished: true,
    deletedAt: null,
    ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
  };

  if (query) {
    const artists = await db.artist.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ artists, items: artists, page: 1, pageSize: artists.length, total: artists.length });
  }

  const dbArtists = await db.artist.findMany({
    where,
    orderBy: sort === "az" ? { name: "asc" } : undefined,
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      avatarImageUrl: true,
      featuredImageUrl: true,
      mediums: true,
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, sortOrder: true, isPrimary: true, width: true, height: true, asset: { select: { url: true } } } },
      eventArtists: { where: { event: { isPublished: true, deletedAt: null } }, take: 8, select: { event: { select: { eventTags: { select: { tag: { select: { slug: true } } } } } } } },
    },
  });

  const ids = dbArtists.map((artist) => artist.id);
  const [followerCounts, artworkCounts, forSaleCounts, total] = await Promise.all([
    ids.length ? db.follow.groupBy({ by: ["targetId"], where: { targetType: "ARTIST", targetId: { in: ids } }, _count: { _all: true } }) : Promise.resolve([]),
    ids.length ? db.artwork.groupBy({ by: ["artistId"], where: { isPublished: true, deletedAt: null, artistId: { in: ids } }, _count: { _all: true } }) : Promise.resolve([]),
    ids.length
      ? db.artwork.groupBy({
          by: ["artistId"],
          where: {
            isPublished: true,
            deletedAt: null,
            artistId: { in: ids },
            priceAmount: { not: null },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    db.artist.count({ where }),
  ]);

  const followersByArtistId = new Map(followerCounts.map((entry) => [entry.targetId, entry._count._all]));
  const artworkCountByArtistId = new Map(artworkCounts.map((entry) => [entry.artistId, entry._count._all]));
  const forSaleCountByArtistId = new Map(forSaleCounts.map((entry) => [entry.artistId, entry._count._all]));

  let items = dbArtists.map((artist) => {
    const image = resolveEntityPrimaryImage(artist);
    return {
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
      bio: artist.bio,
      avatarImageUrl: image?.url ?? artist.avatarImageUrl,
      image,
      imageAlt: artist.name,
      tags:
        artist.mediums.length > 0
          ? Array.from(new Set(artist.mediums)).slice(0, 6)
          : Array.from(new Set(artist.eventArtists.flatMap((row) => row.event.eventTags.map(({ tag }) => tag.slug)))).slice(0, 6),
      followersCount: followersByArtistId.get(artist.id) ?? 0,
      isFollowing: false,
      artworkCount: artworkCountByArtistId.get(artist.id) ?? 0,
      forSaleCount: forSaleCountByArtistId.get(artist.id) ?? 0,
    };
  });

  if (sort === "followers") {
    items = items.sort((a, b) => b.followersCount - a.followersCount || a.name.localeCompare(b.name));
  }
  if (sort === "forsale") {
    items = items.sort((a, b) => b.forSaleCount - a.forSaleCount || a.name.localeCompare(b.name));
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return NextResponse.json({ items: items.slice(start, end), page, pageSize, total });
}
