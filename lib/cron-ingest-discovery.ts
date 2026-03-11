import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { validateCronRequest } from "@/lib/cron-auth";
import { runVenueIngestExtraction } from "@/lib/ingest/extraction-pipeline";
import { createVenueStubFromCandidate } from "@/lib/ingest/create-venue-stub-from-candidate";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function runCronIngestDiscovery(
  cronSecret: string | null,
  db: PrismaClient,
  opts?: { requestId?: string },
): Promise<Response> {
  const authFailureResponse = validateCronRequest(cronSecret, { route: "/api/cron/ingest/discovery", requestId: opts?.requestId });
  if (authFailureResponse) {
    return Response.json(await authFailureResponse.json(), { status: authFailureResponse.status, headers: { "Cache-Control": "no-store" } });
  }

  const candidates = await db.ingestDiscoveryCandidate.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 10,
    include: { job: { select: { entityType: true, regionId: true } } },
  });

  let processed = 0;

  for (const candidate of candidates) {
    processed += 1;
    await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "QUEUED" } });

    try {
      if (candidate.job.entityType === "VENUE") {
        const venue = await db.venue.findFirst({ where: { websiteUrl: candidate.url }, select: { id: true, websiteUrl: true, eventsPageUrl: true } });
        if (!venue) {
          // If this candidate came from a region run, auto-create a venue stub
          if (candidate.job.regionId) {
            const region = await db.ingestRegion.findUnique({
              where: { id: candidate.job.regionId },
              select: { country: true, region: true },
            });

            const stub = await createVenueStubFromCandidate({
              candidateUrl: candidate.url,
              candidateTitle: candidate.title,
              regionId: candidate.job.regionId,
              country: region?.country ?? null,
              region: region?.region ?? null,
              db,
            });

            if (stub) {
              await db.ingestDiscoveryCandidate.update({
                where: { id: candidate.id },
                data: { status: "DONE" },
              });
              processed += 1;
              continue;
            }
          }

          // No region context or stub creation failed — skip as before
          await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "SKIPPED", skipReason: "no_venue_record" } });
          continue;
        }

        const settings = await db.siteSettings.findUnique({ where: { id: "default" }, select: { ingestEnabled: true } });
        if (!settings?.ingestEnabled) {
          await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "SKIPPED", skipReason: "ingest_disabled" } });
          continue;
        }

        const sourceUrl = venue.eventsPageUrl ?? venue.websiteUrl;
        if (!sourceUrl) {
          await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "SKIPPED", skipReason: "no_venue_record" } });
          continue;
        }

        await runVenueIngestExtraction({ venueId: venue.id, sourceUrl });
        await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "DONE", skipReason: null } });
        continue;
      }

      if (candidate.job.entityType === "ARTIST") {
        const existingArtist = await db.artist.findFirst({ where: { websiteUrl: candidate.url }, select: { id: true } });
        if (existingArtist) {
          await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "SKIPPED", skipReason: "already_known" } });
          continue;
        }

        const name = candidate.title?.trim() || "Unknown Artist";
        const normalizedName = normalize(candidate.title ?? "");
        await db.ingestExtractedArtist.create({
          data: {
            name,
            normalizedName,
            sourceUrl: candidate.url,
            searchQuery: "discovery",
            status: "PENDING",
            fingerprint: createHash("sha256").update(normalizedName).digest("hex"),
            confidenceScore: 30,
            confidenceBand: "LOW",
            extractionProvider: "discovery",
            mediums: [],
          },
        });

        await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "DONE", skipReason: null } });
        continue;
      }

      await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "SKIPPED", skipReason: "entity_type_not_supported" } });
    } catch (error) {
      console.error("cron_discovery_candidate_failed", { candidateId: candidate.id, error });
      await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "SKIPPED", skipReason: "processing_error" } });
    }
  }

  return Response.json({ processed, requestId: opts?.requestId ?? null }, { headers: { "Cache-Control": "no-store" } });
}
