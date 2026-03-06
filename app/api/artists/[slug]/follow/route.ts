import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { slugParamSchema, zodDetails } from "@/lib/validators";
import { followStatusResponse, getFollowersCount } from "@/lib/follow-counts";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "public:artists:follow-status"),
      ...RATE_LIMITS.publicRead,
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    throw error;
  }

  const parsed = slugParamSchema.safeParse(await params);
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error));

  const artist = await db.artist.findFirst({ where: { slug: parsed.data.slug, isPublished: true }, select: { id: true } });
  if (!artist) return apiError(404, "not_found", "Artist not found");

  const user = await getSessionUser();
  const [followersCount, follow] = await Promise.all([
    getFollowersCount("ARTIST", artist.id),
    user ? db.follow.findUnique({ where: { userId_targetType_targetId: { userId: user.id, targetType: "ARTIST", targetId: artist.id } }, select: { id: true } }) : Promise.resolve(null),
  ]);

  return NextResponse.json(followStatusResponse({ followersCount, isAuthenticated: Boolean(user), hasFollow: Boolean(follow) }));
}
