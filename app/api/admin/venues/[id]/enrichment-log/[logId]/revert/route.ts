import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  try {
    await requireAdmin();
    const { id, logId } = await params;

    const log = await db.venueEnrichmentLog.findUnique({
      where: { id: logId },
      select: {
        id: true,
        venueId: true,
        changedFields: true,
        before: true,
      },
    });

    if (!log || log.venueId !== id) {
      return apiError(404, "not_found", "Enrichment log not found");
    }

    const beforeMap = (log.before && typeof log.before === "object" && !Array.isArray(log.before)
      ? log.before
      : {}) as Record<string, unknown>;

    const updateData: Prisma.VenueUpdateInput = {
      enrichmentSource: "admin_manual",
    };

    for (const field of log.changedFields) {
      if (field === "description") updateData.description = (beforeMap.description as string | null | undefined) ?? null;
      if (field === "openingHours") {
        const openingHours = beforeMap.openingHours;
        updateData.openingHours = openingHours == null
          ? Prisma.JsonNull
          : (openingHours as Prisma.InputJsonValue);
      }
      if (field === "contactEmail") updateData.contactEmail = (beforeMap.contactEmail as string | null | undefined) ?? null;
      if (field === "instagramUrl") updateData.instagramUrl = (beforeMap.instagramUrl as string | null | undefined) ?? null;
      if (field === "facebookUrl") updateData.facebookUrl = (beforeMap.facebookUrl as string | null | undefined) ?? null;
    }

    await db.venue.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ reverted: true, changedFields: log.changedFields });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_venues_id_enrichment_log_logId_revert_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
