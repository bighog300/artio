import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { ENRICHMENT_TEMPLATE_BY_KEY, type EnrichmentTemplateKey } from "@/lib/enrichment/templates";
import { countEnrichmentTargets, getEnrichmentTargets, runEnrichmentForTemplate, toRunItemForeignKeys } from "@/lib/enrichment/workbench";

export const runtime = "nodejs";

const BATCH_SIZE = 5;
const PAGE_SIZE = 20;
const toJson = (value: Record<string, unknown>): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const toItemStatus = (value: "success" | "skipped" | "failed"): "SUCCESS" | "SKIPPED" | "FAILED" => {
  if (value === "success") return "SUCCESS";
  if (value === "skipped") return "SKIPPED";
  return "FAILED";
};

const postSchema = z.object({
  templateId: z.enum(["ARTIST_BIO", "ARTIST_IMAGE", "ARTWORK_DESCRIPTION", "ARTWORK_IMAGE", "VENUE_DESCRIPTION", "EVENT_IMAGE"]),
  entityType: z.enum(["ARTIST", "ARTWORK", "VENUE", "EVENT"]),
  gapFilter: z.enum(["ALL", "MISSING_BIO", "MISSING_DESCRIPTION", "MISSING_IMAGE"]),
  statusFilter: z.enum(["ALL", "DRAFT", "ONBOARDING", "IN_REVIEW", "PUBLISHED"]),
  searchProvider: z.enum(["google_pse", "brave", "ai_only"]),
  limit: z.union([z.literal(10), z.literal(25), z.literal(50)]),
  dryRun: z.boolean().default(false),
});

const querySchema = z.object({
  entityType: z.enum(["ARTIST", "ARTWORK", "VENUE", "EVENT"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query params", parsed.error.flatten());

    const page = parsed.data.page;
    const where = parsed.data.entityType ? { entityType: parsed.data.entityType } : undefined;

    const [total, runs] = await Promise.all([
      db.enrichmentRun.count({ where }),
      db.enrichmentRun.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          requestedBy: { select: { id: true, email: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return NextResponse.json({ runs, page, pageSize: PAGE_SIZE, total }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest) {
  noStore();
  try {
    const admin = await requireAdmin();
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", parsed.error.flatten());

    const payload = parsed.data;
    const template = ENRICHMENT_TEMPLATE_BY_KEY[payload.templateId as EnrichmentTemplateKey];
    if (!template || template.entityType !== payload.entityType) {
      return apiError(400, "invalid_request", "Template does not match entity type");
    }

    const totalMatches = await countEnrichmentTargets(db, payload);
    if (totalMatches === 0) {
      return NextResponse.json({ error: "no_targets" }, { status: 400 });
    }

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

    const targets = await getEnrichmentTargets(db, payload);

    const searchEnabled = payload.searchProvider !== "ai_only";
    const provider: "google_pse" | "brave" = payload.searchProvider === "ai_only" ? "google_pse" : payload.searchProvider;

    const run = await db.enrichmentRun.create({
      data: {
        templateKey: payload.templateId,
        entityType: payload.entityType,
        gapFilter: payload.gapFilter,
        statusFilter: payload.statusFilter,
        searchEnabled,
        searchProvider: provider,
        status: "PENDING",
        requestedById: admin.id,
        dryRun: payload.dryRun,
        totalItems: targets.length,
      },
    });

    await db.enrichmentRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    let processedCount = 0;
    let enrichedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const chunk = targets.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        chunk.map((target) => runEnrichmentForTemplate({
          db,
          templateId: payload.templateId,
          entityId: target.id,
          searchProvider: provider,
          settings: {
            gapFilter: payload.gapFilter,
            searchEnabled,
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
          dryRun: payload.dryRun,
        })),
      );

      const rows = settled.map((result, idx) => {
        processedCount += 1;
        const target = chunk[idx];
        if (result.status === "fulfilled") {
          if (result.value.status === "success") enrichedCount += 1;
          if (result.value.status === "skipped") skippedCount += 1;
          if (result.value.status === "failed") failedCount += 1;
          const itemStatus: "STAGED" | "SUCCESS" | "SKIPPED" | "FAILED" = payload.dryRun
            ? "STAGED"
            : toItemStatus(result.value.status);
          return {
            runId: run.id,
            entityType: payload.entityType,
            ...toRunItemForeignKeys(payload.entityType, target.id),
            status: itemStatus,
            fieldsChanged: result.value.fieldsChanged,
            fieldsBefore: toJson(result.value.fieldsBefore),
            fieldsAfter: toJson(result.value.fieldsAfter),
            confidenceBefore: result.value.confidenceBefore,
            confidenceAfter: result.value.confidenceAfter,
            searchUrl: result.value.searchUrl,
            reason: result.value.reason ?? null,
            errorMessage: null,
          };
        }

        failedCount += 1;
        return {
          runId: run.id,
          entityType: payload.entityType,
          ...toRunItemForeignKeys(payload.entityType, target.id),
          status: "FAILED" as const,
          fieldsChanged: [],
          fieldsBefore: toJson({}),
          fieldsAfter: toJson({}),
          confidenceBefore: null,
          confidenceAfter: null,
          searchUrl: null,
          reason: "execution_error",
          errorMessage: result.reason instanceof Error ? result.reason.message : "Unknown error",
        };
      });

      await db.enrichmentRunItem.createMany({ data: rows });
    }

    await db.enrichmentRun.update({
      where: { id: run.id },
      data: {
        status: payload.dryRun ? "STAGED" : "COMPLETED",
        processedItems: processedCount,
        successItems: enrichedCount,
        skippedItems: skippedCount,
        failedItems: failedCount,
        finishedAt: new Date(),
      },
    });

    const completed = await db.enrichmentRun.findUnique({
      where: { id: run.id },
      include: {
        requestedBy: { select: { id: true, email: true, name: true } },
        items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });

    return NextResponse.json({ run: completed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
