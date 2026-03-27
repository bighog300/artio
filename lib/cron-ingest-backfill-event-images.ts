import { z } from "zod";
import { db } from "@/lib/db";
import { extractCronSecret, validateCronRequest } from "@/lib/cron-auth";
import { createCronRunId, logCronSummary, tryAcquireCronLock } from "@/lib/cron-runtime";
import { importApprovedEventImage } from "@/lib/ingest/import-approved-event-image";
import { logWarn } from "@/lib/logging";

const CRON_NAME = "ingest_backfill_event_images";
const ROUTE = "/api/cron/ingest/backfill-event-images";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

function noStoreJson(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleBackfillEventImagesCron(req: Request) {
  const authFailure = validateCronRequest(extractCronSecret(req.headers), {
    route: ROUTE,
    method: req.method,
  });
  if (authFailure) return authFailure;

  const cronRunId = createCronRunId();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  if (process.env.AI_INGEST_IMAGE_ENABLED !== "1") {
    return noStoreJson({
      ok: true,
      cronName: CRON_NAME,
      cronRunId,
      skipped: true,
      reason: "AI_INGEST_IMAGE_ENABLED not set",
    });
  }

  const lock = await tryAcquireCronLock(db, CRON_NAME);
  if (!lock.acquired) {
    return noStoreJson(
      { ok: true, cronName: CRON_NAME, cronRunId, skipped: true, reason: "lock_not_acquired" },
      202,
    );
  }

  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
    if (!parsed.success) {
      return noStoreJson(
        { ok: false, cronName: CRON_NAME, cronRunId, error: "invalid_query" },
        400,
      );
    }

    const events = await db.event.findMany({
      where: {
        isPublished: true,
        deletedAt: null,
        featuredAssetId: null,
        images: { none: {} },
      },
      select: {
        id: true,
        title: true,
        venueId: true,
        ingestExtractedCandidate: {
          select: {
            id: true,
            runId: true,
            imageUrl: true,
            sourceUrl: true,
          },
        },
        venue: { select: { websiteUrl: true } },
      },
      orderBy: { startAt: "desc" },
      take: parsed.data.limit,
    });

    let attached = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of events) {
      const candidate = event.ingestExtractedCandidate;
      try {
        const result = await importApprovedEventImage({
          appDb: db,
          candidateId: candidate?.id ?? event.id,
          runId: candidate?.runId ?? event.id,
          eventId: event.id,
          venueId: event.venueId ?? "",
          title: event.title,
          sourceUrl: candidate?.sourceUrl ?? null,
          venueWebsiteUrl: event.venue?.websiteUrl ?? null,
          candidateImageUrl: candidate?.imageUrl ?? null,
          requestId: `backfill-event-images-${event.id}`,
        });

        if (result.attached) {
          attached += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        logWarn({ message: "cron_backfill_event_images_failed",
          eventId: event.id,
          error,
        });
      }
    }

    const summary = {
      ok: true,
      cronName: CRON_NAME,
      cronRunId,
      startedAt,
      finishedAt: new Date(Date.now()).toISOString(),
      durationMs: Date.now() - startedAtMs,
      processedCount: events.length,
      errorCount: failed,
      dryRun: false,
      lock: lock.supported ? ("acquired" as const) : ("unsupported" as const),
      processedEvents: events.length,
      attached,
      skipped,
      failed,
    };

    logCronSummary(summary);
    return noStoreJson(summary);
  } finally {
    await lock.release();
  }
}
