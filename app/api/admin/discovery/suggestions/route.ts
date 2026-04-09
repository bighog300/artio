import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { suggestAdaptiveTemplates } from "@/lib/discovery/adaptive-templates";

export const runtime = "nodejs";

const PAGE_SIZE = 20;

const querySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "DISMISSED"]).default("PENDING"),
  entityType: z.enum(["VENUE", "ARTIST", "EVENT"]).optional(),
  region: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const postSchema = z.object({
  entityType: z.enum(["VENUE", "ARTIST"]),
  region: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  count: z.number().int().min(1).max(10).default(5),
  goalId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query params", parsed.error.flatten());

    const where: Prisma.DiscoveryTemplateSuggestionWhereInput = {
      status: parsed.data.status,
      ...(parsed.data.entityType ? { entityType: parsed.data.entityType } : {}),
      ...(parsed.data.region
        ? { region: { contains: parsed.data.region, mode: "insensitive" } }
        : {}),
    };

    const page = parsed.data.page;
    const [total, suggestions] = await Promise.all([
      db.discoveryTemplateSuggestion.count({ where }),
      db.discoveryTemplateSuggestion.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return NextResponse.json(
      { suggestions, page, total },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_discovery_suggestions_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
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
    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        openAiApiKey: true,
        anthropicApiKey: true,
        geminiApiKey: true,
        artistBioProvider: true,
        artworkExtractionProvider: true,
        venueEnrichmentProvider: true,
        ingestModel: true,
      },
    });

    const providerName = payload.entityType === "ARTIST"
      ? settings?.artistBioProvider ?? "openai"
      : settings?.venueEnrichmentProvider ?? "openai";

    const suggestions = await suggestAdaptiveTemplates(db, {
      entityType: payload.entityType,
      region: payload.region,
      country: payload.country,
      count: payload.count,
    }, {
      provider: providerName,
      openAiApiKey: settings?.openAiApiKey,
      anthropicApiKey: settings?.anthropicApiKey,
      geminiApiKey: settings?.geminiApiKey,
      model: settings?.ingestModel,
    });

    if (suggestions.length === 0) {
      return apiError(
        400,
        "no_suggestions",
        "AI provider returned no suggestions. Check that an API key is configured in Settings.",
      );
    }

    const existing = await db.discoveryTemplateSuggestion.findMany({
      where: {
        status: "PENDING",
        entityType: payload.entityType,
        region: { equals: payload.region, mode: "insensitive" },
        template: {
          in: suggestions.map((s) => s.template),
        },
      },
      select: { template: true },
    });
    const existingSet = new Set(existing.map((r) => r.template.toLowerCase()));
    const toCreate = suggestions.filter((s) => !existingSet.has(s.template.toLowerCase()));

    if (toCreate.length === 0) {
      return apiError(
        400,
        "all_duplicates",
        "All suggested templates already exist as pending suggestions for this region.",
      );
    }

    await db.discoveryTemplateSuggestion.createMany({
      data: toCreate.map((s) => ({
        entityType: payload.entityType,
        region: payload.region,
        country: payload.country,
        template: s.template,
        rationale: s.rationale,
        status: "PENDING",
        goalId: payload.goalId ?? null,
        regionId: payload.regionId ?? null,
        createdById: admin.id,
      })),
    });

    const created = await db.discoveryTemplateSuggestion.findMany({
      where: {
        createdById: admin.id,
        region: payload.region,
        entityType: payload.entityType,
        createdAt: { gte: new Date(Date.now() - 5000) },
      },
      orderBy: { createdAt: "desc" },
      take: payload.count,
    });

    return NextResponse.json(
      { suggestions: created },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_discovery_suggestions_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
