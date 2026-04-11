import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { discoverArtist } from "@/lib/ingest/artist-discovery";
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
    if (entity.directorySource.entityType !== "ARTIST") {
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

    const artistName = entity.entityName?.trim() || null;
    if (!artistName || artistName.length < 3) {
      return apiError(400, "missing_entity_name", "Entity name must be at least 3 characters");
    }

    const result = await discoverArtist({
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

    if (result.candidateId) {
      await db.directoryEntity.update({
        where: { id: entity.id },
        data: { matchedArtistId: null },
      });
    }

    return NextResponse.json({
      status: result.status,
      candidateId: result.candidateId ?? null,
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
