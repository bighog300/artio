import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();

    // Latest run per venue (only SUCCEEDED or FAILED — skip RUNNING/PENDING)
    const latestRuns = await db.ingestRun.findMany({
      where: { status: { in: ["SUCCEEDED", "FAILED"] } },
      orderBy: { createdAt: "desc" },
      select: {
        venueId: true,
        createdAt: true,
        status: true,
      },
      distinct: ["venueId"],
    });

    // Pending candidate counts per venue
    const pendingGroups = await db.ingestExtractedEvent.groupBy({
      by: ["venueId"],
      where: { status: "PENDING", duplicateOfId: null },
      _count: { id: true },
    });

    const pendingByVenue = new Map(
      pendingGroups.map((g) => [g.venueId, g._count.id]),
    );

    const venues = await db.venue.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        usesJsonLd: true,
        lastIngestedAt: true,
      },
    });
    const venueMetaById = new Map(venues.map((venue) => [venue.id, venue]));

    const statusMap: Record<
      string,
      { lastRunAt: string; lastRunStatus: string; pendingCount: number; usesJsonLd: boolean; lastIngestedAt: string | null }
    > = {};

    for (const run of latestRuns) {
      const venueMeta = venueMetaById.get(run.venueId);
      statusMap[run.venueId] = {
        lastRunAt: run.createdAt.toISOString(),
        lastRunStatus: run.status,
        pendingCount: pendingByVenue.get(run.venueId) ?? 0,
        usesJsonLd: venueMeta?.usesJsonLd ?? false,
        lastIngestedAt: venueMeta?.lastIngestedAt?.toISOString() ?? null,
      };
    }

    // Venues with pending but no run yet
    for (const [venueId, count] of pendingByVenue.entries()) {
      if (!statusMap[venueId]) {
        const venueMeta = venueMetaById.get(venueId);
        statusMap[venueId] = {
          lastRunAt: "",
          lastRunStatus: "NEVER",
          pendingCount: count,
          usesJsonLd: venueMeta?.usesJsonLd ?? false,
          lastIngestedAt: venueMeta?.lastIngestedAt?.toISOString() ?? null,
        };
      }
    }

    return NextResponse.json(
      { status: statusMap },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    console.error("admin_venues_ingest_status_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
