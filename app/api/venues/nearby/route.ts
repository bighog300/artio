import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";
import { distanceKm, getBoundingBox, isWithinRadiusKm } from "@/lib/geo";
import { nearbyVenuesQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";
import { publishedVenueWhere } from "@/lib/publish-status";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

type NearbyVenueRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  images?: Array<{ url: string | null; asset?: { url: string | null; originalUrl?: string | null; processingStatus?: string | null; processingError?: string | null; variants?: Array<{ variantName: string; url: string | null }> } | null }>;
};

function isPrismaSchemaMismatch(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  return code === "P2021" || code === "P2022";
}

export async function GET(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL && !process.env.DIRECT_URL) {
      console.error("venues_nearby_config_error", {
        route: "/api/venues/nearby",
        missingEnvVars: ["DATABASE_URL", "DIRECT_URL"],
      });
      return apiError(500, "server_config_error", "Server database configuration is missing (DATABASE_URL or DIRECT_URL).");
    }

    const parsed = nearbyVenuesQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));
    const { lat, lng, radiusKm, limit, cursor, q, tags, from, to, days } = parsed.data;

    await enforceRateLimit({
      key: principalRateLimitKey(req, "venues:nearby"),
      limit: RATE_LIMITS.expensiveReads.limit,
      windowMs: RATE_LIMITS.expensiveReads.windowMs,
    });
    const now = new Date();
    const windowStart = from ? new Date(from) : now;
    const windowEnd = to ? new Date(to) : (days ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000) : undefined);
    const eventWindowFilter: Prisma.VenueWhereInput = (tags.length || from || to || days)
      ? {
        events: {
          some: {
            isPublished: true,
            startAt: {
              gte: windowStart,
              ...(windowEnd ? { lte: windowEnd } : {}),
            },
            ...(tags.length ? { eventTags: { some: { tag: { slug: { in: tags } } } } } : {}),
          },
        },
      }
      : {};
    const box = getBoundingBox(lat, lng, radiusKm);

    const commonWhere: Prisma.VenueWhereInput = {
      ...publishedVenueWhere(),
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
      ...(q ? { name: { contains: q, mode: Prisma.QueryMode.insensitive } } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
      ...eventWindowFilter,
    };

    let batch: NearbyVenueRow[];
    try {
      batch = (await db.venue.findMany({
        where: {
          ...commonWhere,
          deletedAt: null,
        },
        orderBy: { id: "asc" },
        take: limit + 1,
        include: {
          images: { take: 1, orderBy: { sortOrder: "asc" }, include: { asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } } },
        },
      })) as NearbyVenueRow[];
    } catch (error) {
      if (!isPrismaSchemaMismatch(error)) throw error;
      console.error("venues_nearby_schema_mismatch_fallback", {
        code: "code" in (error as object) ? (error as { code?: string }).code : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
      batch = (await db.venue.findMany({
        where: commonWhere,
        orderBy: { id: "asc" },
        take: limit + 1,
        include: {
          images: { take: 1, orderBy: { sortOrder: "asc" }, include: { asset: { select: { url: true } } } },
        },
      })) as NearbyVenueRow[];
    }

    const filtered = batch.filter(
      (venue) =>
        venue.lat != null &&
        venue.lng != null &&
        isWithinRadiusKm(lat, lng, venue.lat, venue.lng, radiusKm),
    );
    const pageItems = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null;

    const response = NextResponse.json({
      items: pageItems.map((venue) => {
        const imageDisplay = resolveAssetDisplay({
          asset: venue.images?.[0]?.asset ?? null,
          requestedVariant: "card",
          legacyUrl: venue.images?.[0]?.url ?? null,
        });
        return ({
          id: venue.id,
          slug: venue.slug,
          name: venue.name,
          city: venue.city,
          lat: venue.lat,
          lng: venue.lng,
          distanceKm: venue.lat != null && venue.lng != null ? Number(distanceKm(lat, lng, venue.lat, venue.lng).toFixed(2)) : null,
          image: toApiImageField(imageDisplay),
          primaryImageUrl: imageDisplay.url,
        });
      }),
      nextCursor,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    console.error("venues_nearby_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      route: "/api/venues/nearby",
      method: req.method,
      query: req.nextUrl.searchParams.toString(),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
