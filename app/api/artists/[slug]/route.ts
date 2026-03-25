import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { slugParamSchema, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "public:artists:detail"),
      ...RATE_LIMITS.publicRead,
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    throw error;
  }

  const parsed = slugParamSchema.safeParse(await params);
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error));
  const artist = await db.artist.findFirst({
    where: { slug: parsed.data.slug, isPublished: true },
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      websiteUrl: true,
      instagramUrl: true,
      avatarImageUrl: true,
      featuredImageUrl: true,
      images: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { url: true, asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } },
      },
      isPublished: true,
      eventArtists: {
        select: {
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              startAt: true,
              endAt: true,
              isPublished: true,
            },
          },
        },
      },
    },
  });
  if (!artist) return apiError(404, "not_found", "Artist not found");
  const displayImage = resolveAssetDisplay({
    asset: artist.images[0]?.asset ?? null,
    requestedVariant: "card",
    legacyUrl: artist.images[0]?.url ?? artist.avatarImageUrl ?? artist.featuredImageUrl,
  });
  return NextResponse.json({
    ...artist,
    image: toApiImageField(displayImage),
    primaryImageUrl: displayImage.url ?? artist.avatarImageUrl ?? artist.featuredImageUrl ?? null,
  });
}
