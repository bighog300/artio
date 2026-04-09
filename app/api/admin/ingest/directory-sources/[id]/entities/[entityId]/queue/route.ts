import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveArtistCandidate } from "@/lib/ingest/artist-resolution";
import { runDiscoveryJob } from "@/lib/ingest/run-discovery-job";

export const runtime = "nodejs";

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

    const job = await db.ingestDiscoveryJob.create({
      data: {
        entityType: "ARTIST",
        queryTemplate: entity.entityUrl,
        region: "",
        searchProvider: "google_pse",
        maxResults: 5,
        status: "PENDING",
      },
      select: { id: true },
    });

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { googlePseApiKey: true, googlePseCx: true, braveSearchApiKey: true },
    });

    await runDiscoveryJob({
      db,
      jobId: job.id,
      env: {
        googlePseApiKey: settings?.googlePseApiKey,
        googlePseCx: settings?.googlePseCx,
        braveSearchApiKey: settings?.braveSearchApiKey,
      },
    });

    const resolved = await resolveArtistCandidate({
      db,
      name: entity.entityName?.trim() || "Unknown Artist",
      websiteUrl: entity.entityUrl,
    });

    if (resolved) {
      await db.directoryEntity.update({
        where: { id: entity.id },
        data: { matchedArtistId: resolved.artistId },
      });
    }

    return NextResponse.json({
      jobId: job.id,
      matchedArtistId: resolved?.artistId ?? null,
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
