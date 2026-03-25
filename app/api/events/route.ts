import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { eventsQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";
import { buildStartAtIdCursorPredicate, START_AT_ID_ORDER_BY } from "@/lib/cursor-predicate";
import { getBoundingBox, isWithinRadiusKm } from "@/lib/geo";
import { logInfo, logWarn } from "@/lib/logging";
import { getRequestId } from "@/lib/request-id";
import { captureException } from "@/lib/telemetry";
import { collectGeoFilteredPage } from "@/lib/events-geo-pagination";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { resolveEntityPrimaryImage } from "@/lib/public-images";
import { publishedEventWhere } from "@/lib/publish-status";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";

type EventWithJoin = {
  id: string;
  lat: number | null;
  lng: number | null;
  featuredImageUrl?: string | null;
  venue?: { lat: number | null; lng: number | null } | null;
  images?: Array<{ url?: string | null; alt?: string | null; sortOrder?: number | null; isPrimary?: boolean | null; asset?: { url?: string | null; originalUrl?: string | null; processingStatus?: string | null; processingError?: string | null; variants?: Array<{ variantName: string; url: string | null }> } | null }>;
  eventTags?: Array<{ tag: { name: string; slug: string } }>;
  eventArtists?: Array<{ artistId: string }>;
  startAt: Date;
};

export const runtime = "nodejs";

const SLOW_ROUTE_THRESHOLD_MS = 800;

function encodeCursor(item: Pick<EventWithJoin, "id" | "startAt">) {
  return Buffer.from(JSON.stringify({ id: item.id, startAt: item.startAt.toISOString() })).toString("base64url");
}

function decodeCursor(cursor: string) {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as { id?: string; startAt?: string };
    if (!parsed.id || !parsed.startAt) return null;
    const startAt = new Date(parsed.startAt);
    if (Number.isNaN(startAt.getTime())) return null;
    return { id: parsed.id, startAt };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req.headers);
  const startedAt = performance.now();

  try {
    const parsed = eventsQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error), requestId);

    const { cursor, limit, query, venue, artist, from, to, tags, lat, lng, radiusKm } = parsed.data;
    if (query || tags || venue || artist || cursor) {
      await enforceRateLimit({
        key: principalRateLimitKey(req, "events:expensive-read"),
        limit: RATE_LIMITS.expensiveReads.limit,
        windowMs: RATE_LIMITS.expensiveReads.windowMs,
      });
    }
    const tagList = (tags || "").split(",").map((t) => t.trim()).filter(Boolean);
    const box = lat != null && lng != null && radiusKm != null ? getBoundingBox(lat, lng, radiusKm) : null;
    const decodedCursor = cursor ? decodeCursor(cursor) : null;

    const filters: Prisma.EventWhereInput[] = [];
    if (query) filters.push({ OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] });
    if (from || to) filters.push({ startAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } });
    if (venue) filters.push({ venue: { slug: venue, deletedAt: null } });
    if (artist) filters.push({ eventArtists: { some: { artist: { slug: artist, isPublished: true, deletedAt: null } } } });
    if (tagList.length) filters.push({ eventTags: { some: { tag: { slug: { in: tagList } } } } });
    if (box) {
      filters.push({
        OR: [
          { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
          { venue: { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } } },
        ],
      });
    }

    const shouldLogSegments = process.env.PERF_LOG_QUERY_SEGMENTS === "true";

    const findBatch = async (batchCursor: { id: string; startAt: Date } | null, take: number) => {
      const effectiveCursor = batchCursor ?? decodedCursor;
      const batchFilters = [...filters, ...buildStartAtIdCursorPredicate(effectiveCursor)];
      const queryStartedAt = performance.now();
      const rows = (await db.event.findMany({
        where: {
          ...publishedEventWhere(),
          deletedAt: null,
          AND: [...batchFilters, { OR: [{ venueId: null }, { venue: { deletedAt: null } }] }],
        },
        take,
        orderBy: START_AT_ID_ORDER_BY,
        include: {
          eventArtists: { select: { artistId: true } },
          venue: { select: { id: true, name: true, slug: true, city: true, lat: true, lng: true } },
          images: { orderBy: { sortOrder: "asc" }, include: { asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } } },
          eventTags: { include: { tag: { select: { name: true, slug: true } } } },
        },
      })) as EventWithJoin[];

      if (shouldLogSegments) {
        logInfo({
          message: "api_events_batch_query_completed",
          route: "/api/events",
          requestId,
          durationMs: Number((performance.now() - queryStartedAt).toFixed(1)),
          take,
          resultCount: rows.length,
          geoEnabled: Boolean(box),
        });
      }

      return rows;
    };

    const geoEnabled = box && lat != null && lng != null && radiusKm != null;
    const pageResult = geoEnabled
      ? await collectGeoFilteredPage<EventWithJoin>({
          limit,
          initialCursor: decodedCursor,
          fetchBatch: findBatch,
          toCursor: (item) => ({ id: item.id, startAt: item.startAt }),
          isMatch: (e) => {
            const sourceLat = e.lat ?? e.venue?.lat;
            const sourceLng = e.lng ?? e.venue?.lng;
            return sourceLat != null && sourceLng != null && isWithinRadiusKm(lat, lng, sourceLat, sourceLng, radiusKm);
          },
        })
      : (() => ({
          page: [] as EventWithJoin[],
          hasMore: false,
          nextCursor: null,
        }))();

    const fallbackItems = geoEnabled ? [] : await findBatch(null, limit + 1);
    const hasMore = geoEnabled ? pageResult.hasMore : fallbackItems.length > limit;
    const page = geoEnabled ? pageResult.page : (hasMore ? fallbackItems.slice(0, limit) : fallbackItems);
    const durationMs = Number((performance.now() - startedAt).toFixed(1));

    const eventIds = page.map((event) => event.id);
    const artworkCounts = eventIds.length
      ? await db.artworkEvent.groupBy({ by: ["eventId"], where: { eventId: { in: eventIds }, artwork: { isPublished: true } }, _count: { _all: true } })
      : [];
    const artworkCountByEventId = new Map(artworkCounts.map((entry) => [entry.eventId, entry._count._all]));

    logInfo({ message: "api_events_completed", route: "/api/events", requestId, durationMs, resultCount: page.length });
    if (durationMs > SLOW_ROUTE_THRESHOLD_MS) {
      logWarn({ message: "api_events_slow", route: "/api/events", requestId, durationMs, resultCount: page.length, thresholdMs: SLOW_ROUTE_THRESHOLD_MS });
    }

    return NextResponse.json({
      items: page.map((e) => {
        const image = resolveEntityPrimaryImage(e);
        const imageUrl = image?.url ?? null;
        const displayImage = resolveAssetDisplay({
          asset: e.images?.[0]?.asset ?? null,
          requestedVariant: "card",
          legacyUrl: e.images?.[0]?.url ?? imageUrl,
        });
        return {
          ...e,
          image: toApiImageField(displayImage),
          // Transitional compatibility field; prefer `image` and remove after full asset pipeline rollout.
          featuredImageUrl: imageUrl,
          // Transitional compatibility field; prefer `image` and remove after full asset pipeline rollout.
          primaryImageUrl: displayImage.url ?? imageUrl,
          primaryImageAlt: image?.alt ?? null,
          primaryImageWidth: image?.width ?? null,
          primaryImageHeight: image?.height ?? null,
          tags: (e.eventTags ?? []).map((et) => ({ name: et.tag.name, slug: et.tag.slug })),
          artistIds: (e.eventArtists ?? []).map((eventArtist) => eventArtist.artistId),
          artworkCount: artworkCountByEventId.get(e.id) ?? 0,
        };
      }),
      nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    captureException(error, { route: "/api/events", requestId });
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}
