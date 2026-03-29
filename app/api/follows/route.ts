import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { guardUser } from "@/lib/auth-guard";
import { deleteFollowWithDeps, splitFollowIds, upsertFollowWithDeps } from "@/lib/follows";
import { followBodySchema, parseBody, zodDetails } from "@/lib/validators";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { setOnboardingFlagForSession } from "@/lib/onboarding";
import { followCountCacheTag } from "@/lib/follow-counts";
import { publishedVenueWhere } from "@/lib/publish-status";

export const runtime = "nodejs";

export async function GET() {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;
  try {
    const follows = await db.follow.findMany({
      where: { userId: user.id },
      select: { targetType: true, targetId: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(splitFollowIds(follows));
  } catch {
    return apiError(500, "internal_error", "Failed to fetch follows");
  }
}

export async function POST(req: NextRequest) {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;
  try {
    const parsed = followBodySchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid follow payload", zodDetails(parsed.error));

    await enforceRateLimit({
      key: principalRateLimitKey(req, "follows:write", user.id),
      limit: RATE_LIMITS.followsWrite.limit,
      windowMs: RATE_LIMITS.followsWrite.windowMs,
    });

    const result = await upsertFollowWithDeps(
      {
        findTarget: async (targetType, targetId) => {
          if (targetType === "ARTIST") {
            const artist = await db.artist.findFirst({ where: { id: targetId, isPublished: true }, select: { id: true } });
            return Boolean(artist);
          }
          const venue = await db.venue.findFirst({ where: { id: targetId, ...publishedVenueWhere() }, select: { id: true } });
          return Boolean(venue);
        },
        upsert: async ({ userId, targetType, targetId }) => {
          await db.follow.upsert({
            where: { userId_targetType_targetId: { userId, targetType, targetId } },
            update: {},
            create: { userId, targetType, targetId },
          });
        },
      },
      { userId: user.id, targetType: parsed.data.targetType, targetId: parsed.data.targetId },
    );

    if (!result.ok) return apiError(404, "not_found", "Follow target not found");
    revalidateTag(followCountCacheTag(parsed.data.targetType, parsed.data.targetId));
    await setOnboardingFlagForSession(user, "hasFollowedSomething", true, { path: "/api/follows" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Failed to create follow");
  }
}

export async function DELETE(req: NextRequest) {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;
  try {
    const parsed = followBodySchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid follow payload", zodDetails(parsed.error));

    await enforceRateLimit({
      key: principalRateLimitKey(req, "follows:write", user.id),
      limit: RATE_LIMITS.followsWrite.limit,
      windowMs: RATE_LIMITS.followsWrite.windowMs,
    });

    await deleteFollowWithDeps(
      {
        deleteMany: async ({ userId, targetType, targetId }) => {
          await db.follow.deleteMany({ where: { userId, targetType, targetId } });
        },
      },
      { userId: user.id, targetType: parsed.data.targetType, targetId: parsed.data.targetId },
    );

    revalidateTag(followCountCacheTag(parsed.data.targetType, parsed.data.targetId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Failed to delete follow");
  }
}
