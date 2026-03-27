import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createCronRunId, logCronSummary, tryAcquireCronLock } from "@/lib/cron-runtime";
import { markCronFailure, markCronSuccess } from "@/lib/ops-metrics";
import { captureException } from "@/lib/monitoring";
import { sendAlert } from "@/lib/alerts";
import { validateCronRequest } from "@/lib/cron-auth";
import { runVenueIngestExtraction } from "@/lib/ingest/extraction-pipeline";
import { createVenueStubFromCandidate } from "@/lib/ingest/create-venue-stub-from-candidate";
import { logError } from "@/lib/logging";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function runCronIngestDiscovery(
  cronSecret: string | null,
  db: PrismaClient,
  opts?: { requestId?: string },
): Promise<Response> {
  const CRON_NAME = "ingest_discovery";
  const ROUTE = "/api/cron/ingest/discovery";
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const cronRunId = createCronRunId();

  const authFailure = validateCronRequest(cronSecret, { route: ROUTE, requestId: opts?.requestId });
  if (authFailure) return authFailure;

  const lock = await tryAcquireCronLock(db, "cron:ingest:discovery");
  if (!lock.acquired) {
    return Response.json(
      { ok: false, reason: "lock_not_acquired", requestId: opts?.requestId ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    let errorCount = 0;

    const candidates = await db.ingestDiscoveryCandidate.findMany({
      where: {
        OR: [
          { status: "PENDING" },
          {
            status: "QUEUED",
            updatedAt: { lte: new Date(Date.now() - 10 * 60 * 1000) },
          },
        ],
      },
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
        errorCount += 1;
        logError({ message: "cron_discovery_candidate_failed", candidateId: candidate.id, error });
        await db.ingestDiscoveryCandidate.update({ where: { id: candidate.id }, data: { status: "SKIPPED", skipReason: "processing_error" } });
      }
    }

    const finishedAt = new Date().toISOString();
    const summary = {
      ok: errorCount === 0,
      cronName: CRON_NAME,
      cronRunId,
      startedAt: startedAtIso,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      processedCount: processed,
      errorCount,
      dryRun: false,
      lock: lock.supported ? ("acquired" as const) : ("unsupported" as const),
      requestId: opts?.requestId ?? null,
    };
    logCronSummary(summary);

    if (errorCount > 0) {
      await markCronFailure(CRON_NAME, `failed=${errorCount}`, finishedAt, cronRunId);
      await sendAlert({
        severity: "error",
        title: "Cron ingest discovery failures",
        body: `cron=${CRON_NAME} cronRunId=${cronRunId} failed=${errorCount} durationMs=${summary.durationMs}`,
        tags: { cronName: CRON_NAME, cronRunId, errorCount, durationMs: summary.durationMs },
      });
    } else {
      await markCronSuccess(CRON_NAME, finishedAt, cronRunId);
    }

    return Response.json(
      { ok: true, processed, errorCount, requestId: opts?.requestId ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    captureException(error, { route: ROUTE, requestId: opts?.requestId, cronRunId, userScope: false });
    await markCronFailure(CRON_NAME, "internal_error", new Date().toISOString(), cronRunId);
    return Response.json(
      { ok: false, error: "internal_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    await lock.release();
  }
}
