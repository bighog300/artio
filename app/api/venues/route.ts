import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { paramsToObject, searchQuerySchema, zodDetails } from "@/lib/validators";
import { publishedVenueWhere } from "@/lib/publish-status";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const parsed = searchQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));
  const { query } = parsed.data;
  const venues = await db.venue.findMany({
    where: { ...publishedVenueWhere(), deletedAt: null, ...(query ? { name: { contains: query, mode: "insensitive" } } : {}) },
    orderBy: { name: "asc" },
    include: {
      featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
      images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true, asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } } },
    },
  });
  return NextResponse.json({
    items: venues.map((venue) => {
      const imageDisplay = resolveAssetDisplay({
        asset: venue.featuredAsset ?? venue.images[0]?.asset ?? null,
        requestedVariant: "card",
        legacyUrl: venue.images[0]?.url ?? venue.featuredImageUrl,
      });
      return {
        ...venue,
        image: toApiImageField(imageDisplay),
        // Transitional compatibility field; prefer `image` and remove after full asset pipeline rollout.
        primaryImageUrl: imageDisplay.url ?? venue.featuredImageUrl ?? null,
      };
    }),
  });
}
