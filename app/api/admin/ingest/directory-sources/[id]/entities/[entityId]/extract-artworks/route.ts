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

    if (!entity || entity.directorySourceId !== id) {
      return apiError(404, "not_found", "Directory entity not found");
    }

    // Works for both ARTIST sources (extract artworks from artist profiles)
    // and any other entity with a URL pointing to a page with artwork content
    const stubEvent = await getOrCreateDirectoryStubEvent(db, entity.directorySourceId);
    if (!stubEvent) {
      return apiError(500, "stub_event_missing", "Could not find or create stub event");
    }

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        artworkExtractionProvider: true,
        anthropicApiKey: true,
        openAiApiKey: true,
        geminiApiKey: true,
      },
    });

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

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_directory_entity_extract_artworks_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
