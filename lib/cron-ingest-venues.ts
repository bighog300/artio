import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { validateCronRequest } from "@/lib/cron-auth";
import { createCronRunId, logCronSummary, shouldDryRun, tryAcquireCronLock } from "@/lib/cron-runtime";
import { captureException, withSpan } from "@/lib/monitoring";
import { sendAlert } from "@/lib/alerts";
import { markCronFailure, markCronSuccess } from "@/lib/ops-metrics";
import { runVenueIngestExtraction } from "@/lib/ingest/extraction-pipeline";
import { autoApproveEventCandidate } from "@/lib/ingest/auto-approve-event-candidate";
import { autoApproveArtistCandidate } from "@/lib/ingest/auto-approve-artist-candidate";
import { autoApproveArtworkCandidate } from "@/lib/ingest/auto-approve-artwork-candidate";

const CRON_NAME = "ingest_venues";
const ROUTE = "/api/cron/ingest/venues";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const DEFAULT_MIN_HOURS_SINCE_LAST_RUN = 24;
const MAX_SCAN_VENUES = 125;

const STOP_REASON_TOTAL_CAP = "CRON_TOTAL_CAP_REACHED";
const STOP_REASON_TIME_BUDGET = "TIME_BUDGET_EXCEEDED";
const STOP_REASON_CIRCUIT_OPEN = "circuit_breaker_open";

const alertDedup = new Map<string, number>();

const querySchema = z.object({
  dryRun: z.enum(["1", "true"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  minHoursSinceLastRun: z.coerce.number().int().min(1).max(24 * 14).default(DEFAULT_MIN_HOURS_SINCE_LAST_RUN),
});

type IngestVenueDb = {
  venue: {
    findMany: (args: {
      where:
        | { websiteUrl: { not: null }; isPublished: true; deletedAt: null }
        | {
          deletedAt: null;
          OR: Array<
            | { isPublished: true; websiteUrl: { not: null } }
            | { aiGenerated: true; isPublished: false; status: { not: string }; eventsPageUrl: { not: null } }
          >;
        };
      orderBy: { updatedAt: "asc" };
      take: number;
      select: { id: true; websiteUrl: true; eventsPageUrl: true; aiGenerated: true; ingestFrequency: true };
    }) => Promise<Array<{ id: string; websiteUrl: string | null; eventsPageUrl: string | null; aiGenerated: boolean; ingestFrequency: "DAILY" | "WEEKLY" | "MONTHLY" | "MANUAL" }>>;
  };
  ingestRun: {
    findFirst: (args: {
      where: { venueId: string; status: { in: Array<"RUNNING" | "SUCCEEDED"> } };
      orderBy: { createdAt: "desc" };
      select: { createdAt: true };
    }) => Promise<{ createdAt: Date } | null>;
    findMany: (args: {
      where: { createdAt: { gte: Date; lte?: Date } };
      select: { status?: true; errorCode?: true; createdAt?: true };
      orderBy?: { createdAt: "desc" };
      take?: number;
    }) => Promise<Array<{ status?: "RUNNING" | "SUCCEEDED" | "FAILED" | "PENDING"; errorCode?: string | null; createdAt?: Date }>>;
  };
  ingestExtractedEvent: {
    findMany: (args: {
      where: { venueId: string; status: "PENDING"; confidenceBand: "HIGH"; duplicateOfId: null };
      select: { id: true };
      orderBy: { createdAt: "desc" };
      take: number;
    }) => Promise<Array<{ id: string }>>;
  };
  event: {
    findMany: (args: {
      where: { venueId: string; deletedAt: null };
      select: { id: true };
    }) => Promise<Array<{ id: string }>>;
  };
  ingestExtractedArtist: {
    findMany: (args: {
      where: {
        status: "PENDING";
        confidenceBand: "HIGH";
        eventLinks: { some: { eventId: { in: string[] } } };
      };
      select: { id: true };
      take: number;
    }) => Promise<Array<{ id: string }>>;
  };
  ingestExtractedArtwork: {
    findMany: (args: {
      where: {
        status: "PENDING";
        confidenceBand: "HIGH";
        sourceEvent: { venueId: string };
      };
      select: { id: true };
      take: number;
    }) => Promise<Array<{ id: string }>>;
  };
  $queryRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  siteSettings?: {
    findUnique: (args: {
      where: { id: string };
      select: {
        ingestEnabled: true;
        ingestImageEnabled: true;
        regionAutoPublishEvents: true;
        regionAutoPublishArtists: true;
        regionAutoPublishArtworks: true;
      };
    }) => Promise<{
      ingestEnabled: boolean;
      ingestImageEnabled: boolean;
      regionAutoPublishEvents: boolean;
      regionAutoPublishArtists: boolean;
      regionAutoPublishArtworks: boolean;
    } | null>;
  };
};

type IngestExtractionRunner = typeof runVenueIngestExtraction;

function noStoreJson(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
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

function envFloat(name: string, fallback: number) {
  const parsed = Number.parseFloat(process.env[name] ?? "");
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function shouldSendDedupedAlert(key: string, nowMs: number, windowMs = 24 * 60 * 60 * 1000) {
  const lastSent = alertDedup.get(key) ?? 0;
  if (nowMs - lastSent < windowMs) return false;
  alertDedup.set(key, nowMs);
  return true;
}

function minLastRunAtForVenue(
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "MANUAL",
  now: Date,
): Date {
  const ms =
    frequency === "DAILY"
      ? 20 * 60 * 60 * 1000
      : frequency === "MONTHLY"
        ? 25 * 24 * 60 * 60 * 1000
        : 6 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

export async function runCronIngestVenues(
  headerSecret: string | null,
  rawQuery: Record<string, string>,
  cronDb: IngestVenueDb,
  meta: { requestId?: string; method?: string } = {},
  deps: {
    runExtraction?: IngestExtractionRunner;
    now?: () => number;
  } = {},
) {
  const authFailureResponse = validateCronRequest(headerSecret, { route: ROUTE, ...meta });
  if (authFailureResponse) return withNoStore(authFailureResponse);

  const now = deps.now ?? Date.now;
  const startedAtMs = now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const cronRunId = createCronRunId();

  const normalizedQuery = { ...rawQuery };
  if (shouldDryRun(rawQuery.dryRun)) normalizedQuery.dryRun = "true";

  const parsed = querySchema.safeParse(normalizedQuery);
  if (!parsed.success) {
    return noStoreJson({
      ok: false,
      cronName: CRON_NAME,
      cronRunId,
      error: { code: "invalid_query", message: "Invalid cron query", details: parsed.error.flatten() },
    }, 400);
  }

  const maxVenuesFromEnv = Math.min(MAX_LIMIT, envInt("AI_INGEST_CRON_MAX_VENUES", DEFAULT_LIMIT));
  const enforcedLimit = Math.min(parsed.data.limit, maxVenuesFromEnv);
  const maxTotalCreated = envInt("AI_INGEST_CRON_MAX_TOTAL_CREATED_CANDIDATES", 100);
  const timeBudgetMs = envInt("AI_INGEST_CRON_TIME_BUDGET_MS", 120_000);
  const cbWindowHours = envInt("AI_INGEST_CRON_CIRCUIT_BREAKER_WINDOW_HOURS", 6);
  const cbMinRuns = envInt("AI_INGEST_CRON_CIRCUIT_BREAKER_MIN_RUNS", 5);
  const cbFailRate = envFloat("AI_INGEST_CRON_CIRCUIT_BREAKER_FAIL_RATE", 0.6);
  const ingestUnpublished = process.env.AI_INGEST_UNPUBLISHED_VENUES === "1";

  const dryRun = parsed.data.dryRun === "true";
  const lock = await tryAcquireCronLock(cronDb, "cron:ingest:venues");
  if (!lock.acquired) {
    const summary = {
      ok: true,
      cronName: CRON_NAME,
      cronRunId,
      startedAt: startedAtIso,
      finishedAt: new Date(now()).toISOString(),
      durationMs: now() - startedAtMs,
      processedCount: 0,
      errorCount: 0,
      dryRun,
      lock: "skipped" as const,
      skipped: true,
      reason: "lock_not_acquired",
    };
    logCronSummary(summary);
    await markCronSuccess(CRON_NAME, summary.finishedAt, cronRunId);
    return noStoreJson(summary);
  }

  try {
    const settings = await cronDb.siteSettings?.findUnique({
      where: { id: "default" },
      select: {
        ingestEnabled: true,
        ingestImageEnabled: true,
        regionAutoPublishEvents: true,
        regionAutoPublishArtists: true,
        regionAutoPublishArtworks: true,
      },
    });

    return await withSpan("cron:ingest_venues", async () => {
      const ingestEnabled = settings?.ingestEnabled ?? (process.env.AI_INGEST_ENABLED === "1");
      if (!ingestEnabled) {
        const summary = {
          ok: true,
          cronName: CRON_NAME,
          cronRunId,
          startedAt: startedAtIso,
          finishedAt: new Date(now()).toISOString(),
          durationMs: now() - startedAtMs,
          processedCount: 0,
          errorCount: 0,
          dryRun,
          lock: lock.supported ? "acquired" as const : "unsupported" as const,
          skipped: true,
          reason: "ingest_disabled",
        };
        logCronSummary(summary);
        await markCronSuccess(CRON_NAME, summary.finishedAt, cronRunId);
        return noStoreJson(summary);
      }

      process.env.AI_INGEST_IMAGE_PREFETCH_ENABLED = (settings?.ingestImageEnabled ?? (process.env.AI_INGEST_IMAGE_PREFETCH_ENABLED === "1")) ? "1" : "0";

      const cbWindowStart = new Date(now() - cbWindowHours * 60 * 60 * 1000);
      const recentRuns = await cronDb.ingestRun.findMany({
        where: { createdAt: { gte: cbWindowStart } },
        select: { status: true, errorCode: true },
      });
      const succeededRuns = recentRuns.filter((run) => run.status === "SUCCEEDED").length;
      const failedRuns = recentRuns.filter((run) => run.status === "FAILED").length;
      const runCount = succeededRuns + failedRuns;
      const failRate = runCount > 0 ? failedRuns / runCount : 0;
      const circuitOpen = runCount >= cbMinRuns && failRate >= cbFailRate;

      if (circuitOpen) {
        if (shouldSendDedupedAlert(`circuit:${CRON_NAME}`, now())) {
          await sendAlert({
            severity: "warn",
            title: "AI ingest circuit breaker open",
            body: `cron=${CRON_NAME} runCount=${runCount} failRate=${failRate.toFixed(2)} windowHours=${cbWindowHours}`,
            tags: { cronName: CRON_NAME, runCount, failRate: Number(failRate.toFixed(4)), windowHours: cbWindowHours },
          });
        }

        const summary = {
          ok: true,
          cronName: CRON_NAME,
          cronRunId,
          startedAt: startedAtIso,
          finishedAt: new Date(now()).toISOString(),
          durationMs: now() - startedAtMs,
          processedCount: 0,
          errorCount: 0,
          dryRun,
          lock: lock.supported ? "acquired" as const : "unsupported" as const,
          skipped: true,
          reason: STOP_REASON_CIRCUIT_OPEN,
          circuitBreaker: { open: true, failRate, runCount, windowHours: cbWindowHours },
        };
        logCronSummary(summary);
        await markCronSuccess(CRON_NAME, summary.finishedAt, cronRunId);
        return noStoreJson(summary);
      }

      const sourceVenues = await cronDb.venue.findMany({
        where: ingestUnpublished
          ? {
            deletedAt: null,
            OR: [
              {
                isPublished: true,
                websiteUrl: { not: null },
              },
              {
                aiGenerated: true,
                isPublished: false,
                // Excludes ONBOARDING venues — those must be published via the onboard route first
                status: { not: "ONBOARDING" },
                eventsPageUrl: { not: null },
              },
            ],
          }
          : {
            websiteUrl: { not: null },
            isPublished: true,
            deletedAt: null,
          },
        orderBy: { updatedAt: "asc" },
        take: Math.min(MAX_SCAN_VENUES, Math.max(enforcedLimit * 5, enforcedLimit)),
        select: { id: true, websiteUrl: true, eventsPageUrl: true, aiGenerated: true, ingestFrequency: true },
      });

      const venueState = await Promise.all(sourceVenues.map(async (venue) => {
        const latestRun = await cronDb.ingestRun.findFirst({
          where: { venueId: venue.id, status: { in: ["RUNNING", "SUCCEEDED"] } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });

        return {
          venue,
          lastRunAt: latestRun?.createdAt ?? null,
        };
      }));

      const eligibleVenues = venueState
        .filter((item) => item.venue.ingestFrequency !== "MANUAL")
        .filter((item) =>
          (
            (typeof item.venue.eventsPageUrl === "string" && item.venue.eventsPageUrl.trim().length > 0)
            || (typeof item.venue.websiteUrl === "string" && item.venue.websiteUrl.trim().length > 0)
          )
          && (!item.lastRunAt || item.lastRunAt < minLastRunAtForVenue(item.venue.ingestFrequency, new Date(now())))
        )
        .sort((a, b) => {
          if (!a.lastRunAt && !b.lastRunAt) return 0;
          if (!a.lastRunAt) return -1;
          if (!b.lastRunAt) return 1;
          return a.lastRunAt.getTime() - b.lastRunAt.getTime();
        })
        .slice(0, enforcedLimit);

      let succeeded = 0;
      let failed = 0;
      let createdCandidates = 0;
      let dedupedCandidates = 0;
      let autoApprovedArtists = 0;
      let autoApprovedArtworks = 0;
      let stopReason: string | null = null;
      const venueResults: Array<Record<string, unknown>> = [];
      const runExtraction = deps.runExtraction ?? runVenueIngestExtraction;

      for (const item of eligibleVenues) {
        if (!dryRun && createdCandidates >= maxTotalCreated) {
          stopReason = STOP_REASON_TOTAL_CAP;
          break;
        }

        if (!dryRun && now() - startedAtMs >= timeBudgetMs) {
          stopReason = STOP_REASON_TIME_BUDGET;
          break;
        }

        if (dryRun) {
          venueResults.push({ venueId: item.venue.id, status: "would_run" });
          continue;
        }

        try {
          const sourceUrl = item.venue.eventsPageUrl ?? item.venue.websiteUrl ?? null;
          if (!sourceUrl) {
            venueResults.push({ venueId: item.venue.id, status: "failed", errorCode: "MISSING_SOURCE_URL" });
            failed += 1;
            continue;
          }
          const result = await runExtraction({ venueId: item.venue.id, sourceUrl });

          const autoPublishEvents = settings?.regionAutoPublishEvents ?? false;
          if (autoPublishEvents && result.createdCount > 0) {
            const highCandidates = await cronDb.ingestExtractedEvent.findMany({
              where: {
                venueId: item.venue.id,
                status: "PENDING",
                confidenceBand: "HIGH",
                duplicateOfId: null,
              },
              select: { id: true },
              orderBy: { createdAt: "desc" },
              take: 50,
            });

            for (const c of highCandidates) {
              await autoApproveEventCandidate({
                candidateId: c.id,
                db: cronDb as unknown as PrismaClient,
                autoPublish: true,
              }).catch((err) => console.warn("auto_approve_event_cron_failed", { candidateId: c.id, err }));
            }
          }

          const autoPublishArtists = settings?.regionAutoPublishArtists ?? false;
          if (autoPublishArtists) {
            const linkedEventIds = await cronDb.event.findMany({
              where: { venueId: item.venue.id, deletedAt: null },
              select: { id: true },
            }).then((rows) => rows.map((row) => row.id));

            if (linkedEventIds.length > 0) {
              const highArtistCandidates = await cronDb.ingestExtractedArtist.findMany({
                where: {
                  status: "PENDING",
                  confidenceBand: "HIGH",
                  eventLinks: {
                    some: { eventId: { in: linkedEventIds } },
                  },
                },
                select: { id: true },
                take: 20,
              });

              for (const c of highArtistCandidates) {
                const approvedArtist = await autoApproveArtistCandidate({
                  candidateId: c.id,
                  db: cronDb as unknown as PrismaClient,
                  autoPublish: true,
                }).catch((err) => {
                  console.warn("auto_approve_artist_cron_failed", {
                    candidateId: c.id,
                    err,
                  });
                  return null;
                });
                if (approvedArtist) autoApprovedArtists += 1;
              }
            }
          }

          const autoPublishArtworks = settings?.regionAutoPublishArtworks ?? false;
          if (autoPublishArtworks) {
            const highArtworkCandidates = await cronDb.ingestExtractedArtwork.findMany({
              where: {
                status: "PENDING",
                confidenceBand: "HIGH",
                sourceEvent: { venueId: item.venue.id },
              },
              select: { id: true },
              take: 20,
            });

            for (const c of highArtworkCandidates) {
              const approvedArtwork = await autoApproveArtworkCandidate({
                candidateId: c.id,
                db: cronDb as unknown as PrismaClient,
                autoPublish: true,
              }).catch((err) => {
                console.warn("auto_approve_artwork_cron_failed", {
                  candidateId: c.id,
                  err,
                });
                return null;
              });
              if (approvedArtwork) autoApprovedArtworks += 1;
            }
          }

          succeeded += 1;
          createdCandidates += result.createdCount;
          dedupedCandidates += result.dedupedCount;
          venueResults.push({
            venueId: item.venue.id,
            runId: result.runId,
            status: "succeeded",
            sourceUrl,
            aiGenerated: item.venue.aiGenerated,
            usedEventsPageUrl: Boolean(item.venue.eventsPageUrl?.trim()),
            createdCount: result.createdCount,
            dedupedCount: result.dedupedCount,
          });
        } catch (error) {
          failed += 1;
          const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "INGEST_FAILED";
          venueResults.push({ venueId: item.venue.id, status: "failed", errorCode });
        }
      }

      const badModelOutputCount = recentRuns.filter((run) => run.errorCode === "BAD_MODEL_OUTPUT").length;
      if (!dryRun && badModelOutputCount >= 3 && shouldSendDedupedAlert(`bad_model_output:${CRON_NAME}`, now())) {
        await sendAlert({
          severity: "warn",
          title: "AI ingest repeated BAD_MODEL_OUTPUT failures",
          body: `cron=${CRON_NAME} badModelOutputCount=${badModelOutputCount} windowHours=${cbWindowHours}`,
          tags: { cronName: CRON_NAME, badModelOutputCount, windowHours: cbWindowHours },
        });
      }

      const summary = {
        ok: failed === 0,
        cronName: CRON_NAME,
        cronRunId,
        startedAt: startedAtIso,
        finishedAt: new Date(now()).toISOString(),
        durationMs: now() - startedAtMs,
        processedCount: dryRun ? 0 : succeeded + failed,
        errorCount: failed,
        dryRun,
        lock: lock.supported ? "acquired" as const : "unsupported" as const,
        considered: venueState.length,
        selected: eligibleVenues.length,
        runCount: dryRun ? 0 : succeeded + failed,
        wouldRun: dryRun ? eligibleVenues.length : 0,
        succeeded,
        failed,
        createdCandidates,
        dedupedCandidates,
        autoApprovedArtists,
        autoApprovedArtworks,
        stopReason,
        limit: enforcedLimit,
        minHoursSinceLastRun: parsed.data.minHoursSinceLastRun,
        ingestUnpublished,
        venues: venueResults,
        circuitBreaker: { open: false, failRate, runCount, windowHours: cbWindowHours },
      };

      logCronSummary(summary);
      if (!dryRun && (stopReason === STOP_REASON_TOTAL_CAP || stopReason === STOP_REASON_TIME_BUDGET)) {
        await sendAlert({
          severity: "info",
          title: "AI ingest cron guardrail reached",
          body: `cron=${CRON_NAME} stopReason=${stopReason} createdCandidates=${createdCandidates} durationMs=${summary.durationMs}`,
          tags: { cronName: CRON_NAME, stopReason, createdCandidates, durationMs: summary.durationMs },
        });
      }

      if (summary.errorCount > 0) {
        await markCronFailure(CRON_NAME, `failed=${summary.errorCount}`, summary.finishedAt, cronRunId);
        await sendAlert({
          severity: "error",
          title: "Cron ingest venue extraction failures",
          body: `cron=${CRON_NAME} cronRunId=${cronRunId} failed=${summary.errorCount} durationMs=${summary.durationMs}`,
          tags: { cronName: CRON_NAME, cronRunId, errorCount: summary.errorCount, durationMs: summary.durationMs },
        });
      } else {
        await markCronSuccess(CRON_NAME, summary.finishedAt, cronRunId);
      }

      return noStoreJson(summary, summary.ok ? 200 : 500);
    }, { route: ROUTE, requestId: meta.requestId, cronRunId, userScope: false });
  } catch (error) {
    captureException(error, { route: ROUTE, requestId: meta.requestId, cronRunId, userScope: false });
    const summary = {
      ok: false,
      cronName: CRON_NAME,
      cronRunId,
      startedAt: startedAtIso,
      finishedAt: new Date(now()).toISOString(),
      durationMs: now() - startedAtMs,
      processedCount: 0,
      errorCount: 1,
      dryRun,
      lock: lock.supported ? "acquired" as const : "unsupported" as const,
      error: { code: "internal_error", message: "Cron execution failed", details: undefined },
    };
    await markCronFailure(CRON_NAME, "internal_error", summary.finishedAt, cronRunId);
    await sendAlert({
      severity: "error",
      title: "Cron execution failed",
      body: `cron=${CRON_NAME} cronRunId=${cronRunId} durationMs=${summary.durationMs}`,
      tags: { cronName: CRON_NAME, cronRunId, durationMs: summary.durationMs },
    });
    logCronSummary(summary);
    return noStoreJson(summary, 500);
  } finally {
    await lock.release();
  }
}
