import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ jobId: string; candidateId: string }> },
) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");
    const { jobId, candidateId } = parsedParams.data;

    const candidate = await db.ingestDiscoveryCandidate.findUnique({
      where: { id: candidateId },
      include: { job: true },
    });

    if (!candidate || candidate.jobId !== jobId) {
      return apiError(404, "not_found", "Discovery candidate not found");
    }

    if (candidate.status !== "PENDING") {
      return apiError(400, "invalid_status", "Candidate must be in PENDING status");
    }

    if (candidate.job.entityType !== "VENUE") {
      return apiError(400, "only_venue_candidates_supported", "Only VENUE candidates can be queued for ingest");
    }

    const venue = await db.venue.findFirst({
      where: {
        OR: [
          { websiteUrl: candidate.url },
          ...(candidate.canonicalUrl ? [{ websiteUrl: candidate.canonicalUrl }] : []),
        ],
        deletedAt: null,
      },
      select: { id: true, websiteUrl: true },
    });

    if (!venue) {
      return apiError(
        400,
        "venue_not_found",
        "No venue found matching this URL. The venue must exist in the database before it can be queued for ingest. Use Venue Generation to create it first.",
      );
    }

    const existingRun = await db.ingestRun.findFirst({
      where: {
        venueId: venue.id,
        status: { in: ["PENDING", "RUNNING"] },
      },
      select: { id: true },
    });

    if (existingRun) {
      return apiError(409, "already_queued", "An ingest run is already pending or running for this venue");
    }

    const run = await db.$transaction(async (tx) => {
      const createdRun = await tx.ingestRun.create({
        data: {
          venueId: venue.id,
          sourceUrl: venue.websiteUrl ?? candidate.url,
          status: "PENDING",
        },
      });

      await tx.ingestDiscoveryCandidate.update({
        where: { id: candidateId },
        data: { status: "QUEUED" },
      });

      return createdRun;
    });

    return NextResponse.json({ runId: run.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_discovery_jobId_candidates_candidateId_queue_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
