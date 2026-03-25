import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";
import { distanceKm, getBoundingBox, isWithinRadiusKm } from "@/lib/geo";
import { nearbyVenuesQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";
import { publishedVenueWhere } from "@/lib/publish-status";

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

export async function GET(req: NextRequest) {
  const parsed = nearbyVenuesQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));
  const { lat, lng, radiusKm, limit, cursor, q } = parsed.data;
  const box = getBoundingBox(lat, lng, radiusKm);

  const batch = (await db.venue.findMany({
    where: {
      ...publishedVenueWhere(),
      deletedAt: null,
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: limit + 1,
    include: {
      images: { take: 1, orderBy: { sortOrder: "asc" }, include: { asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } } },
    },
  })) as NearbyVenueRow[];

  const filtered = batch.filter((venue) => venue.lat != null && venue.lng != null && isWithinRadiusKm(lat, lng, venue.lat, venue.lng, radiusKm));
  const pageItems = filtered.slice(0, limit);
  const hasMore = batch.length > limit;
  const nextCursor = hasMore ? batch[limit - 1]?.id ?? null : null;

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
}
