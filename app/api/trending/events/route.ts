import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { FavoriteTargetType } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { getRequestId } from "@/lib/request-id";
import { logInfo, logWarn } from "@/lib/logging";
import { captureException } from "@/lib/telemetry";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";

const WINDOW_DAYS = 14;
const LIMIT = 10;
const SLOW_ROUTE_THRESHOLD_MS = 800;

const getTrendingEvents = unstable_cache(
  async () => {
    const since = new Date();
    since.setDate(since.getDate() - WINDOW_DAYS);

    const favoriteCounts = await db.favorite.groupBy({
      by: ["targetId"],
      where: {
        targetType: FavoriteTargetType.EVENT,
        createdAt: { gte: since },
      },
      _count: { _all: true },
      orderBy: { _count: { targetId: "desc" } },
      take: LIMIT,
    });

    if (!favoriteCounts.length) return [];

    const scoreMap = new Map(favoriteCounts.map((row) => [row.targetId, row._count._all]));
    const now = new Date();

    const events = await db.event.findMany({
      where: {
        id: { in: favoriteCounts.map((row) => row.targetId) },
        isPublished: true,
        startAt: { gte: now },
      },
      include: {
        venue: { select: { id: true, name: true } },
        images: { take: 1, orderBy: { sortOrder: "asc" }, include: { asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } } },
        eventTags: { include: { tag: { select: { slug: true, name: true } } } },
      },
    });

    return events
      .map((event) => {
        const primaryDisplay = resolveAssetDisplay({
          asset: event.images?.[0]?.asset,
          requestedVariant: "card",
          legacyUrl: event.images?.[0]?.url ?? null,
        });
        return ({
        id: event.id,
        slug: event.slug,
        title: event.title,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt?.toISOString() ?? null,
        venue: event.venue,
        tags: event.eventTags.map((eventTag) => ({ slug: eventTag.tag.slug, name: eventTag.tag.name })),
        primaryImageUrl: primaryDisplay.url,
        imageSource: primaryDisplay.source,
        imageIsProcessing: primaryDisplay.isProcessing,
        imageHasFailure: primaryDisplay.hasFailure,
        score: scoreMap.get(event.id) ?? 0,
      });
      })
      .sort((a, b) => b.score - a.score || a.startAt.localeCompare(b.startAt))
      .slice(0, LIMIT);
  },
  ["api-trending-events-v1"],
  { revalidate: 300 },
);

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req.headers);
  const startedAt = performance.now();

  try {
    const items = await getTrendingEvents();
    const durationMs = Number((performance.now() - startedAt).toFixed(1));

    logInfo({ message: "api_trending_events_completed", route: "/api/trending/events", requestId, durationMs, resultCount: items.length });
    if (durationMs > SLOW_ROUTE_THRESHOLD_MS) {
      logWarn({ message: "api_trending_events_slow", route: "/api/trending/events", requestId, durationMs, resultCount: items.length, thresholdMs: SLOW_ROUTE_THRESHOLD_MS });
    }

    return NextResponse.json({ items }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=60" } });
  } catch (error) {
    captureException(error, { route: "/api/trending/events", requestId });
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}
