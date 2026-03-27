import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { createVenueStubFromCandidate } from "@/lib/ingest/create-venue-stub-from-candidate";

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
      return apiError(400, "only_venue_candidates_supported", "Only VENUE candidates can be seeded");
    }

    let venue = await db.venue.findFirst({
      where: {
        OR: [
          { websiteUrl: candidate.url },
          { canonicalUrl: candidate.canonicalUrl ?? undefined },
        ],
        deletedAt: null,
      },
      select: { id: true, name: true, websiteUrl: true },
    });

    let venueCreated = false;
    if (!venue) {
      const region = candidate.job.regionId
        ? await db.ingestRegion.findUnique({
          where: { id: candidate.job.regionId },
          select: { country: true, region: true },
        })
        : null;

      let created: { venueId: string } | null = null;
      try {
        created = await createVenueStubFromCandidate({
          candidateUrl: candidate.url,
          candidateTitle: candidate.title,
          regionId: candidate.job.regionId,
          country: region?.country ?? null,
          region: region?.region ?? null,
          db,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return apiError(422, "venue_creation_failed", message);
      }

      if (!created) {
        return apiError(422, "venue_creation_failed", "Failed to create venue from discovery candidate");
      }

      venue = await db.venue.findUnique({
        where: { id: created.venueId },
        select: { id: true, name: true, websiteUrl: true },
      });

      if (!venue) {
        return apiError(422, "venue_creation_failed", "Venue creation failed to return a valid venue");
      }

      venueCreated = true;
    }

    const existingRun = await db.ingestRun.findFirst({
      where: {
        venueId: venue.id,
        status: { in: ["PENDING", "RUNNING"] },
      },
      select: { id: true },
    });

    const result = await db.$transaction(async (tx) => {
      const run = existingRun
        ? existingRun
        : await tx.ingestRun.create({
          data: {
            venueId: venue.id,
            sourceUrl: venue.websiteUrl ?? candidate.url,
            status: "PENDING",
          },
          select: { id: true },
        });

      await tx.ingestDiscoveryCandidate.update({
        where: { id: candidateId },
        data: {
          status: "QUEUED",
          seededVenueId: venue.id,
        },
      });

      return run;
    });

    return NextResponse.json(
      {
        venueId: venue.id,
        runId: result.id,
        venueName: venue.name,
        venueCreated,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return apiError(500, "internal_error", message);
  }
}
