import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { discoverArtist } from "@/lib/ingest/artist-discovery";
import { normaliseDirectoryName } from "@/lib/ingestion/directory/miner";
import { getOrCreateDirectoryStubEvent } from "@/lib/ingestion/workers/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

const paramsSchema = z.object({
  id: z.string().uuid(),
  entityId: z.string().uuid(),
});

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string; entityId: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const { id, entityId } = parsedParams.data;

    const entity = await db.directoryEntity.findUnique({
      where: { id: entityId },
      include: { directorySource: { select: { id: true, entityType: true } } },
    });

    if (!entity || entity.directorySourceId !== id) return apiError(404, "not_found", "Directory entity not found");
    if (entity.directorySource.entityType.toUpperCase() !== "ARTIST") {
      return apiError(400, "invalid_source_type", "Only ARTIST directory entities can be queued for discovery");
    }

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        googlePseApiKey: true,
        googlePseCx: true,
        artistBioProvider: true,
        anthropicApiKey: true,
        openAiApiKey: true,
        geminiApiKey: true,
      },
    });

    const stubEvent = await getOrCreateDirectoryStubEvent(db, entity.directorySourceId);
    if (!stubEvent) return apiError(500, "stub_event_missing", "Could not find or create a stub event for discovery");

    const rawName = entity.entityName?.trim() || null;
    const artistName = rawName ? (normaliseDirectoryName(rawName) ?? rawName) : null;
    if (!artistName || artistName.length < 3) {
      return apiError(400, "missing_entity_name", "Entity name must be at least 3 characters");
    }

    const discoveryStartMs = Date.now();
    let discoveryResult: { status: "created" | "linked" | "skipped"; candidateId?: string } | null = null;
    let discoveryError: string | null = null;

    try {
      discoveryResult = await discoverArtist({
        db: db as never,
        artistName,
        eventId: stubEvent.id,
        knownProfileUrl: entity.entityUrl,
        settings: {
          googlePseApiKey: settings?.googlePseApiKey,
          googlePseCx: settings?.googlePseCx,
          artistBioProvider: settings?.artistBioProvider,
          anthropicApiKey: settings?.anthropicApiKey,
          openAiApiKey: settings?.openAiApiKey,
          geminiApiKey: settings?.geminiApiKey,
        },
      });
    } catch (err) {
      discoveryError = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - discoveryStartMs;

    let tokensUsed: number | null = null;
    let extractionModel: string | null = null;
    let confidenceScore: number | null = null;
    let confidenceBand: string | null = null;

    if (discoveryResult?.candidateId) {
      const candidate = await db.ingestExtractedArtist.findUnique({
        where: { id: discoveryResult.candidateId },
        select: {
          confidenceScore: true,
          confidenceBand: true,
          runs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { model: true, usageTotalTokens: true },
          },
        },
      }).catch(() => null);

      tokensUsed = candidate?.runs[0]?.usageTotalTokens ?? null;
      extractionModel = candidate?.runs[0]?.model ?? null;
      confidenceScore = candidate?.confidenceScore ?? null;
      confidenceBand = candidate?.confidenceBand ?? null;
    }

    db.directoryDiscoveryLog.create({
      data: {
        directorySourceId: id,
        entityId: entity.id,
        entityUrl: entity.entityUrl,
        entityName: entity.entityName,
        status: discoveryError ? "failed" : (discoveryResult?.status ?? "failed"),
        candidateId: discoveryResult?.candidateId ?? null,
        errorMessage: discoveryError,
        model: extractionModel,
        tokensUsed,
        confidenceScore,
        confidenceBand,
        durationMs,
      },
    }).catch((err) =>
      console.warn("directory_discovery_log_write_failed", {
        entityId: entity.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );

    if (discoveryError) {
      throw new Error(discoveryError);
    }

    if (discoveryResult?.candidateId) {
      await db.directoryEntity.update({
        where: { id: entity.id },
        data: { matchedArtistId: null },
      });
    }

    return NextResponse.json({
      status: discoveryResult?.status ?? "failed",
      candidateId: discoveryResult?.candidateId ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_directory_sources_id_entities_entityId_queue_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
