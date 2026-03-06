import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
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
  return NextResponse.json(artist);
}
