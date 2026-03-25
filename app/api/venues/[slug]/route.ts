import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { slugParamSchema, zodDetails } from "@/lib/validators";
import { publishedEventWhere, publishedVenueWhere } from "@/lib/publish-status";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const parsed = slugParamSchema.safeParse(await params);
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error));
  const venue = await db.venue.findFirst({
    where: { slug: parsed.data.slug, ...publishedVenueWhere() },
    include: {
      featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
      images: {
        take: 1,
        orderBy: { sortOrder: "asc" },
        select: { url: true, asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } },
      },
      events: { where: publishedEventWhere(), orderBy: { startAt: "asc" } },
    },
  });
  if (!venue) return apiError(404, "not_found", "Venue not found");
  const imageDisplay = resolveAssetDisplay({
    asset: venue.featuredAsset ?? venue.images[0]?.asset ?? null,
    requestedVariant: "card",
    legacyUrl: venue.images[0]?.url ?? venue.featuredImageUrl,
  });
  return NextResponse.json({
    ...venue,
    image: toApiImageField(imageDisplay),
    primaryImageUrl: imageDisplay.url ?? venue.featuredImageUrl ?? null,
  });
}
