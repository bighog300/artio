import type { PrismaClient } from "@prisma/client";
import { validateCronRequest } from "@/lib/cron-auth";
import {
  createCronRunId,
  logCronSummary,
  tryAcquireCronLock,
} from "@/lib/cron-runtime";
import { markCronFailure, markCronSuccess } from "@/lib/ops-metrics";
import { captureException, withSpan } from "@/lib/monitoring";
import { sendAlert } from "@/lib/alerts";
import { runRegionVenueGeneration } from "@/lib/ingest/run-region-venue-generation";
import { runRegionDiscovery } from "@/lib/ingest/run-region-discovery";

const CRON_NAME = "ingest_regions";
const ROUTE = "/api/cron/ingest/regions";
const STOP_REASON_TIME_BUDGET = "TIME_BUDGET_EXCEEDED";

function noStoreJson(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function withNoStore(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

function envInt(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

export async function runCronIngestRegions(
  cronSecret: string | null,
  db: PrismaClient,
  opts?: { requestId?: string },
): Promise<Response> {
  const authFailure = validateCronRequest(cronSecret, {
    route: ROUTE,
    requestId: opts?.requestId,
  });
  if (authFailure) return withNoStore(authFailure);

  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const cronRunId = createCronRunId();
  const timeBudgetMs = envInt("AI_INGEST_CRON_TIME_BUDGET_MS", 120_000);

  const lock = await tryAcquireCronLock(db, "cron:ingest:regions");
  if (!lock.acquired) {
    return noStoreJson({
      ok: false,
      reason: "lock_not_acquired",
      requestId: opts?.requestId ?? null,
    });
  }

  try {
    return await withSpan(
      "cron_ingest_regions",
      async () => {
        const settings = await db.siteSettings.findUnique({
          where: { id: "default" },
          select: {
            regionAutoPublishVenues: true,
            regionDiscoveryEnabled: true,
            regionMaxVenuesPerRun: true,
            openAiApiKey: true,
            googlePseApiKey: true,
            googlePseCx: true,
            braveSearchApiKey: true,
            venueGenerationModel: true,
          },
        });

        const regions = await db.ingestRegion.findMany({
          where: {
            status: { in: ["PENDING", "RUNNING"] },
            OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
          },
          orderBy: { createdAt: "asc" },
          take: settings?.regionMaxVenuesPerRun ?? 3,
          select: {
            id: true,
            country: true,
            region: true,
            venueGenDone: true,
            discoveryDone: true,
          },
        });

        let regionsProcessed = 0;
        let regionsSucceeded = 0;
        let regionsFailed = 0;
        let stopReason: string | null = null;

        for (const region of regions) {
          try {
            await db.ingestRegion.update({
              where: { id: region.id },
              data: { status: "RUNNING" },
            });

            if (!region.venueGenDone) {
              const openAiApiKey =
                settings?.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "";
              if (!openAiApiKey) {
                console.warn("cron_ingest_regions_openai_key_missing", {
                  regionId: region.id,
                  country: region.country,
                  region: region.region,
                });
              } else {
                await runRegionVenueGeneration({
                  regionId: region.id,
                  db,
                  openAiApiKey,
                  autoPublishVenues: settings?.regionAutoPublishVenues ?? false,
                  model: settings?.venueGenerationModel ?? undefined,
                });
              }
            }

            if (
              !region.discoveryDone &&
              settings?.regionDiscoveryEnabled !== false
            ) {
              await runRegionDiscovery({
                regionId: region.id,
                db,
                env: {
                  googlePseApiKey: settings?.googlePseApiKey,
                  googlePseCx: settings?.googlePseCx,
                  braveSearchApiKey: settings?.braveSearchApiKey,
                },
              });
            }

            const refreshed = await db.ingestRegion.findUnique({
              where: { id: region.id },
              select: { venueGenDone: true, discoveryDone: true },
            });

            if (refreshed?.venueGenDone && refreshed.discoveryDone) {
              await db.ingestRegion.update({
                where: { id: region.id },
                data: {
                  status: "SUCCEEDED",
                  lastRunAt: new Date(),
                  nextRunAt: new Date(
                    Date.now() + 7 * 24 * 60 * 60 * 1000,
                  ),
                  venueGenDone: false,
                  discoveryDone: false,
                  errorMessage: null,
                },
              });
              regionsSucceeded += 1;
            } else {
              await db.ingestRegion.update({
                where: { id: region.id },
                data: { status: "PENDING" },
              });
            }
          } catch (error) {
            regionsFailed += 1;
            await db.ingestRegion.update({
              where: { id: region.id },
              data: {
                status: "FAILED",
                errorMessage:
                  error instanceof Error ? error.message : "Unknown error",
              },
            });
            captureException(error, {
              route: ROUTE,
              requestId: opts?.requestId,
              cronRunId,
              userScope: false,
              regionId: region.id,
            });
          } finally {
            regionsProcessed += 1;
          }

          if (Date.now() - startedAtMs > timeBudgetMs) {
            stopReason = STOP_REASON_TIME_BUDGET;
            break;
          }
        }

        const summary = {
          ok: regionsFailed === 0,
          cronName: CRON_NAME,
          cronRunId,
          startedAt: startedAtIso,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAtMs,
          processedCount: regionsProcessed,
          errorCount: regionsFailed,
          dryRun: false,
          lock: lock.supported ? ("acquired" as const) : ("unsupported" as const),
          processed: regionsProcessed,
          succeeded: regionsSucceeded,
          failed: regionsFailed,
          stopReason,
          requestId: opts?.requestId ?? null,
        };

        logCronSummary(summary);

        if (summary.errorCount > 0) {
          await markCronFailure(
            CRON_NAME,
            `failed=${summary.errorCount}`,
            summary.finishedAt,
            cronRunId,
          );
          await sendAlert({
            severity: "error",
            title: "Cron ingest regions failures",
            body: `cron=${CRON_NAME} cronRunId=${cronRunId} failed=${summary.errorCount} durationMs=${summary.durationMs}`,
            tags: {
              cronName: CRON_NAME,
              cronRunId,
              errorCount: summary.errorCount,
              durationMs: summary.durationMs,
            },
          });
        } else {
          await markCronSuccess(CRON_NAME, summary.finishedAt, cronRunId);
        }

        return noStoreJson(
          {
            ok: true,
            processed: regionsProcessed,
            succeeded: regionsSucceeded,
            failed: regionsFailed,
            stopReason: stopReason ?? null,
            requestId: opts?.requestId ?? null,
          },
          200,
        );
      },
      {
        route: ROUTE,
        requestId: opts?.requestId,
        cronRunId,
        userScope: false,
      },
    );
  } catch (error) {
    captureException(error, {
      route: ROUTE,
      requestId: opts?.requestId,
      cronRunId,
      userScope: false,
    });
    const summary = {
      ok: false,
      cronName: CRON_NAME,
      cronRunId,
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      processedCount: 0,
      errorCount: 1,
      dryRun: false,
      lock: lock.supported ? ("acquired" as const) : ("unsupported" as const),
      error: {
        code: "internal_error",
        message: "Cron execution failed",
        details: undefined,
      },
    };
    await markCronFailure(CRON_NAME, "internal_error", summary.finishedAt, cronRunId);
    await sendAlert({
      severity: "error",
      title: "Cron ingest regions execution failed",
      body: `cron=${CRON_NAME} cronRunId=${cronRunId} durationMs=${summary.durationMs}`,
      tags: { cronName: CRON_NAME, cronRunId, durationMs: summary.durationMs },
    });
    logCronSummary(summary);
    return noStoreJson(summary, 500);
  } finally {
    await lock.release();
  }
}
