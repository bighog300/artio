import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";
import { START_AT_ID_ORDER_BY } from "@/lib/cursor-predicate";
import { distanceKm, getBoundingBox, isWithinRadiusKm } from "@/lib/geo";
import { buildNearbyEventsFilters } from "@/lib/nearby-events";
import { decodeNearbyCursor, encodeNearbyCursor } from "@/lib/nearby-cursor";
import { nearbyEventsQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";
import { publishedEventWhere } from "@/lib/publish-status";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

type NearbyEventWithJoin = {
  id: string;
  lat: number | null;
  lng: number | null;
  startAt: Date;
  venue?: { name: string; slug: string; city: string | null; lat: number | null; lng: number | null } | null;
  images?: Array<{ url: string | null; asset?: { url: string | null; originalUrl?: string | null; processingStatus?: string | null; processingError?: string | null; variants?: Array<{ variantName: string; url: string | null }> } | null }>;
  eventTags?: Array<{ tag: { name: string; slug: string } }>;
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: NextRequest) {
  const parsed = nearbyEventsQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));

  const { lat, lng, radiusKm, days, cursor, limit, q, tags, from, to, sort } = parsed.data;
  const now = new Date();
  const dateFrom = from ? new Date(from) : startOfDay(now);
  const dateTo = to ? new Date(to) : (() => {
    const next = new Date(dateFrom);
    next.setDate(next.getDate() + (days ?? 30));
    return next;
  })();
  const box = getBoundingBox(lat, lng, radiusKm);
  let hiddenEventIds: string[] = [];
  try {
    const user = await getSessionUser();
    if (user) {
      const hides = await db.engagementEvent.findMany({
        where: { userId: user.id, action: "HIDE", targetType: "EVENT" },
        select: { targetId: true },
        distinct: ["targetId"],
      });
      hiddenEventIds = hides.map((h) => h.targetId);
    }
  } catch {
    // Outside Next.js request context (e.g. tests) — skip hidden filter
  }
  let workingCursor = cursor ? decodeNearbyCursor(cursor) : null;
  const pageItems: NearbyEventWithJoin[] = [];
  const batchSize = Math.min(50, Math.max(limit * 3, limit + 1));
  let iterations = 0;
  let dbHasMore = true;

  while (pageItems.length < limit && dbHasMore && iterations < 5) {
    iterations += 1;
    const nearbyFilters = buildNearbyEventsFilters({ cursor: workingCursor, from: dateFrom, to: dateTo, hiddenEventIds });
    const dateWindowFilters: Prisma.EventWhereInput[] = [
      { startAt: { lte: dateTo } },
      {
        OR: [
          { endAt: { gte: dateFrom } },
          { endAt: null, startAt: { gte: dateFrom } },
        ],
      },
    ];
    const andFilters: Prisma.EventWhereInput[] = [
      ...dateWindowFilters,
      {
        OR: [
          { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
          { venue: { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } } },
        ],
      },
      ...nearbyFilters.cursorFilters,
      ...nearbyFilters.hiddenFilters,
    ];
    if (q) andFilters.push({ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { venue: { name: { contains: q, mode: "insensitive" as const } } }] });
    if (tags.length) andFilters.push({ eventTags: { some: { tag: { slug: { in: tags } } } } });

    const batch = (await db.event.findMany({
      where: {
        ...publishedEventWhere(),
        deletedAt: null,
        AND: [...andFilters, { OR: [{ venueId: null }, { venue: { deletedAt: null } }] }],
      },
      take: batchSize,
      orderBy: START_AT_ID_ORDER_BY,
      include: {
        venue: { select: { name: true, slug: true, city: true, lat: true, lng: true } },
        images: { take: 1, orderBy: { sortOrder: "asc" }, include: { asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } } },
        eventTags: { include: { tag: { select: { name: true, slug: true } } } },
      },
    })) as NearbyEventWithJoin[];

    if (batch.length < batchSize) dbHasMore = false;
    if (!batch.length) break;

    const lastBatchItem = batch[batch.length - 1];
    workingCursor = { id: lastBatchItem.id, startAt: lastBatchItem.startAt };

    const withinRadius = batch.filter((event) => {
      const sourceLat = event.lat ?? event.venue?.lat;
      const sourceLng = event.lng ?? event.venue?.lng;
      return sourceLat != null && sourceLng != null && isWithinRadiusKm(lat, lng, sourceLat, sourceLng, radiusKm);
    });

    for (const event of withinRadius) {
      if (pageItems.length >= limit) break;
      pageItems.push(event);
    }
  }

  const sortedItems = sort === "distance"
    ? pageItems.slice().sort((a, b) => {
      const aLat = a.lat ?? a.venue?.lat;
      const aLng = a.lng ?? a.venue?.lng;
      const bLat = b.lat ?? b.venue?.lat;
      const bLng = b.lng ?? b.venue?.lng;
      const aDist = aLat != null && aLng != null ? distanceKm(lat, lng, aLat, aLng) : Number.POSITIVE_INFINITY;
      const bDist = bLat != null && bLng != null ? distanceKm(lat, lng, bLat, bLng) : Number.POSITIVE_INFINITY;
      return aDist - bDist || a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id);
    })
    : pageItems;

  const response = NextResponse.json({
    items: sortedItems.map((event) => {
      const imageDisplay = resolveAssetDisplay({
        asset: event.images?.[0]?.asset ?? null,
        requestedVariant: "card",
        legacyUrl: event.images?.[0]?.url ?? null,
      });
      return ({
      ...event,
      venueName: event.venue?.name ?? null,
      mapLat: event.lat ?? event.venue?.lat ?? null,
      mapLng: event.lng ?? event.venue?.lng ?? null,
      distanceKm: (() => {
        const effectiveLat = event.lat ?? event.venue?.lat;
        const effectiveLng = event.lng ?? event.venue?.lng;
        return effectiveLat != null && effectiveLng != null ? Number(distanceKm(lat, lng, effectiveLat, effectiveLng).toFixed(2)) : null;
      })(),
      image: toApiImageField(imageDisplay),
      primaryImageUrl: imageDisplay.url,
      tags: (event.eventTags ?? []).map((eventTag) => ({ name: eventTag.tag.name, slug: eventTag.tag.slug })),
    });
    }),
    nextCursor: dbHasMore && workingCursor ? encodeNearbyCursor(workingCursor) : null,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
