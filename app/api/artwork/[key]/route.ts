import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { artworkRouteKeyParamSchema, zodDetails } from "@/lib/validators";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";
import { isArtworkIdKey } from "@/lib/artwork-route";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "public:artwork:detail"),
      ...RATE_LIMITS.publicRead,
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    throw error;
  }

  const parsedParams = artworkRouteKeyParamSchema.safeParse(await params);
  if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error));

  const key = parsedParams.data.key;
  const artwork = await db.artwork.findFirst({
    where: isArtworkIdKey(key) ? { id: key, deletedAt: null } : { slug: key, deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      year: true,
      medium: true,
      dimensions: true,
      priceAmount: true,
      currency: true,
      isPublished: true,
      artistId: true,
      artist: { select: { id: true, name: true, slug: true, userId: true } },
      featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
      images: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, alt: true, sortOrder: true, asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } },
      },
      venues: { select: { venue: { select: { id: true, name: true, slug: true } } } },
      events: { select: { event: { select: { id: true, title: true, slug: true } } } },
    },
  });

  if (!artwork || !artwork.isPublished) return apiError(404, "not_found", "Artwork not found");

  const imageDisplay = resolveAssetDisplay({
    asset: artwork.featuredAsset ?? artwork.images[0]?.asset,
    legacyUrl: artwork.images[0]?.asset?.url ?? null,
    requestedVariant: "card",
  });

  return NextResponse.json({
    artwork: {
      ...artwork,
      image: toApiImageField(imageDisplay),
      coverUrl: imageDisplay.url,
      images: artwork.images.map((image) => ({ ...image, url: image.asset.url })),
      venues: artwork.venues.map((item) => item.venue),
      events: artwork.events.map((item) => item.event),
    },
  });
}
