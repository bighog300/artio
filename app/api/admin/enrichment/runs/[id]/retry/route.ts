import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import type { EnrichmentTemplateKey } from "@/lib/enrichment/templates";
import { runEnrichmentForTemplate, toRunItemForeignKeys, type SearchProvider } from "@/lib/enrichment/workbench";

export const runtime = "nodejs";
const toJson = (value: Record<string, unknown>): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const toItemStatus = (value: "success" | "skipped" | "failed"): "SUCCESS" | "SKIPPED" | "FAILED" => {
  if (value === "success") return "SUCCESS";
  if (value === "skipped") return "SKIPPED";
  return "FAILED";
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const { id } = await params;

    const run = await db.enrichmentRun.findUnique({
      where: { id },
      include: {
        items: {
          where: { status: "FAILED" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!run) return apiError(404, "not_found", "Run not found");

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        googlePseApiKey: true,
        googlePseCx: true,
        braveSearchApiKey: true,
        openAiApiKey: true,
        anthropicApiKey: true,
        geminiApiKey: true,
        artistBioProvider: true,
        artworkExtractionProvider: true,
        venueEnrichmentProvider: true,
        artistBioSystemPrompt: true,
        artworkExtractionSystemPrompt: true,
      },
    });

    for (const item of run.items) {
      const entityId = item.artistId ?? item.artworkId ?? item.venueId ?? item.eventId;
      if (!entityId) continue;

      try {
        const result = await runEnrichmentForTemplate({
          db,
          templateId: run.templateKey as EnrichmentTemplateKey,
          entityId,
          searchProvider: run.searchProvider as SearchProvider,
          settings: {
            gapFilter: run.gapFilter,
            searchEnabled: run.searchEnabled,
            googlePseApiKey: settings?.googlePseApiKey,
            googlePseCx: settings?.googlePseCx,
            braveSearchApiKey: settings?.braveSearchApiKey,
            openAiApiKey: settings?.openAiApiKey,
            anthropicApiKey: settings?.anthropicApiKey,
            geminiApiKey: settings?.geminiApiKey,
            artistBioProvider: settings?.artistBioProvider,
            artworkExtractionProvider: settings?.artworkExtractionProvider,
            venueEnrichmentProvider: settings?.venueEnrichmentProvider,
            artistBioSystemPrompt: settings?.artistBioSystemPrompt,
            artworkExtractionSystemPrompt: settings?.artworkExtractionSystemPrompt,
          },
        });

        await db.enrichmentRunItem.create({
          data: {
            runId: run.id,
            entityType: run.entityType,
            ...toRunItemForeignKeys(run.entityType, entityId),
            status: toItemStatus(result.status),
            fieldsChanged: result.fieldsChanged,
            fieldsBefore: toJson(result.fieldsBefore),
            fieldsAfter: toJson(result.fieldsAfter),
            confidenceBefore: result.confidenceBefore,
            confidenceAfter: result.confidenceAfter,
            searchUrl: result.searchUrl,
            reason: result.reason ?? null,
            errorMessage: null,
          },
        });
      } catch (error) {
        await db.enrichmentRunItem.create({
          data: {
            runId: run.id,
            entityType: run.entityType,
            ...toRunItemForeignKeys(run.entityType, entityId),
            status: "FAILED",
            fieldsChanged: [],
            fieldsBefore: toJson({}),
            fieldsAfter: toJson({}),
            confidenceBefore: null,
            confidenceAfter: null,
            searchUrl: null,
            reason: "execution_error",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    const counts = await db.enrichmentRunItem.groupBy({
      by: ["status"],
      where: { runId: run.id },
      _count: { status: true },
    });

    const successItems = counts.find((c) => c.status === "SUCCESS")?._count.status ?? 0;
    const skippedItems = counts.find((c) => c.status === "SKIPPED")?._count.status ?? 0;
    const failedItems = counts.find((c) => c.status === "FAILED")?._count.status ?? 0;
    const processedItems = successItems + skippedItems + failedItems;

    await db.enrichmentRun.update({
      where: { id: run.id },
      data: {
        successItems,
        skippedItems,
        failedItems,
        processedItems,
      },
    });

    const updatedRun = await db.enrichmentRun.findUnique({
      where: { id: run.id },
      include: {
        requestedBy: { select: { id: true, email: true, name: true } },
        items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });

    return NextResponse.json({ run: updatedRun }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_enrichment_runs_id_retry_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
