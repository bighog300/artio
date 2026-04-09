import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { ENRICHMENT_TEMPLATE_BY_KEY, type EnrichmentTemplateKey } from "@/lib/enrichment/templates";
import { getEnrichmentTargets } from "@/lib/enrichment/workbench";

export const runtime = "nodejs";

const querySchema = z.object({
  templateId: z.enum(["ARTIST_BIO", "ARTIST_IMAGE", "ARTWORK_DESCRIPTION", "ARTWORK_IMAGE", "VENUE_DESCRIPTION", "EVENT_IMAGE"]),
  entityType: z.enum(["ARTIST", "ARTWORK", "VENUE", "EVENT"]),
  gapFilter: z.enum(["ALL", "MISSING_BIO", "MISSING_DESCRIPTION", "MISSING_IMAGE"]),
  statusFilter: z.enum(["ALL", "DRAFT", "ONBOARDING", "IN_REVIEW", "PUBLISHED"]),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query params", parsed.error.flatten());

    const template = ENRICHMENT_TEMPLATE_BY_KEY[parsed.data.templateId as EnrichmentTemplateKey];
    if (!template || template.entityType !== parsed.data.entityType) {
      return apiError(400, "invalid_request", "Template does not match entity type");
    }

    const targets = await getEnrichmentTargets(db, parsed.data);

    return NextResponse.json({ items: targets.map((target) => ({
      id: target.id,
      name: target.name,
      status: target.status,
      confidenceScore: target.confidenceScore,
      gaps: target.gaps,
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_enrichment_preview_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
