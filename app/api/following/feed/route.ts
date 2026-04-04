import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAuth, isAuthError } from "@/lib/auth";
import { FOLLOWING_FEED_ORDER_BY, buildFollowingFeedCursorFilter, getFollowingFeedWithDeps } from "@/lib/following-feed";
import { followingFeedQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const shouldLogPerf = process.env.NODE_ENV !== "production" || process.env.DEBUG_PERF === "1";

export async function GET(req: NextRequest) {
  const parsed = followingFeedQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));

  try {
    const user = await requireAuth();
    const followsMemo = new Map<string, Array<{ targetType: "ARTIST" | "VENUE"; targetId: string }>>();

    const result = await getFollowingFeedWithDeps(
      {
        now: () => new Date(),
        findFollows: async (userId) => {
          const key = `follows:${userId}`;
          const cached = followsMemo.get(key);
          if (cached) return cached;
          const startedAt = performance.now();
          const follows = await db.follow.findMany({
            where: { userId, targetType: { in: ["ARTIST", "VENUE"] } },
            select: { targetType: true, targetId: true },
            orderBy: { createdAt: "desc" },
          });
          if (shouldLogPerf) console.info(`[perf] following/feed follows=${(performance.now() - startedAt).toFixed(1)}ms`);
          const normalized = follows.filter((item): item is { targetType: "ARTIST" | "VENUE"; targetId: string } => item.targetType === "ARTIST" || item.targetType === "VENUE");
          followsMemo.set(key, normalized);
          return normalized;
        },
        findEvents: async ({ artistIds, venueIds, from, to, cursor, limit }) => {
          const startedAt = performance.now();
          const events = await db.event.findMany({
            where: {
              isPublished: true,
              startAt: { gte: from, lte: to },
              AND: [
                {
                  OR: [
                    ...(venueIds.length ? [{ venueId: { in: venueIds } }] : []),
                    ...(artistIds.length ? [{ eventArtists: { some: { artistId: { in: artistIds } } } }] : []),
                  ],
                },
...buildFollowingFeedCursorFilter(cursor),
              ],
            },
            take: limit,
            orderBy: FOLLOWING_FEED_ORDER_BY,
            select: {
              id: true,
              slug: true,
              title: true,
              startAt: true,
              endAt: true,
              venue: { select: { name: true, slug: true } },
            },
          });
          if (shouldLogPerf) console.info(`[perf] following/feed events=${(performance.now() - startedAt).toFixed(1)}ms`);
          return events;
        },
      },
      {
        userId: user.id,
        days: parsed.data.days,
        type: parsed.data.type,
        cursor: parsed.data.cursor,
        limit: parsed.data.limit,
      },
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Login required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
