import { trackMetric } from "@/lib/telemetry";
import { captureException, withSpan } from "@/lib/monitoring";
import { sendAlert } from "@/lib/alerts";
import { markCronFailure, markCronSuccess } from "@/lib/ops-metrics";
import { Prisma } from "@prisma/client";
import { digestDedupeKey, digestSnapshotItemsSchema, filterEventsByRadius, isoWeekStamp, type DigestPreferenceUser } from "@/lib/digest";
import { runSavedSearchEvents } from "@/lib/saved-searches";
import { applyConservativeRanking, computeEngagementBoosts } from "@/lib/ranking";
import { validateCronRequest } from "@/lib/cron-auth";
import { createCronRunId, logCronSummary, shouldDryRun, tryAcquireCronLock } from "@/lib/cron-runtime";

const DIGEST_LIMIT = 25;
const DIGEST_MAX_DURATION_MS = 20_000;

export type DigestDb = {
  savedSearch: {
    findMany: (args: Prisma.SavedSearchFindManyArgs) => Promise<Array<{ id: string; userId: string; name: string; type: "NEARBY" | "EVENTS_FILTER" | "ARTWORK"; paramsJson: Prisma.JsonValue; lastSentAt: Date | null; user: DigestPreferenceUser }>>;
    update: (args: Prisma.SavedSearchUpdateArgs) => Promise<unknown>;
  };
  digestRun: {
    upsert: (args: Prisma.DigestRunUpsertArgs) => Promise<{ id: string }>;
  };
  notification: { upsert: (args: Prisma.NotificationUpsertArgs) => Promise<unknown> };
  engagementEvent?: {
    findMany: (args: Prisma.EngagementEventFindManyArgs) => Promise<Array<{ targetId: string }>>;
  };
  event: { findMany: (args: Prisma.EventFindManyArgs) => Promise<Array<{ id: string; title: string; slug: string; startAt: Date; lat: number | null; lng: number | null; venueId: string | null; venue: { name: string; slug: string; city: string | null; lat: number | null; lng: number | null } | null; eventTags: Array<{ tag: { name: string; slug: string } }>; eventArtists: Array<{ artistId: string }> }>> };
  $queryRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

export async function runWeeklyDigests(headerSecret: string | null, dryRunRaw: string | null | undefined, digestDb: DigestDb, meta: { requestId?: string; method?: string } = {}) {
  const authFailureResponse = validateCronRequest(headerSecret, { route: "/api/cron/digests/weekly", ...meta });
  if (authFailureResponse) return authFailureResponse;

  const route = "/api/cron/digests/weekly";
  const startedAt = new Date();
  const dryRun = shouldDryRun(dryRunRaw);
  const cronRunId = createCronRunId();
  const lock = await tryAcquireCronLock(digestDb, "cron:digests:weekly");
  if (!lock.acquired) {
    return Response.json({ ok: true, cronName: "digests_weekly", cronRunId, dryRun, skipped: "lock_not_acquired" }, { status: 202 });
  }

  try {
    return await withSpan("cron:digests_weekly", async () => {
      const now = new Date();
      const periodKey = isoWeekStamp(now);
      const threshold = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      const savedSearches = await digestDb.savedSearch.findMany({
        where: {
          isEnabled: true,
          frequency: "WEEKLY",
          OR: [{ lastSentAt: null }, { lastSentAt: { lt: threshold } }],
          user: { digestEnabled: true },
        },
        take: DIGEST_LIMIT,
        orderBy: [{ lastSentAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          userId: true,
          name: true,
          type: true,
          paramsJson: true,
          lastSentAt: true,
          user: {
            select: {
              digestEnabled: true,
              digestEventsOnly: true,
              digestRadiusKm: true,
              digestMaxEvents: true,
              locationLat: true,
              locationLng: true,
            },
          },
        },
      });

      let processed = 0;
      let sent = 0;
      let skipped = 0;
      let errorCount = 0;

      for (const search of savedSearches) {
        if (Date.now() - startedAt.getTime() >= DIGEST_MAX_DURATION_MS) {
          skipped += 1;
          continue;
        }

        if (search.user.digestEventsOnly && search.type === "ARTWORK") {
          skipped += 1;
          continue;
        }

        processed += 1;
        try {
          const digestMaxEvents = [5, 10, 20].includes(search.user.digestMaxEvents) ? search.user.digestMaxEvents : 10;
          const events = await runSavedSearchEvents({ eventDb: digestDb, type: search.type, paramsJson: search.paramsJson, limit: digestMaxEvents });
          const nearbyEvents = filterEventsByRadius(events, search.user);
          const boosts = digestDb.engagementEvent ? await computeEngagementBoosts(digestDb as never, search.userId, nearbyEvents) : new Map<string, number>();
          const page = applyConservativeRanking(nearbyEvents, boosts).slice(0, digestMaxEvents);
          if (!page.length) {
            skipped += 1;
            continue;
          }

          if (dryRun) {
            sent += 1;
            continue;
          }

          const snapshotItems = digestSnapshotItemsSchema.parse(page.map((event) => ({
            id: event.id,
            slug: event.slug,
            title: event.title,
            startAt: event.startAt.toISOString(),
            venueName: event.venue?.name ?? null,
          })));

          const digestRun = await digestDb.digestRun.upsert({
            where: { savedSearchId_periodKey: { savedSearchId: search.id, periodKey } },
            update: {
              itemCount: snapshotItems.length,
              itemsJson: snapshotItems,
            },
            create: {
              savedSearchId: search.id,
              userId: search.userId,
              periodKey,
              itemCount: snapshotItems.length,
              itemsJson: snapshotItems,
            },
            select: { id: true },
          });

          const dedupeKey = digestDedupeKey(search.id, now);
          await digestDb.notification.upsert({
            where: { dedupeKey },
            update: {},
            create: {
              userId: search.userId,
              type: "DIGEST_READY",
              title: "Your weekly Artio digest",
              body: `${page.length} upcoming events match '${search.name}'`,
              href: `/digests/${digestRun.id}`,
              dedupeKey,
            },
          });
          await digestDb.savedSearch.update({ where: { id: search.id }, data: { lastSentAt: now } });
          sent += 1;
        } catch {
          errorCount += 1;
        }
      }

      trackMetric("cron.digest.processed", processed, { sent, skipped, dryRun, errorCount });
      const summary = {
        ok: true,
        cronName: "digests_weekly",
        cronRunId,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        processedCount: processed,
        errorCount,
        dryRun,
        sent,
        skipped,
        limit: DIGEST_LIMIT,
        lock: lock.supported ? "acquired" : "unsupported",
      } as const;
      logCronSummary(summary);
      if (summary.errorCount > 0) {
        await markCronFailure(summary.cronName, `errorCount=${summary.errorCount}`, summary.finishedAt, summary.cronRunId);
        await sendAlert({ severity: "error", title: "Cron digest failures", body: `cron=${summary.cronName} cronRunId=${summary.cronRunId} durationMs=${summary.durationMs} errors=${summary.errorCount}`, tags: { cronName: summary.cronName, cronRunId: summary.cronRunId, errorCount: summary.errorCount, durationMs: summary.durationMs } });
      } else {
        await markCronSuccess(summary.cronName, summary.finishedAt, summary.cronRunId);
      }
      return Response.json(summary);
    }, { route, requestId: meta.requestId, cronRunId, userScope: false });
  } catch (error) {
    captureException(error, { route: "/api/cron/digests/weekly", requestId: meta.requestId, cronRunId, userScope: false });
    await markCronFailure("digests_weekly", "internal_error", new Date().toISOString(), cronRunId);
    await sendAlert({ severity: "error", title: "Cron execution failed", body: `cron=digests_weekly cronRunId=${cronRunId}` , tags: { cronName: "digests_weekly", cronRunId } });
    return Response.json({ ok: false, cronName: "digests_weekly", cronRunId, error: { code: "internal_error", message: "Cron execution failed", details: undefined } }, { status: 500 });
  } finally {
    await lock.release();
  }
}
