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

    const run = await resolved.appDb.ingestRun.findUnique({
      where: { id: parsedParams.data.runId },
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

    if (!run) return apiError(404, "not_found", "Ingest run not found", undefined, requestId);

    const counts = run.extractedEvents.reduce((acc, candidate) => {
      acc.total += 1;
      if (candidate.status === "PENDING") acc.pending += 1;
      if (candidate.status === "APPROVED") acc.approved += 1;
      if (candidate.status === "REJECTED") acc.rejected += 1;
      if (candidate.status === "DUPLICATE") acc.duplicates += 1;
      if (candidate.status !== "DUPLICATE") acc.primaries += 1;
      return acc;
    }, { total: 0, pending: 0, approved: 0, rejected: 0, duplicates: 0, primaries: 0 });

    return NextResponse.json({ ok: true, run, counts }, { headers: { "Cache-Control": "no-store" } });
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

export async function handleAdminIngestApprove(req: NextRequest, params: { id?: string }, deps: Partial<AdminIngestDeps> = {}) {
  const resolved = { ...defaultDeps, ...deps };
  const requestId = getRequestId(req.headers);

  try {
    const actor = await resolved.requireEditorUser();
    const parsedParams = candidateIdSchema.safeParse(params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error), requestId);

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

      const requiredStartAt = candidate.startAt as Date;
      const requiredTimezone = resolvedTimezone as string;

      const baseSlug = slugifyEventTitle(candidate.title);
      const slug = await ensureUniqueEventSlugWithDeps(
        { findBySlug: (value) => tx.event.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );

      const createdEvent = await tx.event.create({
        data: {
          venueId: candidate.venueId,
          title: candidate.title,
          slug,
          description: candidate.description,
          startAt: requiredStartAt,
          endAt: candidate.endAt,
          timezone: requiredTimezone,
          isPublished: false,
          isAiExtracted: true,
          ingestSourceRunId: candidate.runId,
        },
        select: { id: true },
      });

      let matchedArtists: Array<{ id: string; name: string }> = [];
      if (candidate.artistNames && candidate.artistNames.length > 0) {
        matchedArtists = await tx.artist.findMany({
          where: {
            name: { in: candidate.artistNames, mode: "insensitive" },
            isPublished: true,
            deletedAt: null,
          },
          select: { id: true, name: true },
        });

        if (matchedArtists.length > 0) {
          await tx.eventArtist.createMany({
            data: matchedArtists.map((artist) => ({
              eventId: createdEvent.id,
              artistId: artist.id,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (process.env.AI_ARTIST_INGEST_ENABLED === "1") {
        const unmatchedNames = (candidate.artistNames ?? []).filter(
          (name) => !matchedArtists.some(
            (a) => a.name.toLowerCase() === name.toLowerCase(),
          ),
        );

        if (unmatchedNames.length > 0) {
          const settings = await tx.siteSettings.findUnique({
            where: { id: "default" },
            select: {
              googlePseApiKey: true,
              googlePseCx: true,
              artistLookupProvider: true,
              artistBioProvider: true,
              geminiApiKey: true,
              anthropicApiKey: true,
              openAiApiKey: true,
            },
          });

          const artistSettings = {
            googlePseApiKey: settings?.googlePseApiKey ?? process.env.GOOGLE_PSE_API_KEY,
            googlePseCx: settings?.googlePseCx ?? process.env.GOOGLE_PSE_CX,
            artistLookupProvider: settings?.artistLookupProvider,
            artistBioProvider: settings?.artistBioProvider,
            geminiApiKey: settings?.geminiApiKey,
            anthropicApiKey: settings?.anthropicApiKey,
            openAiApiKey: settings?.openAiApiKey,
          };

          Promise.all(
            unmatchedNames.map((name) =>
              discoverArtist({
                db: tx,
                artistName: name,
                eventId: createdEvent.id,
                settings: artistSettings,
              }).catch((err) =>
                console.error("[artist-discovery] failed for", name, err),
              ),
            ),
          ).catch(() => {});
        }
      }

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
            locationText: candidate.locationText,
          },
          submittedAt: new Date(),
        },
        select: { id: true },
      });

      const updated = await tx.ingestExtractedEvent.update({
        where: { id: candidate.id },
        data: {
          status: "APPROVED",
          rejectionReason: null,
          createdEventId: createdEvent.id,
        },
        select: { id: true, createdEventId: true, runId: true, venueId: true },
      });

      return {
        candidate: updated,
        createdEventId: createdEvent.id,
        linkedArtistCount: matchedArtists.length,
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
    });

    if ("error" in approved) return approved.error;

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
      imageWarning,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required", undefined, requestId);
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Editor role required", undefined, requestId);
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}
