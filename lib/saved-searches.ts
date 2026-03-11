import { Prisma, SavedSearchType } from "@prisma/client";
import { z } from "zod";
import { START_AT_ID_ORDER_BY, buildStartAtIdCursorPredicate, type StartAtIdCursor } from "@/lib/cursor-predicate";
import { getBoundingBox, isWithinRadiusKm } from "@/lib/geo";
import { buildNearbyEventsFilters } from "@/lib/nearby-events";

const nearbyParamsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().int().default(25).transform((value) => Math.max(1, Math.min(200, value))),
  q: z.string().trim().min(1).max(100).optional(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
  from: z.iso.datetime({ offset: true }).or(z.iso.datetime({ local: true })).optional(),
  to: z.iso.datetime({ offset: true }).or(z.iso.datetime({ local: true })).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
  sort: z.enum(["soonest", "distance"]).optional().default("soonest"),
  view: z.enum(["list", "map"]).optional(),
}).superRefine((data, ctx) => {
  if (data.days != null && (data.from != null || data.to != null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Provide either days or from/to, not both" });
  }
});

const eventsFilterParamsSchema = z.object({
  q: z.string().trim().min(1).optional().transform((value) => value ? value.slice(0, 120) : value),
  from: z.iso.datetime({ offset: true }).or(z.iso.datetime({ local: true })).optional(),
  to: z.iso.datetime({ offset: true }).or(z.iso.datetime({ local: true })).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
  venue: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  artist: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().int().optional().transform((value) => value == null ? value : Math.max(1, Math.min(200, value))),
}).superRefine((data, ctx) => {
  const hasLat = data.lat != null;
  const hasLng = data.lng != null;
  const hasRadius = data.radiusKm != null;
  if (hasLat !== hasLng) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [hasLat ? "lng" : "lat"], message: "lat and lng must be provided together" });
  }
  if ((hasLat || hasLng) && !hasRadius) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["radiusKm"], message: "radiusKm is required when lat/lng are provided" });
  }
});


const artworkParamsSchema = z.object({
  provider: z.literal("ARTWORKS").optional(),
  query: z.string().trim().min(1).max(120).optional(),
  artistId: z.string().uuid().optional().nullable(),
  venueId: z.string().uuid().optional().nullable(),
  eventId: z.string().uuid().optional().nullable(),
  medium: z.array(z.string().trim().min(1).max(120)).optional().default([]),
  mediumCsv: z.string().optional().nullable(),
  yearFrom: z.coerce.number().int().min(1000).max(3000).optional().nullable(),
  yearTo: z.coerce.number().int().min(1000).max(3000).optional().nullable(),
  priceMin: z.coerce.number().int().min(0).optional().nullable(),
  priceMax: z.coerce.number().int().min(0).optional().nullable(),
  currency: z.string().trim().min(3).max(3).optional().nullable(),
  hasPrice: z.coerce.boolean().optional().default(false),
  hasImages: z.coerce.boolean().optional().default(false),
  sort: z.enum(["RECENT", "OLDEST", "YEAR_DESC", "YEAR_ASC", "PRICE_ASC", "PRICE_DESC", "VIEWS_30D_DESC"]).optional().default("RECENT"),
});
export const savedSearchParamsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NEARBY"), params: nearbyParamsSchema }),
  z.object({ type: z.literal("EVENTS_FILTER"), params: eventsFilterParamsSchema }),
  z.object({ type: z.literal("ARTWORK"), params: artworkParamsSchema }),
]);

export const savedSearchCreateSchema = z.object({
  type: z.enum(["NEARBY", "EVENTS_FILTER", "ARTWORK"]),
  name: z.string().trim().min(1).max(80),
  params: z.unknown(),
  frequency: z.enum(["WEEKLY"]).optional(),
});

export const savedSearchPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  params: z.unknown().optional(),
  frequency: z.enum(["WEEKLY"]).optional(),
  isEnabled: z.boolean().optional(),
});

function normalizeNearby(rawParams: unknown) {
  const parsed = nearbyParamsSchema.parse(rawParams);
  return { lat: parsed.lat, lng: parsed.lng, radiusKm: parsed.radiusKm, q: parsed.q ?? null, days: parsed.days ?? 30, from: parsed.from ?? null, to: parsed.to ?? null, tags: parsed.tags, sort: parsed.sort, view: parsed.view ?? null };
}

function normalizeEventsFilter(rawParams: unknown) {
  const parsed = eventsFilterParamsSchema.parse(rawParams);
  return {
    q: parsed.q ?? null,
    from: parsed.from ?? null,
    to: parsed.to ?? null,
    tags: parsed.tags,
    venue: parsed.venue ?? null,
    artist: parsed.artist ?? null,
    lat: parsed.lat ?? null,
    lng: parsed.lng ?? null,
    radiusKm: parsed.radiusKm ?? null,
  };
}

export function normalizeSavedSearchParams(type: SavedSearchType, rawParams: unknown) {
  if (type === "NEARBY") return normalizeNearby(rawParams);
  if (type === "EVENTS_FILTER") return normalizeEventsFilter(rawParams);
  const parsed = artworkParamsSchema.parse(rawParams);
  return { ...parsed, provider: "ARTWORKS", medium: parsed.medium ?? [] };
}

type EventSearchDb = { event: { findMany: (args: Prisma.EventFindManyArgs) => Promise<Array<{ id: string; title: string; slug: string; startAt: Date; lat: number | null; lng: number | null; venueId: string | null; venue: { name: string; slug: string; city: string | null; lat: number | null; lng: number | null } | null; eventTags: Array<{ tag: { name: string; slug: string } }>; eventArtists: Array<{ artistId: string }> }>> } };

export async function runSavedSearchEvents(args: {
  eventDb: EventSearchDb;
  type: SavedSearchType;
  paramsJson: Prisma.JsonValue;
  cursor?: StartAtIdCursor | null;
  limit: number;
  hiddenEventIds?: string[];
}) {
  const { eventDb, type, paramsJson, cursor, limit, hiddenEventIds } = args;
  const hiddenIds = hiddenEventIds?.filter((id) => id.length > 0) ?? [];
  if (type === "ARTWORK") return [];
  if (type === "NEARBY") {
    const params = normalizeNearby(paramsJson);
    const now = new Date();
    const fromDate = params.from ? new Date(params.from) : now;
    const toDate = params.to ? new Date(params.to) : (() => {
      const next = new Date(fromDate);
      next.setDate(next.getDate() + params.days);
      return next;
    })();
    const box = getBoundingBox(params.lat, params.lng, params.radiusKm);
    const nearbyFilters = buildNearbyEventsFilters({ cursor, from: fromDate, to: toDate, hiddenEventIds: hiddenIds });
    const items = await eventDb.event.findMany({
      where: {
        isPublished: true,
        startAt: nearbyFilters.startAt,
        AND: [{ OR: [
          { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
          { venue: { is: { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } } } },
        ] }, ...(params.q ? [{ OR: [{ title: { contains: params.q, mode: "insensitive" as const } }, { venue: { name: { contains: params.q, mode: "insensitive" as const } } }] }] : []), ...nearbyFilters.cursorFilters, ...nearbyFilters.hiddenFilters],
      },
      take: limit + 1,
      orderBy: START_AT_ID_ORDER_BY,
      include: { venue: { select: { name: true, slug: true, city: true, lat: true, lng: true } }, eventTags: { include: { tag: { select: { name: true, slug: true } } } }, eventArtists: { select: { artistId: true } } },
    });
    const tagSet = new Set(params.tags);
    return items.filter((e) => {
      const sourceLat = e.lat ?? e.venue?.lat;
      const sourceLng = e.lng ?? e.venue?.lng;
      if (sourceLat == null || sourceLng == null) return false;
      const withinRadius = isWithinRadiusKm(params.lat, params.lng, sourceLat, sourceLng, params.radiusKm);
      if (!withinRadius) return false;
      return !tagSet.size || e.eventTags.some((et) => tagSet.has(et.tag.slug));
    });
  }

  const params = normalizeEventsFilter(paramsJson);
  const filters: Prisma.EventWhereInput[] = [];
  if (params.q) filters.push({ OR: [{ title: { contains: params.q, mode: "insensitive" as const } }, { description: { contains: params.q, mode: "insensitive" as const } }] });
  if (params.from || params.to) filters.push({ startAt: { gte: params.from ? new Date(params.from) : undefined, lte: params.to ? new Date(params.to) : undefined } });
  if (params.venue) filters.push({ venue: { slug: params.venue } });
  if (params.artist) filters.push({ eventArtists: { some: { artist: { slug: params.artist, isPublished: true } } } });
  if (params.tags.length) filters.push({ eventTags: { some: { tag: { slug: { in: params.tags } } } } });
  if (hiddenIds.length) filters.push({ id: { notIn: hiddenIds } });
  if (params.lat != null && params.lng != null && params.radiusKm != null) {
    const box = getBoundingBox(params.lat, params.lng, params.radiusKm);
    filters.push({ OR: [
      { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
      { venue: { is: { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } } } },
    ] });
  }
  filters.push(...buildStartAtIdCursorPredicate(cursor));
  const items = await eventDb.event.findMany({
    where: { isPublished: true, ...(filters.length ? { AND: filters } : {}) },
    take: limit + 1,
    orderBy: START_AT_ID_ORDER_BY,
    include: { venue: { select: { name: true, slug: true, city: true, lat: true, lng: true } }, eventTags: { include: { tag: { select: { name: true, slug: true } } } }, eventArtists: { select: { artistId: true } } },
  });
  if (params.lat == null || params.lng == null || params.radiusKm == null) return items;
  const lat = params.lat;
  const lng = params.lng;
  const radiusKm = params.radiusKm;
  return items.filter((e) => {
    const sourceLat = e.lat ?? e.venue?.lat;
    const sourceLng = e.lng ?? e.venue?.lng;
    return sourceLat != null && sourceLng != null && isWithinRadiusKm(lat, lng, sourceLat, sourceLng, radiusKm);
  });
}

export async function previewSavedSearch(args: {
  eventDb: EventSearchDb;
  body: unknown;
}) {
  const parsed = savedSearchParamsSchema.parse(args.body);
  const items = await runSavedSearchEvents({
    eventDb: args.eventDb,
    type: parsed.type,
    paramsJson: parsed.params,
    limit: 10,
  });
  return { items: items.slice(0, 10) };
}
