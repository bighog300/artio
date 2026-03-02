import { Prisma } from "@prisma/client";
import { z } from "zod";

const paginationParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

const daysLimitParamsSchema = z.object({
  days: z.coerce.number().int().min(1).max(180).default(30),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const adminSubmissionsParamsSchema = z.object({
  status: z.enum(["IN_REVIEW", "APPROVED", "REJECTED"]).default("IN_REVIEW"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

const followCountsParamsSchema = z.object({
  targetType: z.enum(["ARTIST", "VENUE"]).default("ARTIST"),
  targetId: z.string().uuid(),
});

const eventFiltersParamsSchema = z.object({
  fromDays: z.coerce.number().int().min(0).max(365).default(0),
  toDays: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  query: z.string().trim().min(1).max(120).default("jazz"),
  tags: z.array(z.string().trim().min(1)).max(5).default(["music", "art"]),
  minLat: z.coerce.number().min(-90).max(90).default(40.5),
  maxLat: z.coerce.number().min(-90).max(90).default(41.0),
  minLng: z.coerce.number().min(-180).max(180).default(-74.3),
  maxLng: z.coerce.number().min(-180).max(180).default(-73.7),
});

export const explainQueryNames = [
  "events_list",
  "events_query",
  "events_tags",
  "events_date_range",
  "events_geo_bbox",
  "trending_groupby",
  "trending_event_lookup",
  "recommendations_seed",
  "venue_upcoming",
  "artist_upcoming",
  "artist_past",
  "admin_submissions",
  "follow_counts",
] as const;
export type ExplainQueryName = (typeof explainQueryNames)[number];

export type ExplainBuildResult = { query: Prisma.Sql; sanitizedParams: Record<string, unknown> };

type ExplainBuilder = (inputParams: unknown) => ExplainBuildResult;

export const explainQueryBuilders: Record<ExplainQueryName, ExplainBuilder> = {
  events_list: (inputParams) => {
    const parsed = paginationParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT e.id
FROM "Event" e
WHERE e."isPublished" = true
ORDER BY e."startAt" ASC, e.id ASC
LIMIT ${parsed.limit}`,
      sanitizedParams: parsed,
    };
  },
  events_query: (inputParams) => {
    const parsed = eventFiltersParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT e.id
FROM "Event" e
WHERE e."isPublished" = true
  AND (e.title ILIKE ('%' || ${parsed.query} || '%') OR e.description ILIKE ('%' || ${parsed.query} || '%'))
ORDER BY e."startAt" ASC, e.id ASC
LIMIT ${parsed.limit}`,
      sanitizedParams: { queryLength: parsed.query.length, limit: parsed.limit },
    };
  },
  events_tags: (inputParams) => {
    const parsed = eventFiltersParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT e.id
FROM "Event" e
WHERE e."isPublished" = true
  AND EXISTS (
    SELECT 1
    FROM "EventTag" et
    INNER JOIN "Tag" t ON t.id = et."tagId"
    WHERE et."eventId" = e.id
      AND t.slug = ANY(${parsed.tags}::text[])
  )
ORDER BY e."startAt" ASC, e.id ASC
LIMIT ${parsed.limit}`,
      sanitizedParams: { tagCount: parsed.tags.length, limit: parsed.limit },
    };
  },
  events_date_range: (inputParams) => {
    const parsed = eventFiltersParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT e.id
FROM "Event" e
WHERE e."isPublished" = true
  AND e."startAt" >= NOW() + (${parsed.fromDays}::int * INTERVAL '1 day')
  AND e."startAt" <= NOW() + (${parsed.toDays}::int * INTERVAL '1 day')
ORDER BY e."startAt" ASC, e.id ASC
LIMIT ${parsed.limit}`,
      sanitizedParams: { fromDays: parsed.fromDays, toDays: parsed.toDays, limit: parsed.limit },
    };
  },
  events_geo_bbox: (inputParams) => {
    const parsed = eventFiltersParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT e.id
FROM "Event" e
LEFT JOIN "Venue" v ON v.id = e."venueId"
WHERE e."isPublished" = true
  AND (
    (e.lat BETWEEN ${parsed.minLat} AND ${parsed.maxLat} AND e.lng BETWEEN ${parsed.minLng} AND ${parsed.maxLng})
    OR
    (v.lat BETWEEN ${parsed.minLat} AND ${parsed.maxLat} AND v.lng BETWEEN ${parsed.minLng} AND ${parsed.maxLng})
  )
ORDER BY e."startAt" ASC, e.id ASC
LIMIT ${parsed.limit}`,
      sanitizedParams: { limit: parsed.limit },
    };
  },
  trending_groupby: (inputParams) => {
    const parsed = daysLimitParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT f."targetId", COUNT(*)::int AS count
FROM "Favorite" f
WHERE f."targetType" = 'EVENT'
  AND f."createdAt" >= NOW() - (${parsed.days}::int * INTERVAL '1 day')
GROUP BY f."targetId"
ORDER BY count DESC
LIMIT ${parsed.limit}`,
      sanitizedParams: parsed,
    };
  },
  trending_event_lookup: (inputParams) => {
    const parsed = daysLimitParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT e.id
FROM "Event" e
WHERE e."isPublished" = true
  AND e."startAt" >= NOW()
ORDER BY e."startAt" ASC, e.id ASC
LIMIT ${parsed.limit}`,
      sanitizedParams: { limit: parsed.limit },
    };
  },
  recommendations_seed: (inputParams) => {
    const parsed = paginationParamsSchema.parse(inputParams ?? {});
    const maxLimit = Math.max(parsed.limit, 30);
    const venueIds = ["00000000-0000-0000-0000-000000000001"];
    const artistIds = ["00000000-0000-0000-0000-000000000002"];

    return {
      query: Prisma.sql`SELECT e.id
FROM "Event" e
WHERE e."isPublished" = true
  AND e."startAt" >= NOW()
  AND (
    e."venueId" = ANY(${venueIds}::uuid[])
    OR EXISTS (
      SELECT 1
      FROM "EventArtist" ea
      WHERE ea."eventId" = e.id
        AND ea."artistId" = ANY(${artistIds}::uuid[])
    )
  )
ORDER BY e."startAt" ASC
LIMIT ${maxLimit}`,
      sanitizedParams: { venueIds: 1, artistIds: 1, limit: maxLimit },
    };
  },
  venue_upcoming: (inputParams) => {
    const parsed = paginationParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT e.id
FROM "Event" e
WHERE e."venueId" = ${"00000000-0000-0000-0000-000000000010"}::uuid
  AND e."isPublished" = true
  AND e."startAt" >= NOW()
ORDER BY e."startAt" ASC, e.id ASC
LIMIT ${parsed.limit}`,
      sanitizedParams: { limit: parsed.limit },
    };
  },
  artist_upcoming: (inputParams) => {
    const parsed = paginationParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT ea."eventId"
FROM "EventArtist" ea
INNER JOIN "Event" e ON e.id = ea."eventId"
WHERE ea."artistId" = ${"00000000-0000-0000-0000-000000000011"}::uuid
  AND e."isPublished" = true
  AND e."startAt" >= NOW()
ORDER BY e."startAt" ASC
LIMIT ${parsed.limit}`,
      sanitizedParams: { limit: parsed.limit },
    };
  },
  artist_past: (inputParams) => {
    const parsed = paginationParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT ea."eventId"
FROM "EventArtist" ea
INNER JOIN "Event" e ON e.id = ea."eventId"
WHERE ea."artistId" = ${"00000000-0000-0000-0000-000000000011"}::uuid
  AND e."isPublished" = true
  AND e."startAt" < NOW()
ORDER BY e."startAt" DESC
LIMIT ${parsed.limit}`,
      sanitizedParams: { limit: parsed.limit },
    };
  },
  admin_submissions: (inputParams) => {
    const parsed = adminSubmissionsParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT s.id
FROM "Submission" s
WHERE s.status = ${parsed.status}
  AND (${parsed.cursor ?? null}::uuid IS NULL OR s.id > ${parsed.cursor ?? null}::uuid)
ORDER BY s."submittedAt" ASC, s.id ASC
LIMIT ${parsed.limit}`,
      sanitizedParams: parsed,
    };
  },
  follow_counts: (inputParams) => {
    const parsed = followCountsParamsSchema.parse(inputParams ?? {});
    return {
      query: Prisma.sql`SELECT COUNT(*)::int AS count
FROM "Follow" f
WHERE f."targetType" = ${parsed.targetType}
  AND f."targetId" = ${parsed.targetId}`,
      sanitizedParams: parsed,
    };
  },
};

export function buildExplainTarget(name: ExplainQueryName, inputParams: unknown): ExplainBuildResult {
  return explainQueryBuilders[name](inputParams);
}
