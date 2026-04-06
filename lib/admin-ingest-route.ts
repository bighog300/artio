import { NextResponse, type NextRequest } from "next/server";
import type { IngestStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { logAdminAction } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { slugifyEventTitle, ensureUniqueEventSlugWithDeps } from "@/lib/event-slug";
import { runVenueIngestExtraction } from "@/lib/ingest/extraction-pipeline";
import { importApprovedEventImage } from "@/lib/ingest/import-approved-event-image";
import { getRequestId } from "@/lib/request-id";
import { parseBody, zodDetails } from "@/lib/validators";
import { inferTimezoneFromLatLng } from "@/lib/timezone";
import { getAdminIngestHealthData } from "@/lib/ingest/health-query";
import { discoverArtist } from "@/lib/ingest/artist-discovery";
import { extractArtworksForEvent } from "@/lib/ingest/artwork-extraction";
import { autoTagEvent } from "@/lib/ingest/auto-tag-event";
import { enqueueGalleryIngestionForVenue } from "@/lib/ingestion/bootstrap";

type AdminActor = { id: string; email: string; role: "USER" | "EDITOR" | "ADMIN" };

type AdminIngestDeps = {
  requireEditorUser: () => Promise<AdminActor>;
  appDb: typeof db;
  runExtraction: typeof runVenueIngestExtraction;
  logAction: typeof logAdminAction;
  importEventImage: typeof importApprovedEventImage;
};

const defaultDeps: AdminIngestDeps = {
  requireEditorUser: async () => {
    throw new Error("not_implemented");
  },
  appDb: db,
  runExtraction: runVenueIngestExtraction,
  logAction: logAdminAction,
  importEventImage: importApprovedEventImage,
};

const MAX_WARNING_DETAIL = 1_000;

function appendWarningDetail(existing: string | null | undefined, warning: string): string {
  const combined = existing && existing.trim().length > 0 ? `${existing}\n${warning}` : warning;
  return combined.length > MAX_WARNING_DETAIL ? `${combined.slice(0, MAX_WARNING_DETAIL - 1)}…` : combined;
}

const runParamsSchema = z.object({ venueId: z.string().uuid() });
const runBodySchema = z.object({
  sourceUrl: z.string().trim().url().optional(),
  model: z.string().trim().min(1).max(120).optional(),
  force: z.boolean().optional(),
});

const runsQuerySchema = z.object({
  venueId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]).optional(),
  cursor: z.string().uuid().optional(),
  take: z.coerce.number().int().min(1).max(100).default(20),
});

const runIdSchema = z.object({ runId: z.string().uuid() });
const candidateIdSchema = z.object({ id: z.string().uuid() });
const rejectBodySchema = z.object({ rejectionReason: z.string().trim().min(1).max(500) });
const approveBodySchema = z.object({
  publishImmediately: z.boolean().optional().default(false),
});
const eventApprovePatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  timezone: z.string().trim().min(1).max(100).nullable().optional(),
  locationText: z.string().trim().max(300).nullable().optional(),
}).strict();

export async function getAdminIngestRunDetail(appDb: typeof db, runId: string) {
  const run = await appDb.ingestRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      sourceUrl: true,
      fetchStatus: true,
      fetchFinalUrl: true,
      fetchContentType: true,
      fetchBytes: true,
      errorCode: true,
      errorMessage: true,
      errorDetail: true,
      model: true,
      usagePromptTokens: true,
      usageCompletionTokens: true,
      usageTotalTokens: true,
      stopReason: true,
      venueSnapshot: true,
      startedAt: true,
      finishedAt: true,
      venue: { select: { id: true, name: true } },
      extractedEvents: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          status: true,
          title: true,
          artistNames: true,
          imageUrl: true,
          blobImageUrl: true,
          startAt: true,
          endAt: true,
          locationText: true,
          sourceUrl: true,
          fingerprint: true,
          similarityKey: true,
          clusterKey: true,
          duplicateOfId: true,
          similarityScore: true,
          confidenceScore: true,
          confidenceBand: true,
          confidenceReasons: true,
          rejectionReason: true,
          createdEventId: true,
        },
      },
    },
  });

  if (!run) return null;

  const counts = run.extractedEvents.reduce((acc, candidate) => {
    acc.total += 1;
    if (candidate.status === "PENDING") acc.pending += 1;
    if (candidate.status === "APPROVED") acc.approved += 1;
    if (candidate.status === "REJECTED") acc.rejected += 1;
    if (candidate.status === "DUPLICATE") acc.duplicates += 1;
    if (candidate.status !== "DUPLICATE") acc.primaries += 1;
    return acc;
  }, { total: 0, pending: 0, approved: 0, rejected: 0, duplicates: 0, primaries: 0 });

  return { run, counts };
}

export async function handleAdminIngestRun(req: NextRequest, params: { venueId?: string }, deps: Partial<AdminIngestDeps> = {}) {
  const resolved = { ...defaultDeps, ...deps };
  const requestId = getRequestId(req.headers);

  try {
    const actor = await resolved.requireEditorUser();
    const parsedParams = runParamsSchema.safeParse(params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error), requestId);

    const parsedBody = runBodySchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error), requestId);

    const venue = await resolved.appDb.venue.findUnique({
      where: { id: parsedParams.data.venueId },
      select: { id: true, websiteUrl: true, name: true },
    });
    if (!venue) return apiError(404, "not_found", "Venue not found", undefined, requestId);

    const sourceUrl = parsedBody.data.sourceUrl ?? venue.websiteUrl ?? null;
    if (!sourceUrl) {
      return apiError(400, "invalid_request", "A sourceUrl is required when the venue has no websiteUrl", undefined, requestId);
    }

    const result = await resolved.runExtraction({ venueId: venue.id, sourceUrl, model: parsedBody.data.model });

    await enqueueGalleryIngestionForVenue(venue.id, sourceUrl).catch(() => undefined);

    await resolved.logAction({
      actorEmail: actor.email,
      action: "ADMIN_INGEST_RUN_TRIGGERED",
      targetType: "ingest_run",
      targetId: result.runId,
      metadata: { venueId: venue.id, sourceUrl, model: parsedBody.data.model ?? null } satisfies Prisma.InputJsonValue,
      req,
    });

    return NextResponse.json({ runId: result.runId, createdCount: result.createdCount, dedupedCount: result.dedupedCount, createdDuplicateCount: result.createdDuplicateCount, stopReason: result.stopReason }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required", undefined, requestId);
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Editor role required", undefined, requestId);
    console.error("handleAdminIngestRun_unexpected_error", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}

export async function handleAdminIngestRunsList(req: NextRequest, deps: Partial<AdminIngestDeps> = {}) {
  const resolved = { ...defaultDeps, ...deps };
  const requestId = getRequestId(req.headers);

  try {
    await resolved.requireEditorUser();
    const parsedQuery = runsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsedQuery.success) return apiError(400, "invalid_request", "Invalid query params", zodDetails(parsedQuery.error), requestId);

    const { venueId, status, take, cursor } = parsedQuery.data;
    const where: Prisma.IngestRunWhereInput = {
      ...(venueId ? { venueId } : {}),
      ...(status ? { status: status as IngestStatus } : {}),
    };

    const rows = await resolved.appDb.ingestRun.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        status: true,
        sourceUrl: true,
        fetchStatus: true,
        errorCode: true,
        createdCandidates: true,
        venue: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const runs = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? runs[runs.length - 1]?.id ?? null : null;

    return NextResponse.json({ ok: true, runs, nextCursor }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required", undefined, requestId);
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Editor role required", undefined, requestId);
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}

export async function handleAdminIngestRunGet(req: NextRequest, params: { runId?: string }, deps: Partial<AdminIngestDeps> = {}) {
  const resolved = { ...defaultDeps, ...deps };
  const requestId = getRequestId(req.headers);

  try {
    await resolved.requireEditorUser();
    const parsedParams = runIdSchema.safeParse(params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error), requestId);

    const detail = await getAdminIngestRunDetail(resolved.appDb, parsedParams.data.runId);
    if (!detail) return apiError(404, "not_found", "Ingest run not found", undefined, requestId);

    return NextResponse.json({ ok: true, run: detail.run, counts: detail.counts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required", undefined, requestId);
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Editor role required", undefined, requestId);
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}



export async function handleAdminIngestHealth(req: NextRequest, deps: Partial<AdminIngestDeps> = {}) {
  const resolved = { ...defaultDeps, ...deps };
  const requestId = getRequestId(req.headers);

  try {
    await resolved.requireEditorUser();

    const healthData = await getAdminIngestHealthData(resolved.appDb);

    return NextResponse.json(healthData, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required", undefined, requestId);
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Editor role required", undefined, requestId);
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}
export async function handleAdminIngestReject(req: NextRequest, params: { id?: string }, deps: Partial<AdminIngestDeps> = {}) {
  const resolved = { ...defaultDeps, ...deps };
  const requestId = getRequestId(req.headers);

  try {
    const actor = await resolved.requireEditorUser();
    const parsedParams = candidateIdSchema.safeParse(params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error), requestId);
    const parsedBody = rejectBodySchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error), requestId);

    const candidate = await resolved.appDb.ingestExtractedEvent.update({
      where: { id: parsedParams.data.id },
      data: {
        status: "REJECTED",
        rejectionReason: parsedBody.data.rejectionReason,
      },
      select: { id: true, runId: true, venueId: true, status: true, rejectionReason: true },
    });

    await resolved.logAction({
      actorEmail: actor.email,
      action: "ADMIN_INGEST_CANDIDATE_REJECTED",
      targetType: "ingest_extracted_event",
      targetId: candidate.id,
      metadata: { runId: candidate.runId, venueId: candidate.venueId, rejectionReason: candidate.rejectionReason } satisfies Prisma.InputJsonValue,
      req,
    });

    return NextResponse.json({ ok: true, candidate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required", undefined, requestId);
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Editor role required", undefined, requestId);
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}

export async function handleAdminIngestRestore(req: NextRequest, params: { id?: string }, deps: Partial<AdminIngestDeps> = {}) {
  const resolved = { ...defaultDeps, ...deps };
  const requestId = getRequestId(req.headers);

  try {
    const actor = await resolved.requireEditorUser();
    const parsedParams = candidateIdSchema.safeParse(params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error), requestId);

    const candidate = await resolved.appDb.ingestExtractedEvent.update({
      where: { id: parsedParams.data.id },
      data: {
        status: "PENDING",
        rejectionReason: null,
      },
      select: { id: true, runId: true, venueId: true, status: true, rejectionReason: true },
    });

    await resolved.logAction({
      actorEmail: actor.email,
      action: "ADMIN_INGEST_CANDIDATE_RESTORED",
      targetType: "ingest_extracted_event",
      targetId: candidate.id,
      metadata: { runId: candidate.runId, venueId: candidate.venueId } satisfies Prisma.InputJsonValue,
      req,
    });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required", undefined, requestId);
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required", undefined, requestId);
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}

export async function handleAdminIngestApprove(req: NextRequest, params: { id?: string }, deps: Partial<AdminIngestDeps> = {}) {
  const resolved = { ...defaultDeps, ...deps };
  const requestId = getRequestId(req.headers);

  try {
    const actor = await resolved.requireEditorUser();
    const parsedParams = candidateIdSchema.safeParse(params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error), requestId);
    const rawBody = await parseBody(req).catch(() => ({}));
    const parsedApproveBody = approveBodySchema.safeParse(rawBody);
    const publishImmediately = parsedApproveBody.success ? parsedApproveBody.data.publishImmediately : false;
    const patchBody =
      rawBody && typeof rawBody === "object"
        ? { ...(rawBody as Record<string, unknown>) }
        : {};
    delete (patchBody as { publishImmediately?: unknown }).publishImmediately;
    const parsedPatch = eventApprovePatchSchema.safeParse(patchBody);
    const patch = parsedPatch.success ? parsedPatch.data : {};

    if (publishImmediately && actor.role !== "ADMIN") {
      return apiError(403, "forbidden", "Approve & Publish requires ADMIN role", undefined, requestId);
    }

    const approved = await resolved.appDb.$transaction(async (tx) => {
      const candidate = await tx.ingestExtractedEvent.findUnique({
        where: { id: parsedParams.data.id },
        select: {
          id: true,
          runId: true,
          venueId: true,
          sourceUrl: true,
          title: true,
          description: true,
          startAt: true,
          endAt: true,
          timezone: true,
          locationText: true,
          imageUrl: true,
          createdEventId: true,
          artistNames: true,
          run: { select: { id: true, venueId: true, sourceUrl: true, errorDetail: true } },
          venue: { select: { id: true, timezone: true, lat: true, lng: true, websiteUrl: true } },
        },
      });
      if (!candidate) return { error: apiError(404, "not_found", "Extracted event not found", undefined, requestId) };

      if (candidate.createdEventId) {
        const updated = await tx.ingestExtractedEvent.update({
          where: { id: candidate.id },
          data: { status: "APPROVED", rejectionReason: null },
          select: { id: true, createdEventId: true, runId: true, venueId: true },
        });
        return {
          candidate: updated,
          createdEventId: updated.createdEventId as string,
          unmatchedNames: [] as string[],
          artistSettings: null as {
            googlePseApiKey: string | undefined;
            googlePseCx: string | undefined;
            artistLookupProvider: string | null | undefined;
            artistBioProvider: string | null | undefined;
            geminiApiKey: string | null | undefined;
            anthropicApiKey: string | null | undefined;
            openAiApiKey: string | null | undefined;
          } | null,
          artworkSettings: null as {
            artworkExtractionProvider: string | null | undefined;
            anthropicApiKey: string | null | undefined;
            geminiApiKey: string | null | undefined;
            openAiApiKey: string | null | undefined;
          } | null,
          sourceUrl: candidate.sourceUrl,
          published: publishImmediately,
          imageContext: {
            runId: candidate.runId,
            venueId: candidate.venueId,
            sourceUrl: candidate.sourceUrl,
            venueWebsiteUrl: candidate.venue.websiteUrl,
            candidateImageUrl: candidate.imageUrl,
            title: candidate.title,
            runErrorDetail: candidate.run.errorDetail,
          },
        };
      }

      let resolvedTimezone = candidate.timezone ?? candidate.venue.timezone;
      if (!resolvedTimezone && candidate.venue.lat != null && candidate.venue.lng != null) {
        resolvedTimezone = inferTimezoneFromLatLng(candidate.venue.lat, candidate.venue.lng);
        await tx.venue.update({ where: { id: candidate.venue.id }, data: { timezone: resolvedTimezone } });
      }

      const missingSchedulingFields = [
        ...(!candidate.startAt ? ["startAt"] : []),
        ...(!resolvedTimezone ? ["timezone"] : []),
      ];
      if (missingSchedulingFields.length > 0) {
        return {
          error: apiError(
            409,
            "invalid_state",
            "Extracted event is missing required scheduling fields",
            { missingFields: missingSchedulingFields },
            requestId,
          ),
        };
      }

      const effectiveTitle = patch.title ?? candidate.title;
      const effectiveDescription =
        "description" in patch ? patch.description : candidate.description;
      const effectiveLocationText =
        "locationText" in patch ? patch.locationText : candidate.locationText;
      const requiredStartAt =
        patch.startAt ? new Date(patch.startAt) : (candidate.startAt as Date);
      const requiredTimezone = patch.timezone ?? resolvedTimezone as string;
      const effectiveEndAt =
        "endAt" in patch
          ? (patch.endAt ? new Date(patch.endAt) : null)
          : candidate.endAt;

      const baseSlug = slugifyEventTitle(effectiveTitle);
      const slug = await ensureUniqueEventSlugWithDeps(
        { findBySlug: (value) => tx.event.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );

      const createdEvent = await tx.event.create({
        data: {
          venueId: candidate.venueId,
          title: effectiveTitle,
          slug,
          description: effectiveDescription,
          startAt: requiredStartAt,
          endAt: effectiveEndAt,
          timezone: requiredTimezone,
          isPublished: publishImmediately,
          status: publishImmediately ? "PUBLISHED" : "DRAFT",
          publishedAt: publishImmediately ? new Date() : null,
          isAiExtracted: true,
          ingestSourceRunId: candidate.runId,
        },
        select: { id: true, title: true, description: true },
      });

      let matchedArtists: Array<{ id: string; name: string }> = [];
      matchedArtists = candidate.artistNames.length > 0
        ? await tx.artist.findMany({
          where: {
            isPublished: true,
            deletedAt: null,
            OR: candidate.artistNames.map((name) => ({
              name: { equals: name, mode: "insensitive" as const },
            })),
          },
          select: { id: true, name: true },
        })
        : [];

      if (matchedArtists.length > 0) {
        await tx.eventArtist.createMany({
          data: matchedArtists.map((artist) => ({
            eventId: createdEvent.id,
            artistId: artist.id,
          })),
          skipDuplicates: true,
        });
      }

      let unmatchedNames: string[] = [];
      let sparseArtistNames: string[] = [];
      let artistSettings: {
        googlePseApiKey: string | undefined;
        googlePseCx: string | undefined;
        artistLookupProvider: string | null | undefined;
        artistBioProvider: string | null | undefined;
        geminiApiKey: string | null | undefined;
        anthropicApiKey: string | null | undefined;
        openAiApiKey: string | null | undefined;
      } | null = null;


      let artworkSettings: {
        artworkExtractionProvider: string | null | undefined;
        anthropicApiKey: string | null | undefined;
        geminiApiKey: string | null | undefined;
        openAiApiKey: string | null | undefined;
      } | null = null;

      let autoTagSettings: {
        autoTagEnabled: boolean;
        autoTagProvider: string | null;
        autoTagModel: string | null;
        geminiApiKey: string | null;
        anthropicApiKey: string | null;
        openAiApiKey: string | null;
      } | null = null;

      const needsSettings = process.env.AI_ARTWORK_INGEST_ENABLED === "1"
        || process.env.AI_ARTIST_INGEST_ENABLED === "1"
        || process.env.AI_AUTO_TAG_ENABLED === "1"
        || process.env.AI_ARTIST_ENRICH_ON_MATCH === "1";
      const settings = needsSettings
        ? await tx.siteSettings.findUnique({
          where: { id: "default" },
          select: {
            artworkExtractionProvider: true,
            enrichMatchedArtists: true,
            googlePseApiKey: true,
            googlePseCx: true,
            artistLookupProvider: true,
            artistBioProvider: true,
            autoTagEnabled: true,
            autoTagProvider: true,
            autoTagModel: true,
            geminiApiKey: true,
            anthropicApiKey: true,
            openAiApiKey: true,
          },
        })
        : null;

      if (
        process.env.AI_ARTIST_ENRICH_ON_MATCH === "1" &&
        settings?.enrichMatchedArtists &&
        matchedArtists.length > 0
      ) {
        const matchedDetails = await tx.artist.findMany({
          where: { id: { in: matchedArtists.map((a) => a.id) } },
          select: { id: true, name: true, bio: true, mediums: true, featuredAssetId: true },
        });
        sparseArtistNames = matchedDetails
          .filter((a) => !a.bio?.trim() || a.mediums.length === 0 || !a.featuredAssetId)
          .map((a) => a.name);
      }

      if (process.env.AI_ARTWORK_INGEST_ENABLED === "1") {
        artworkSettings = {
          artworkExtractionProvider: settings?.artworkExtractionProvider,
          anthropicApiKey: settings?.anthropicApiKey,
          geminiApiKey: settings?.geminiApiKey,
          openAiApiKey: settings?.openAiApiKey,
        };
      }

      if (
        process.env.AI_ARTIST_INGEST_ENABLED === "1" ||
        process.env.AI_ARTIST_ENRICH_ON_MATCH === "1"
      ) {
        unmatchedNames = (candidate.artistNames ?? []).filter(
          (name) => !matchedArtists.some(
            (a) => a.name.toLowerCase() === name.toLowerCase(),
          ),
        );

        if (unmatchedNames.length > 0 || sparseArtistNames.length > 0) {
          artistSettings = {
            googlePseApiKey: settings?.googlePseApiKey ?? process.env.GOOGLE_PSE_API_KEY,
            googlePseCx: settings?.googlePseCx ?? process.env.GOOGLE_PSE_CX,
            artistLookupProvider: settings?.artistLookupProvider,
            artistBioProvider: settings?.artistBioProvider,
            geminiApiKey: settings?.geminiApiKey,
            anthropicApiKey: settings?.anthropicApiKey,
            openAiApiKey: settings?.openAiApiKey,
          };
        }
      }

      if (process.env.AI_AUTO_TAG_ENABLED === "1") {
        autoTagSettings = {
          autoTagEnabled: settings?.autoTagEnabled ?? false,
          autoTagProvider: settings?.autoTagProvider ?? null,
          autoTagModel: settings?.autoTagModel ?? null,
          geminiApiKey: settings?.geminiApiKey ?? null,
          anthropicApiKey: settings?.anthropicApiKey ?? null,
          openAiApiKey: settings?.openAiApiKey ?? null,
        };
      }

      if (!publishImmediately) {
        await tx.submission.create({
          data: {
            type: "EVENT",
            kind: "PUBLISH",
            status: "IN_REVIEW",
            submitterUserId: actor.id,
            venueId: candidate.venueId,
            targetEventId: createdEvent.id,
            note: "AI ingest candidate submitted for admin moderation",
            details: {
              source: "ingest",
              candidateId: candidate.id,
              runId: candidate.runId,
              sourceUrl: candidate.sourceUrl,
              locationText: effectiveLocationText,
            },
            submittedAt: new Date(),
            isAiGenerated: true,
          },
          select: { id: true },
        });
      }

      const updated = await tx.ingestExtractedEvent.update({
        where: { id: candidate.id },
        data: {
          status: "APPROVED",
          rejectionReason: null,
          createdEventId: createdEvent.id,
          title: effectiveTitle,
          description: effectiveDescription,
          startAt: requiredStartAt,
          endAt: effectiveEndAt,
          timezone: requiredTimezone,
          locationText: effectiveLocationText,
        },
        select: { id: true, createdEventId: true, runId: true, venueId: true },
      });

      return {
        candidate: updated,
        createdEventId: createdEvent.id,
        eventTitle: createdEvent.title,
        eventDescription: createdEvent.description ?? null,
        autoTagSettings,
        unmatchedNames,
        sparseArtistNames,
        artistSettings,
        artworkSettings,
          sourceUrl: candidate.sourceUrl,
          linkedArtistCount: matchedArtists.length,
          published: publishImmediately,
          imageContext: {
            runId: candidate.runId,
            venueId: candidate.venueId,
            sourceUrl: candidate.sourceUrl,
            venueWebsiteUrl: candidate.venue.websiteUrl,
            candidateImageUrl: candidate.imageUrl,
            title: effectiveTitle,
            runErrorDetail: candidate.run.errorDetail,
          },
        };
    });

    if ("error" in approved) return approved.error;

    const sparseArtistNames = approved.sparseArtistNames ?? [];

    if (
      process.env.AI_ARTIST_INGEST_ENABLED === "1" &&
      approved.unmatchedNames.length > 0 &&
      approved.artistSettings
    ) {
      Promise.all(
        approved.unmatchedNames.map((name) =>
          discoverArtist({
            db: resolved.appDb,
            artistName: name,
            eventId: approved.createdEventId,
            settings: approved.artistSettings!,
          }).catch((err) =>
            console.error("[artist-discovery] failed for", name, err),
          ),
        ),
      ).catch(() => {});
    }

    if (
      process.env.AI_ARTIST_ENRICH_ON_MATCH === "1" &&
      sparseArtistNames.length > 0 &&
      approved.artistSettings
    ) {
      Promise.all(
        sparseArtistNames.map((name) =>
          discoverArtist({
            db: resolved.appDb,
            artistName: name,
            eventId: approved.createdEventId,
            settings: approved.artistSettings!,
          }).catch((err) =>
            console.error("[artist-enrichment] failed for", name, err),
          ),
        ),
      ).catch(() => {});
    }

    if (
      process.env.AI_ARTWORK_INGEST_ENABLED === "1" &&
      approved.sourceUrl
    ) {
      extractArtworksForEvent({
        db: resolved.appDb,
        eventId: approved.createdEventId,
        sourceUrl: approved.sourceUrl,
        settings: {
          artworkExtractionProvider: approved.artworkSettings?.artworkExtractionProvider,
          claudeApiKey: approved.artworkSettings?.anthropicApiKey,
          geminiApiKey: approved.artworkSettings?.geminiApiKey,
          openAiApiKey: approved.artworkSettings?.openAiApiKey,
        },
      }).catch((err) =>
        console.error("[artwork-extraction] failed for event", approved.createdEventId, err)
      );
    }


    if (process.env.AI_AUTO_TAG_ENABLED === "1" && approved.autoTagSettings?.autoTagEnabled) {
      autoTagEvent({
        db: resolved.appDb,
        eventId: approved.createdEventId,
        title: approved.eventTitle,
        description: approved.eventDescription,
        settings: {
          autoTagProvider: approved.autoTagSettings.autoTagProvider,
          autoTagModel: approved.autoTagSettings.autoTagModel,
          geminiApiKey: approved.autoTagSettings.geminiApiKey,
          anthropicApiKey: approved.autoTagSettings.anthropicApiKey,
          openAiApiKey: approved.autoTagSettings.openAiApiKey,
        },
      }).catch((err) =>
        console.error("[auto-tag] failed for event", approved.createdEventId, err)
      );
    }

    let imageWarning: string | null = null;
    const imageImport = await resolved.importEventImage({
      appDb: resolved.appDb,
      candidateId: approved.candidate.id,
      runId: approved.imageContext.runId,
      eventId: approved.createdEventId,
      venueId: approved.imageContext.venueId,
      title: approved.imageContext.title,
      sourceUrl: approved.imageContext.sourceUrl,
      venueWebsiteUrl: approved.imageContext.venueWebsiteUrl,
      candidateImageUrl: approved.imageContext.candidateImageUrl,
      requestId,
    });
    imageWarning = imageImport.warning;

    if (imageWarning) {
      await resolved.appDb.ingestRun.update({
        where: { id: approved.imageContext.runId },
        data: {
          errorDetail: appendWarningDetail(approved.imageContext.runErrorDetail, imageWarning),
        },
        select: { id: true },
      });
    }

    await resolved.logAction({
      actorEmail: actor.email,
      action: "ADMIN_INGEST_CANDIDATE_APPROVED",
      targetType: "ingest_extracted_event",
      targetId: approved.candidate.id,
      metadata: {
        runId: approved.candidate.runId,
        venueId: approved.candidate.venueId,
        createdEventId: approved.createdEventId,
        linkedArtistCount: approved.linkedArtistCount ?? 0,
        imageAttached: imageImport.attached,
        imageWarning,
      } satisfies Prisma.InputJsonValue,
      req,
    });

    return NextResponse.json({
      ok: true,
      candidateId: approved.candidate.id,
      createdEventId: approved.createdEventId,
      linkedArtistCount: approved.linkedArtistCount ?? 0,
      published: approved.published,
      imageWarning,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required", undefined, requestId);
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Editor role required", undefined, requestId);
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}
