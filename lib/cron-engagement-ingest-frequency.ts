import type { PrismaClient, VenueIngestFrequency } from "@prisma/client";
import { validateCronRequest } from "@/lib/cron-auth";
import { createCronRunId, logCronSummary, tryAcquireCronLock } from "@/lib/cron-runtime";
import { captureException, withSpan } from "@/lib/monitoring";
import { markCronFailure, markCronSuccess } from "@/lib/ops-metrics";

const CRON_NAME = "engagement_ingest_frequency";
const ROUTE = "/api/cron/venues/update-ingest-frequency";
const LOOKBACK_DAYS = 30;
const HIGH_ACTIVITY_MIN_EVENTS = 5;
const HIGH_ACTIVITY_MIN_ENGAGEMENTS = 20;
const MEDIUM_ACTIVITY_MIN_EVENTS = 2;
const MEDIUM_ACTIVITY_MIN_ENGAGEMENTS = 5;

function classifyFrequency(
  publishedEventCount: number,
  engagementCount: number,
  currentFrequency: VenueIngestFrequency,
): VenueIngestFrequency | null {
  if (currentFrequency === "MANUAL") return null;
  if (publishedEventCount >= HIGH_ACTIVITY_MIN_EVENTS && engagementCount >= HIGH_ACTIVITY_MIN_ENGAGEMENTS) return "DAILY";
  if (publishedEventCount >= MEDIUM_ACTIVITY_MIN_EVENTS && engagementCount >= MEDIUM_ACTIVITY_MIN_ENGAGEMENTS) return "WEEKLY";
  return "MONTHLY";
}

export async function runCronEngagementIngestFrequency(
  cronSecret: string | null,
  { db }: { db: PrismaClient },
  meta: { requestId?: string; method?: string } = {},
): Promise<Response> {
  const authFailure = validateCronRequest(cronSecret, { route: ROUTE, ...meta });
  if (authFailure) return authFailure;

  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const cronRunId = createCronRunId();
  const lock = await tryAcquireCronLock(db, "cron:engagement:ingest-frequency");
  if (!lock.acquired) {
    const summary = {
      ok: true,
      cronName: CRON_NAME,
      cronRunId,
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      processedCount: 0,
      errorCount: 0,
      dryRun: false,
      lock: "skipped" as const,
      skipped: true,
      reason: "lock_not_acquired",
    };
    logCronSummary(summary);
    await markCronSuccess(CRON_NAME, summary.finishedAt, cronRunId);
    return Response.json(summary);
  }

  try {
    return await withSpan("cron:engagement_ingest_frequency", async () => {
      const since30d = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const venues = await db.venue.findMany({
        where: {
          status: "PUBLISHED",
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          ingestFrequency: true,
        },
      });

      const recentEvents = await db.event.findMany({
        where: {
          venueId: { in: venues.map((venue) => venue.id) },
          isPublished: true,
          startAt: { gte: since30d },
          deletedAt: null,
        },
        select: {
          id: true,
          venueId: true,
        },
      });

      const eventCountByVenueId = new Map<string, number>();
      const eventToVenueId = new Map<string, string>();
      for (const event of recentEvents) {
        if (!event.venueId) continue;
        eventToVenueId.set(event.id, event.venueId);
        eventCountByVenueId.set(event.venueId, (eventCountByVenueId.get(event.venueId) ?? 0) + 1);
      }

      const engagementCounts = recentEvents.length > 0
        ? await db.engagementEvent.groupBy({
          by: ["targetId"],
          where: {
            targetType: "EVENT",
            targetId: { in: recentEvents.map((event) => event.id) },
            createdAt: { gte: since30d },
          },
          _count: { id: true },
        })
        : [];

      const engagementCountByVenueId = new Map<string, number>();
      for (const row of engagementCounts) {
        const venueId = eventToVenueId.get(row.targetId);
        if (!venueId) continue;
        engagementCountByVenueId.set(venueId, (engagementCountByVenueId.get(venueId) ?? 0) + row._count.id);
      }

      let updatedCount = 0;
      let venueErrorCount = 0;
      for (const venue of venues) {
        const publishedEventCount = eventCountByVenueId.get(venue.id) ?? 0;
        const engagementCount = engagementCountByVenueId.get(venue.id) ?? 0;
        const newFrequency = classifyFrequency(publishedEventCount, engagementCount, venue.ingestFrequency);
        if (!newFrequency || newFrequency === venue.ingestFrequency) continue;

        await db.venue.update({
          where: { id: venue.id },
          data: { ingestFrequency: newFrequency },
        }).then(() => {
          updatedCount += 1;
          console.log("ingest_freq_updated", {
            venueId: venue.id,
            venueName: venue.name,
            from: venue.ingestFrequency,
            to: newFrequency,
            publishedEventCount,
            engagementCount,
          });
        }).catch((error: unknown) => {
          venueErrorCount += 1;
          console.warn("ingest_freq_update_failed", {
            venueId: venue.id,
            venueName: venue.name,
            from: venue.ingestFrequency,
            to: newFrequency,
            publishedEventCount,
            engagementCount,
            error,
          });
        });
      }

      const summary = {
        ok: venueErrorCount === 0,
        cronName: CRON_NAME,
        cronRunId,
        startedAt: startedAtIso,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        processedCount: venues.length,
        errorCount: venueErrorCount,
        dryRun: false,
        lock: lock.supported ? "acquired" as const : "unsupported" as const,
        venuesProcessed: venues.length,
        frequenciesUpdated: updatedCount,
      };
      logCronSummary(summary);
      if (summary.ok) {
        await markCronSuccess(CRON_NAME, summary.finishedAt, cronRunId);
      } else {
        await markCronFailure(CRON_NAME, `venue_update_errors=${venueErrorCount}`, summary.finishedAt, cronRunId);
      }
      return Response.json(summary, { status: summary.ok ? 200 : 207 });
    }, { route: ROUTE, requestId: meta.requestId, cronRunId, userScope: false });
  } catch (error) {
    captureException(error, { route: ROUTE, requestId: meta.requestId, cronRunId, userScope: false });
    const finishedAt = new Date().toISOString();
    await markCronFailure(CRON_NAME, "internal_error", finishedAt, cronRunId);
    return Response.json({
      ok: false,
      cronName: CRON_NAME,
      cronRunId,
      startedAt: startedAtIso,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      processedCount: 0,
      errorCount: 1,
      dryRun: false,
      lock: lock.supported ? "acquired" : "unsupported",
      error: { code: "internal_error", message: "Cron execution failed" },
    }, { status: 500 });
  } finally {
    await lock.release();
  }
}
