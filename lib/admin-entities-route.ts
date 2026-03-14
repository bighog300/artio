import type { Artist, ContentStatus, Event, Prisma, Venue } from "@prisma/client";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeEventPublishBlockers, computeReadiness, computeVenuePublishBlockers } from "@/lib/publish-readiness";
import { allowedTransitions, validateModerationTransition } from "@/lib/moderation-decision-service";
import { idParamSchema, zodDetails } from "@/lib/validators";

type AdminActor = { id: string; email: string; role: "USER" | "EDITOR" | "ADMIN" };

type EntityName = "venues" | "events" | "artists" | "artwork";

type AdminEntitiesDeps = {
  requireAdminUser: () => Promise<AdminActor>;
  appDb: typeof db;
};

const PAGE_SIZE = 20;

class PublishBlockedError extends Error {
  constructor(public readonly blockers: import("@/lib/publish-readiness").PublishBlocker[]) {
    super("publish_blocked");
  }
}

const listQuerySchema = z.object({
  query: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  showArchived: z.enum(["0", "1"]).optional(),
  onlyArchived: z.enum(["0", "1"]).optional(),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "CHANGES_REQUESTED", "ARCHIVED"]).optional(),
});

const moderationStatuses = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "CHANGES_REQUESTED", "ARCHIVED"] as const;

function buildStatusCounts(rows: Array<{ status: string; _count: { _all: number } }>) {
  const counts = Object.fromEntries(moderationStatuses.map((status) => [status, 0])) as Record<(typeof moderationStatuses)[number], number>;

  for (const row of rows) {
    if (row.status in counts) counts[row.status as keyof typeof counts] = row._count._all;
  }

  return counts;
}

const entityIdSchema = z.object({ id: z.string().uuid() });

const venuePatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  postcode: z.string().trim().max(40).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  lat: z.coerce.number().nullable().optional(),
  lng: z.coerce.number().nullable().optional(),
  timezone: z.string().trim().max(80).nullable().optional(),
  websiteUrl: z.string().trim().url().nullable().optional(),
  eventsPageUrl: z.string().trim().url().nullable().optional(),
  isPublished: z.boolean().optional(),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "CHANGES_REQUESTED", "ARCHIVED"]).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  featuredAssetId: z.string().uuid().nullable().optional(),
}).strict();

const eventPatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).nullable().optional(),
  venueId: z.string().uuid().nullable().optional(),
  ticketUrl: z.string().trim().url().nullable().optional(),
  isPublished: z.boolean().optional(),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "CHANGES_REQUESTED", "ARCHIVED"]).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.startAt && data.endAt && new Date(data.endAt) < new Date(data.startAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "endAt must be >= startAt" });
  }
});

const artistPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  websiteUrl: z.string().trim().url().nullable().optional(),
  bio: z.string().trim().max(5000).nullable().optional(),
  featuredAssetId: z.string().uuid().nullable().optional(),
  isPublished: z.boolean().optional(),
  twitterUrl: z.string().trim().nullable().optional(),
  linkedinUrl: z.string().trim().nullable().optional(),
  tiktokUrl: z.string().trim().nullable().optional(),
  youtubeUrl: z.string().trim().nullable().optional(),
  nationality: z.string().trim().max(100).nullable().optional(),
  birthYear: z.coerce.number().int().min(1850).max(2010).nullable().optional(),
  mediums: z.array(z.string().trim().min(1)).max(20).optional(),
}).strict();

const artworkPatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  isPublished: z.boolean().optional(),
}).strict();

const importPreviewBodySchema = z.object({
  mapping: z.record(z.string(), z.string()).default({}),
  options: z.object({
    createMissing: z.boolean().optional(),
    matchBy: z.enum(["id", "slug", "name"]).optional(),
    dryRun: z.boolean().optional(),
  }).optional(),
  csvText: z.string().optional(),
  fileName: z.string().optional(),
});

const defaultFields = {
  venues: ["id", "name", "slug", "addressLine1", "addressLine2", "city", "postcode", "country", "lat", "lng", "timezone", "websiteUrl", "eventsPageUrl", "isPublished", "status", "description", "featuredAssetId", "deletedAt"] as const,
  events: ["id", "title", "startAt", "endAt", "timezone", "venueId", "ticketUrl", "isPublished", "status", "deletedAt"] as const,
  artists: ["id", "name", "websiteUrl", "bio", "featuredAssetId", "isPublished", "deletedAt"] as const,
  artwork: ["id", "title", "slug", "artistId", "isPublished", "deletedAt", "priceAmount", "currency"] as const,
};

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string) => {
    const out: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    out.push(current);
    return out.map((value) => value.trim());
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function toCsvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  const raw = value instanceof Date ? value.toISOString() : String(value);
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

function getRequestDetails(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : req.headers.get("x-real-ip");
  return { ip: ip || null, userAgent: req.headers.get("user-agent") || null };
}

function getEntitySchema(entity: EntityName) {
  if (entity === "venues") return venuePatchSchema;
  if (entity === "events") return eventPatchSchema;
  if (entity === "artwork") return artworkPatchSchema;
  return artistPatchSchema;
}

function normalizeMappedValue(field: string, value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (field === "isPublished") return trimmed.toLowerCase() === "true";
  return trimmed;
}

async function getCsvTextFromRequest(req: NextRequest): Promise<{ csvText: string; fileName: string | null; mapping: Record<string, string>; options: Record<string, unknown> }> {
  const type = req.headers.get("content-type") || "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const mappingRaw = String(form.get("mapping") ?? "{}");
    const optionsRaw = String(form.get("options") ?? "{}");
    if (!(file instanceof File)) throw new Error("missing_file");
    return {
      csvText: await file.text(),
      fileName: file.name,
      mapping: JSON.parse(mappingRaw) as Record<string, string>,
      options: JSON.parse(optionsRaw) as Record<string, unknown>,
    };
  }

  const parsed = importPreviewBodySchema.safeParse(await req.json());
  if (!parsed.success || !parsed.data.csvText) throw new Error("invalid_body");
  return {
    csvText: parsed.data.csvText,
    fileName: parsed.data.fileName ?? null,
    mapping: parsed.data.mapping,
    options: parsed.data.options ?? {},
  };
}

function rowToMappedObject(headers: string[], row: string[], mapping: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i += 1) {
    const column = headers[i];
    const field = mapping[column];
    if (!field || field === "__ignore") continue;
    out[field] = normalizeMappedValue(field, row[i] ?? "");
  }
  return out;
}

async function findExisting(entity: EntityName, matchBy: "id" | "slug" | "name", mapped: Record<string, unknown>, appDb: typeof db) {
  if (entity === "venues") {
    if (matchBy === "id" && typeof mapped.id === "string") return appDb.venue.findUnique({ where: { id: mapped.id } });
    if (matchBy === "slug" && typeof mapped.slug === "string") return appDb.venue.findUnique({ where: { slug: mapped.slug } });
    return null;
  }
  if (entity === "events") {
    if (matchBy === "id" && typeof mapped.id === "string") return appDb.event.findUnique({ where: { id: mapped.id } });
    return null;
  }
  if (matchBy === "id" && typeof mapped.id === "string") return appDb.artist.findUnique({ where: { id: mapped.id } });
  if (matchBy === "name" && typeof mapped.name === "string") {
    const hits = await appDb.artist.findMany({ where: { name: { equals: mapped.name, mode: "insensitive" } }, take: 2 });
    return hits.length === 1 ? hits[0] : null;
  }
  return null;
}

function getCreateData(entity: EntityName, mapped: Record<string, unknown>) {
  if (entity === "venues") {
    if (!mapped.name || !mapped.slug) return null;
    return venuePatchSchema.extend({ name: z.string().min(1), slug: z.string().min(1) }).safeParse(mapped);
  }
  if (entity === "events") {
    if (!mapped.title || !mapped.slug || !mapped.startAt) return null;
    return z.object({
      title: z.string().min(1),
      slug: z.string().min(1),
      startAt: z.string().datetime({ offset: true }),
      timezone: z.string().default("UTC"),
      endAt: z.string().datetime({ offset: true }).nullable().optional(),
      venueId: z.string().uuid().nullable().optional(),
      ticketUrl: z.string().url().nullable().optional(),
      isPublished: z.boolean().optional(),
    }).safeParse(mapped);
  }
  if (!mapped.name || !mapped.slug) return null;
  return z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    websiteUrl: z.string().url().nullable().optional(),
    bio: z.string().nullable().optional(),
    featuredAssetId: z.string().uuid().nullable().optional(),
    isPublished: z.boolean().optional(),
  }).safeParse(mapped);
}

export async function handleAdminEntityList(req: NextRequest, entity: EntityName, deps: AdminEntitiesDeps) {
  try {
    await deps.requireAdminUser();
    const parsed = listQuerySchema.safeParse({
      query: req.nextUrl.searchParams.get("query") ?? undefined,
      page: req.nextUrl.searchParams.get("page") ?? "1",
      showArchived: req.nextUrl.searchParams.get("showArchived") ?? undefined,
      onlyArchived: req.nextUrl.searchParams.get("onlyArchived") ?? undefined,
      status: req.nextUrl.searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) return apiError(400, "invalid_query", "Invalid query parameters");
    const { page, query = "", showArchived, onlyArchived, status } = parsed.data;
    const deletedFilter = onlyArchived === "1" ? { deletedAt: { not: null as Date | null } } : (showArchived === "1" ? {} : { deletedAt: null });
    const skip = (page - 1) * PAGE_SIZE;

    if (entity === "venues") {
      const where = { ...deletedFilter, ...(status ? { status: status as ContentStatus } : {}), ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { city: { contains: query, mode: "insensitive" as const } }, { slug: { contains: query, mode: "insensitive" as const } }] } : {}) };
      const [total, rows, grouped] = await Promise.all([
        deps.appDb.venue.count({ where }),
        deps.appDb.venue.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: {
            ...Object.fromEntries(defaultFields.venues.map((k) => [k, true])),
            featuredAsset: { select: { url: true } },
          } as never,
        }),
        deps.appDb.venue.groupBy({ by: ["status"], where: deletedFilter, _count: { _all: true } }),
      ]);
      const items = rows.map((venue) => ({
        ...venue,
        thumbnailUrl: (venue as { featuredAsset?: { url?: string | null } | null; featuredImageUrl?: string | null }).featuredAsset?.url
          ?? (venue as { featuredImageUrl?: string | null }).featuredImageUrl
          ?? null,
        publishBlockers: computeReadiness(venue as { country: string | null; lat?: number | null; lng?: number | null; name?: string | null; city?: string | null }).blockers,
      }));
      return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE, statusCounts: buildStatusCounts(grouped) });
    }

    if (entity === "events") {
      const where = { ...deletedFilter, ...(status ? { status: status as ContentStatus } : {}), ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" as const } }, { slug: { contains: query, mode: "insensitive" as const } }] } : {}) };
      const [total, rows, grouped] = await Promise.all([
        deps.appDb.event.count({ where }),
        deps.appDb.event.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: {
            ...Object.fromEntries(defaultFields.events.map((k) => [k, true])),
            venue: { select: { status: true, isPublished: true } },
            images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
          } as never,
        }),
        deps.appDb.event.groupBy({ by: ["status"], where: deletedFilter, _count: { _all: true } }),
      ]);
      const items = rows.map((event) => ({
        ...event,
        thumbnailUrl: (event as { images?: Array<{ url?: string | null }> }).images?.[0]?.url ?? null,
        publishBlockers: computeReadiness({
          startAt: (event as { startAt: Date | null }).startAt,
          timezone: (event as { timezone: string | null }).timezone,
          venue: (event as { venue: { status?: string | null; isPublished?: boolean | null } | null }).venue,
        }).blockers,
      }));
      return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE, statusCounts: buildStatusCounts(grouped) });
    }

    if (entity === "artwork") {
      const where = {
        ...deletedFilter,
        ...(query
          ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { slug: { contains: query, mode: "insensitive" as const } },
              { artist: { name: { contains: query, mode: "insensitive" as const } } },
            ],
          }
          : {}),
      };
      const [total, rows] = await Promise.all([
        deps.appDb.artwork.count({ where }),
        deps.appDb.artwork.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: {
            ...Object.fromEntries(defaultFields.artwork.map((k) => [k, true])),
            updatedAt: true,
            artist: { select: { name: true } },
            images: {
              select: {
                asset: { select: { url: true } },
              },
              orderBy: { sortOrder: "asc" },
              take: 1,
            },
          } as never,
        }),
      ]);
      const items = rows.map((row) => ({
        ...row,
        thumbnailUrl: (row as { images?: Array<{ url?: string | null; asset?: { url?: string | null } | null }> }).images?.[0]?.asset?.url
          ?? (row as { images?: Array<{ url?: string | null }> }).images?.[0]?.url
          ?? null,
      }));
      return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE });
    }

    const where = { ...deletedFilter, ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { slug: { contains: query, mode: "insensitive" as const } }] } : {}) };
    const [total, rows] = await Promise.all([
      deps.appDb.artist.count({ where }),
      deps.appDb.artist.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: {
          ...Object.fromEntries(defaultFields.artists.map((k) => [k, true])),
          featuredAsset: { select: { url: true } },
        } as never,
      }),
    ]);
    const items = rows.map((artist) => ({
      ...artist,
      thumbnailUrl: (artist as { featuredAsset?: { url?: string | null } | null; featuredImageUrl?: string | null }).featuredAsset?.url
        ?? (artist as { featuredImageUrl?: string | null }).featuredImageUrl
        ?? null,
    }));
    return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof Error && (error.message === "unauthorized" || error.name === "AuthError")) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleAdminEntityPatch(req: NextRequest, entity: EntityName, params: { id: string }, deps: AdminEntitiesDeps) {
  try {
    const actor = await deps.requireAdminUser();
    const validateTransitionForActor = (current: string, next: string) => {
      if (actor.role === "ADMIN") return;
      validateModerationTransition(current, next);
    };
    const parsedId = entityIdSchema.safeParse(params);
    if (!parsedId.success) return apiError(400, "invalid_id", "Invalid entity id");

    const schema = getEntitySchema(entity);
    const parsedBody = schema.safeParse(await req.json());
    if (!parsedBody.success) return apiError(400, "invalid_body", "Invalid payload", parsedBody.error.flatten());

    const { ip, userAgent } = getRequestDetails(req);
    const entityId = parsedId.data.id;

    const updated = await deps.appDb.$transaction(async (tx) => {
      if (entity === "venues") {
        const before = await tx.venue.findUnique({ where: { id: entityId } });
        if (!before) throw new Error("not_found");
        const payload = parsedBody.data as z.infer<typeof venuePatchSchema>;
        const { status: payloadStatus, ...payloadWithoutStatus } = payload;
        const patch: Prisma.VenueUpdateInput = { ...payloadWithoutStatus, ...(payloadStatus ? { status: payloadStatus as ContentStatus } : {}) };
        const wantsPublish = payload.status === "PUBLISHED" || payload.isPublished === true;
        if (wantsPublish) {
          validateTransitionForActor(before.status, "PUBLISHED");
        } else if (payload.status) {
          validateTransitionForActor(before.status, payload.status);
        }
        if (wantsPublish) {
          const blockers = computeVenuePublishBlockers(before);
          if (blockers.length > 0) throw new PublishBlockedError(blockers);
          patch.status = "PUBLISHED" as ContentStatus;
          patch.isPublished = true;
        } else if (payload.status === "CHANGES_REQUESTED") {
          patch.status = "CHANGES_REQUESTED" as ContentStatus;
          patch.isPublished = false;
        } else if (payload.isPublished === false) {
          patch.status = (payload.status ?? "PUBLISHED") as ContentStatus;
          patch.isPublished = false;
        }
        const row = await tx.venue.update({ where: { id: entityId }, data: patch });
        await tx.adminAuditLog.create({ data: { actorEmail: actor.email, action: "ADMIN_ENTITY_UPDATED", targetType: "venue", targetId: entityId, metadata: { entityType: "venue", entityId, before, after: payload, actorId: actor.id, actorEmail: actor.email, adminBypass: actor.role === "ADMIN" && !(allowedTransitions[before.status] ?? []).includes(patch.status as string) }, ip, userAgent } });
        return row;
      }
      if (entity === "events") {
        const before = await tx.event.findUnique({ where: { id: entityId } });
        if (!before) throw new Error("not_found");
        const payload = parsedBody.data as z.infer<typeof eventPatchSchema>;
        const { status: payloadStatus, ...payloadWithoutStatus } = payload;
        const patch: Prisma.EventUpdateInput = { ...payloadWithoutStatus, ...(payloadStatus ? { status: payloadStatus as ContentStatus } : {}), ...(payload.startAt ? { startAt: new Date(payload.startAt) } : {}), ...(payload.endAt !== undefined ? { endAt: payload.endAt ? new Date(payload.endAt) : null } : {}) };
        const venue = before.venueId ? await tx.venue.findUnique({ where: { id: before.venueId }, select: { status: true, isPublished: true } }) : null;
        const wantsPublish = payload.status === "PUBLISHED" || payload.isPublished === true;
        if (wantsPublish) {
          validateTransitionForActor(before.status, "PUBLISHED");
        } else if (payload.status) {
          validateTransitionForActor(before.status, payload.status);
        }
        if (wantsPublish) {
          const blockers = computeEventPublishBlockers({ startAt: before.startAt, timezone: before.timezone, venue });
          if (blockers.length > 0) throw new PublishBlockedError(blockers);
          patch.status = "PUBLISHED" as ContentStatus;
          patch.isPublished = true;
          patch.publishedAt = new Date();
        } else if (payload.status === "CHANGES_REQUESTED") {
          patch.status = "CHANGES_REQUESTED" as ContentStatus;
          patch.isPublished = false;
          patch.publishedAt = null;
        } else if (payload.isPublished === false) {
          patch.status = (payload.status ?? "PUBLISHED") as ContentStatus;
          patch.isPublished = false;
          patch.publishedAt = null;
        }
        const row = await tx.event.update({ where: { id: entityId }, data: patch });
        await tx.adminAuditLog.create({ data: { actorEmail: actor.email, action: "ADMIN_ENTITY_UPDATED", targetType: "event", targetId: entityId, metadata: { entityType: "event", entityId, before, after: payload, actorId: actor.id, actorEmail: actor.email, adminBypass: actor.role === "ADMIN" && !(allowedTransitions[before.status] ?? []).includes(patch.status as string) }, ip, userAgent } });
        return row;
      }
      if (entity === "artwork") {
        const before = await tx.artwork.findUnique({ where: { id: entityId } });
        if (!before) throw new Error("not_found");
        const patch = parsedBody.data as z.infer<typeof artworkPatchSchema>;
        const row = await tx.artwork.update({ where: { id: entityId }, data: patch });
        await tx.adminAuditLog.create({ data: { actorEmail: actor.email, action: "ADMIN_ENTITY_UPDATED", targetType: "artwork", targetId: entityId, metadata: { entityType: "artwork", entityId, before, after: patch, actorId: actor.id, actorEmail: actor.email }, ip, userAgent } });
        return row;
      }
      const before = await tx.artist.findUnique({ where: { id: entityId } });
      if (!before) throw new Error("not_found");
      const patch = parsedBody.data as z.infer<typeof artistPatchSchema>;
      const row = await tx.artist.update({ where: { id: entityId }, data: patch });
      await tx.adminAuditLog.create({ data: { actorEmail: actor.email, action: "ADMIN_ENTITY_UPDATED", targetType: "artist", targetId: entityId, metadata: { entityType: "artist", entityId, before, after: patch, actorId: actor.id, actorEmail: actor.email }, ip, userAgent } });
      return row;
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof Error && error.message === "not_found") return apiError(404, "not_found", "Entity not found");
    if (error instanceof PublishBlockedError) {
      return apiError(409, "publish_blocked", "Publishing is blocked", { blockers: error.blockers });
    }
    if (error instanceof Error && "status" in error && "code" in error && (error as { code?: string }).code === "invalid_transition") {
      return apiError(400, "invalid_transition", error.message);
    }
    if (error instanceof Error && (error.message === "unauthorized" || error.name === "AuthError")) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleAdminEntityGet(_req: NextRequest, entity: EntityName, params: { id: string }, deps: AdminEntitiesDeps) {
  try {
    await deps.requireAdminUser();
    const parsedId = idParamSchema.safeParse(params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

    const where = { id: parsedId.data.id };
    const item = entity === "venues"
      ? await deps.appDb.venue.findUnique({ where })
      : entity === "events"
        ? await deps.appDb.event.findUnique({ where })
        : entity === "artists"
          ? await deps.appDb.artist.findUnique({ where })
          : await deps.appDb.artwork.findUnique({ where });

    if (!item) return apiError(404, "not_found", "Entity not found");
    return NextResponse.json({ item });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof Error && (error.message === "unauthorized" || error.name === "AuthError")) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleAdminEntityExport(req: NextRequest, entity: EntityName, deps: AdminEntitiesDeps) {
  const listResponse = await handleAdminEntityList(req, entity, deps);
  if (listResponse.status !== 200) return listResponse;
  const body = await listResponse.json() as { items: Record<string, unknown>[] };
  const fields = defaultFields[entity];
  const lines = [fields.join(",")];
  for (const row of body.items) {
    lines.push(fields.map((field) => toCsvValue(row[field])).join(","));
  }
  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${entity}-export.csv"`,
    },
  });
}

export async function handleAdminEntityImportPreview(req: NextRequest, entity: EntityName, deps: AdminEntitiesDeps) {
  try {
    await deps.requireAdminUser();
    const { csvText, fileName, mapping, options } = await getCsvTextFromRequest(req);
    const parsedBody = importPreviewBodySchema.safeParse({ mapping, options, csvText, fileName });
    if (!parsedBody.success) return apiError(400, "invalid_body", "Invalid import payload", parsedBody.error.flatten());

    const { headers, rows } = parseCsv(parsedBody.data.csvText ?? "");
    const schema = getEntitySchema(entity);
    const matchBy = (parsedBody.data.options?.matchBy as "id" | "slug" | "name" | undefined)
      ?? (entity === "venues" ? "slug" : "id");
    const createMissing = Boolean(parsedBody.data.options?.createMissing);
    const rowResults: Array<Record<string, unknown>> = [];
    let valid = 0;
    let invalid = 0;
    let willUpdate = 0;
    let willCreate = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const mapped = rowToMappedObject(headers, rows[i], parsedBody.data.mapping);
      const parsed = schema.safeParse(mapped);
      if (!parsed.success) {
        invalid += 1;
        rowResults.push({ rowIndex: i + 2, status: "invalid", errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) });
        continue;
      }
      const existing = await findExisting(entity, matchBy, mapped, deps.appDb);
      if (existing) {
        valid += 1;
        willUpdate += 1;
        rowResults.push({ rowIndex: i + 2, status: "update", errors: [], targetId: existing.id, patch: parsed.data });
      } else if (createMissing) {
        const createData = getCreateData(entity, mapped);
        if (!createData || !createData.success) {
          invalid += 1;
          rowResults.push({ rowIndex: i + 2, status: "invalid", errors: ["Missing required fields for create"] });
        } else {
          valid += 1;
          willCreate += 1;
          rowResults.push({ rowIndex: i + 2, status: "create", errors: [], patch: createData.data });
        }
      } else {
        skipped += 1;
        rowResults.push({ rowIndex: i + 2, status: "skipped", errors: ["No match found"] });
      }
    }

    return NextResponse.json({
      headers,
      mappingEcho: parsedBody.data.mapping,
      summary: { total: rows.length, valid, invalid, willUpdate, willCreate, skipped },
      rowResults,
      sampleRows: rows.slice(0, 20),
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof Error && (error.message === "invalid_body" || error.message === "missing_file")) return apiError(400, "invalid_body", "Invalid import payload");
    return apiError(401, "unauthorized", "Authentication required");
  }
}

export async function handleAdminEntityImportApply(req: NextRequest, entity: EntityName, deps: AdminEntitiesDeps) {
  try {
    const actor = await deps.requireAdminUser();
    const { csvText, fileName, mapping, options } = await getCsvTextFromRequest(req);
    const parsedBody = importPreviewBodySchema.safeParse({ mapping, options, csvText, fileName });
    if (!parsedBody.success) return apiError(400, "invalid_body", "Invalid import payload", parsedBody.error.flatten());

    const { headers, rows } = parseCsv(parsedBody.data.csvText ?? "");
    const schema = getEntitySchema(entity);
    const matchBy = (parsedBody.data.options?.matchBy as "id" | "slug" | "name" | undefined)
      ?? (entity === "venues" ? "slug" : "id");
    const createMissing = Boolean(parsedBody.data.options?.createMissing);
    const { ip, userAgent } = getRequestDetails(req);
    const results: Array<Record<string, unknown>> = [];

    for (let i = 0; i < rows.length; i += 1) {
      const mapped = rowToMappedObject(headers, rows[i], parsedBody.data.mapping);
      const parsed = schema.safeParse(mapped);
      if (!parsed.success) {
        results.push({ rowIndex: i + 2, status: "invalid", errors: parsed.error.issues.map((issue) => issue.message) });
        continue;
      }

      const result = await deps.appDb.$transaction(async (tx) => {
        const existing = await findExisting(entity, matchBy, mapped, tx as typeof db);
        if (existing) {
          const payload = parsed.data as Record<string, unknown>;
          const updated = entity === "venues"
            ? await tx.venue.update({ where: { id: existing.id }, data: payload as Prisma.VenueUpdateInput })
            : entity === "events"
              ? await tx.event.update({ where: { id: existing.id }, data: { ...payload, ...(payload.startAt ? { startAt: new Date(payload.startAt as string) } : {}), ...(payload.endAt !== undefined ? { endAt: payload.endAt ? new Date(payload.endAt as string) : null } : {}) } as Prisma.EventUpdateInput })
              : await tx.artist.update({ where: { id: existing.id }, data: payload as Prisma.ArtistUpdateInput });

          await tx.adminAuditLog.create({
            data: {
              actorEmail: actor.email,
              action: "ADMIN_IMPORT_APPLIED",
              targetType: entity.slice(0, -1),
              targetId: existing.id,
              metadata: { entityType: entity.slice(0, -1), entityId: existing.id, patch: parsed.data, actorId: actor.id, actorEmail: actor.email, importSource: parsedBody.data.fileName ?? null, rowIndex: i + 2 },
              ip,
              userAgent,
            },
          });
          return { rowIndex: i + 2, status: "updated", id: updated.id };
        }

        if (!createMissing) return { rowIndex: i + 2, status: "skipped", errors: ["No match found"] };

        const createData = getCreateData(entity, mapped);
        if (!createData || !createData.success) return { rowIndex: i + 2, status: "invalid", errors: ["Missing required fields for create"] };

        let created: Venue | Event | Artist;
        if (entity === "venues") {
          created = await tx.venue.create({ data: createData.data as Prisma.VenueCreateInput });
        } else if (entity === "events") {
          const eventCreateData = createData.data as { startAt: string; endAt?: string | null } & Record<string, unknown>;
          created = await tx.event.create({
            data: {
              ...eventCreateData,
              startAt: new Date(eventCreateData.startAt),
              endAt: eventCreateData.endAt ? new Date(eventCreateData.endAt) : null,
            } as Prisma.EventCreateInput,
          });
        } else {
          created = await tx.artist.create({ data: createData.data as Prisma.ArtistCreateInput });
        }

        await tx.adminAuditLog.create({
          data: {
            actorEmail: actor.email,
            action: "ADMIN_IMPORT_APPLIED",
            targetType: entity.slice(0, -1),
            targetId: created.id,
            metadata: { entityType: entity.slice(0, -1), entityId: created.id, patch: createData.data, actorId: actor.id, actorEmail: actor.email, importSource: parsedBody.data.fileName ?? null, rowIndex: i + 2 },
            ip,
            userAgent,
          },
        });
        return { rowIndex: i + 2, status: "created", id: created.id };
      });

      results.push(result);
    }

    return NextResponse.json({ results });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof Error && (error.message === "invalid_body" || error.message === "missing_file")) return apiError(400, "invalid_body", "Invalid import payload");
    return apiError(401, "unauthorized", "Authentication required");
  }
}

export const ADMIN_ENTITY_FIELDS = defaultFields;

const archiveBodySchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export async function handleAdminEntityArchive(req: NextRequest, entity: EntityName, params: { id: string }, deps: AdminEntitiesDeps) {
  try {
    const actor = await deps.requireAdminUser();
    const parsedId = entityIdSchema.safeParse(params);
    if (!parsedId.success) return apiError(400, "invalid_id", "Invalid entity id");
    const parsedBody = archiveBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) return apiError(400, "invalid_body", "Invalid payload", parsedBody.error.flatten());

    const data = { deletedAt: new Date(), deletedByAdminId: actor.id, deletedReason: parsedBody.data.reason ?? null };
    const where = { id: parsedId.data.id };

    if (entity === "events") {
      const current = await deps.appDb.event.findUnique({ where, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } });
      if (!current) return apiError(404, "not_found", "Entity not found");
      if (current.deletedAt) return NextResponse.json({ item: current });
      return NextResponse.json({ item: await deps.appDb.event.update({ where, data, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } }) });
    }
    if (entity === "venues") {
      const current = await deps.appDb.venue.findUnique({ where, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } });
      if (!current) return apiError(404, "not_found", "Entity not found");
      if (current.deletedAt) return NextResponse.json({ item: current });
      return NextResponse.json({ item: await deps.appDb.venue.update({ where, data, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } }) });
    }
    if (entity === "artists") {
      const current = await deps.appDb.artist.findUnique({ where, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } });
      if (!current) return apiError(404, "not_found", "Entity not found");
      if (current.deletedAt) return NextResponse.json({ item: current });
      return NextResponse.json({ item: await deps.appDb.artist.update({ where, data, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } }) });
    }

    const current = await deps.appDb.artwork.findUnique({ where, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } });
    if (!current) return apiError(404, "not_found", "Entity not found");
    if (current.deletedAt) return NextResponse.json({ item: current });
    return NextResponse.json({ item: await deps.appDb.artwork.update({ where, data, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } }) });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof Error && (error.message === "unauthorized" || error.name === "AuthError")) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleAdminEntityRestore(_req: NextRequest, entity: EntityName, params: { id: string }, deps: AdminEntitiesDeps) {
  try {
    await deps.requireAdminUser();
    const parsedId = entityIdSchema.safeParse(params);
    if (!parsedId.success) return apiError(400, "invalid_id", "Invalid entity id");
    const where = { id: parsedId.data.id };
    const data = { deletedAt: null, deletedByAdminId: null, deletedReason: null };

    if (entity === "events") {
      const current = await deps.appDb.event.findUnique({ where, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } });
      if (!current) return apiError(404, "not_found", "Entity not found");
      if (!current.deletedAt) return NextResponse.json({ item: current });
      return NextResponse.json({ item: await deps.appDb.event.update({ where, data, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } }) });
    }
    if (entity === "venues") {
      const current = await deps.appDb.venue.findUnique({ where, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } });
      if (!current) return apiError(404, "not_found", "Entity not found");
      if (!current.deletedAt) return NextResponse.json({ item: current });
      return NextResponse.json({ item: await deps.appDb.venue.update({ where, data, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } }) });
    }
    if (entity === "artists") {
      const current = await deps.appDb.artist.findUnique({ where, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } });
      if (!current) return apiError(404, "not_found", "Entity not found");
      if (!current.deletedAt) return NextResponse.json({ item: current });
      return NextResponse.json({ item: await deps.appDb.artist.update({ where, data, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } }) });
    }

    const current = await deps.appDb.artwork.findUnique({ where, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } });
    if (!current) return apiError(404, "not_found", "Entity not found");
    if (!current.deletedAt) return NextResponse.json({ item: current });
    return NextResponse.json({ item: await deps.appDb.artwork.update({ where, data, select: { id: true, deletedAt: true, deletedByAdminId: true, deletedReason: true } }) });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof Error && (error.message === "unauthorized" || error.name === "AuthError")) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
