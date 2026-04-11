import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { ARTIST_PROFILE_ARTWORK_SYSTEM_PROMPT, extractArtworksForEvent } from "@/lib/ingest/artwork-extraction";
import { getOrCreateDirectoryStubEvent } from "@/lib/ingestion/workers/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const sourceId = parsedParams.data.id;

    // Only process entities that have been matched to a real artist
    const entities = await db.directoryEntity.findMany({
      where: {
        directorySourceId: sourceId,
        matchedArtistId: { not: null },
      },
      select: { id: true, entityUrl: true, entityName: true, matchedArtistId: true },
      take: 50, // process in batches
    });

    if (entities.length === 0) {
      return NextResponse.json(
        { processed: 0, totalCreated: 0, message: "No matched entities found. Queue and approve artists first." },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const stubEvent = await getOrCreateDirectoryStubEvent(db, sourceId);
    if (!stubEvent) return apiError(500, "stub_event_missing", "Could not create stub event");

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        artworkExtractionProvider: true,
        anthropicApiKey: true,
        openAiApiKey: true,
        geminiApiKey: true,
      },
    });

    let totalCreated = 0;
    let totalDuplicates = 0;
    let totalSkipped = 0;

    for (const entity of entities) {
      const result = await extractArtworksForEvent({
        db,
        eventId: stubEvent.id,
        sourceUrl: entity.entityUrl,
        systemPromptOverride: ARTIST_PROFILE_ARTWORK_SYSTEM_PROMPT,
        matchedArtistId: entity.matchedArtistId ?? null,
        settings: {
          artworkExtractionProvider: settings?.artworkExtractionProvider,
          anthropicApiKey: settings?.anthropicApiKey,
          openAiApiKey: settings?.openAiApiKey,
          geminiApiKey: settings?.geminiApiKey,
        },
      });
      totalCreated += result.created;
      totalDuplicates += result.duplicates;
      totalSkipped += result.skipped;
    }

    return NextResponse.json(
      {
        processed: entities.length,
        totalCreated,
        totalDuplicates,
        totalSkipped,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_directory_extract_artworks_batch_error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
