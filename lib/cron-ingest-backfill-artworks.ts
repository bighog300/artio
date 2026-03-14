import { z } from "zod";
import { db } from "@/lib/db";
import { extractCronSecret, validateCronRequest } from "@/lib/cron-auth";
import { createCronRunId, logCronSummary, tryAcquireCronLock } from "@/lib/cron-runtime";
import { extractArtworksForEvent } from "@/lib/ingest/artwork-extraction";

const CRON_NAME = "ingest_backfill_artworks";
const ROUTE = "/api/cron/ingest/backfill-artworks";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

type BackfillArtworksDeps = {
  db: {
    event: {
      findMany: (args: {
        where: {
          isPublished: true;
          deletedAt: null;
          artworkEvents: { none: Record<string, never> };
        };
        select: {
          id: true;
          ingestExtractedCandidate: { select: { sourceUrl: true } };
          venue: { select: { websiteUrl: true; eventsPageUrl: true } };
        };
        orderBy: { startAt: "desc" };
        take: number;
      }) => Promise<Array<{
        id: string;
        ingestExtractedCandidate: { sourceUrl: string } | null;
        venue: { websiteUrl: string | null; eventsPageUrl: string | null } | null;
      }>>;
    };
    siteSettings: {
      findUnique: (args: {
        where: { id: "default" };
        select: {
          artworkExtractionProvider: true;
          geminiApiKey: true;
          anthropicApiKey: true;
          openAiApiKey: true;
        };
      }) => Promise<{
        artworkExtractionProvider: string | null;
        geminiApiKey: string | null;
        anthropicApiKey: string | null;
        openAiApiKey: string | null;
      } | null>;
    };
  };
  extractArtworksForEvent: typeof extractArtworksForEvent;
  extractCronSecret: typeof extractCronSecret;
  validateCronRequest: typeof validateCronRequest;
  tryAcquireCronLock: typeof tryAcquireCronLock;
  createCronRunId: typeof createCronRunId;
  logCronSummary: typeof logCronSummary;
  now: () => number;
};

const defaultDeps: BackfillArtworksDeps = {
  db: db as never,
  extractArtworksForEvent,
  extractCronSecret,
  validateCronRequest,
  tryAcquireCronLock,
  createCronRunId,
  logCronSummary,
  now: Date.now,
};

function noStoreJson(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleBackfillArtworksCron(req: Request, deps: BackfillArtworksDeps = defaultDeps) {
  const authFailure = deps.validateCronRequest(deps.extractCronSecret(req.headers), { route: ROUTE, method: req.method });
  if (authFailure) return authFailure;

  const cronRunId = deps.createCronRunId();
  const startedAtMs = deps.now();
  const startedAt = new Date(startedAtMs).toISOString();

  if (process.env.AI_ARTWORK_INGEST_ENABLED !== "1") {
    return noStoreJson({ ok: true, cronName: CRON_NAME, cronRunId, skipped: true, reason: "AI_ARTWORK_INGEST_ENABLED not set" });
  }

  const lock = await deps.tryAcquireCronLock(deps.db, CRON_NAME);
  if (!lock.acquired) {
    return noStoreJson({ ok: true, cronName: CRON_NAME, cronRunId, skipped: true, reason: "lock_not_acquired" }, 202);
  }

  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) {
      return noStoreJson({ ok: false, cronName: CRON_NAME, cronRunId, error: "invalid_query", details: parsed.error.flatten() }, 400);
    }

    const settings = await deps.db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        artworkExtractionProvider: true,
        geminiApiKey: true,
        anthropicApiKey: true,
        openAiApiKey: true,
      },
    });

    const events = await deps.db.event.findMany({
      where: {
        isPublished: true,
        deletedAt: null,
        artworkEvents: { none: {} },
      },
      select: {
        id: true,
        ingestExtractedCandidate: { select: { sourceUrl: true } },
        venue: { select: { websiteUrl: true, eventsPageUrl: true } },
      },
      orderBy: { startAt: "desc" },
      take: parsed.data.limit,
    });

    let extracted = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const event of events) {
      const sourceUrl = event.ingestExtractedCandidate?.sourceUrl ?? event.venue?.eventsPageUrl ?? event.venue?.websiteUrl ?? "";
      try {
        const result = await deps.extractArtworksForEvent({
          db: deps.db as never,
          eventId: event.id,
          sourceUrl,
          settings: {
            artworkExtractionProvider: settings?.artworkExtractionProvider,
            claudeApiKey: settings?.anthropicApiKey,
            anthropicApiKey: settings?.anthropicApiKey,
            geminiApiKey: settings?.geminiApiKey,
            openAiApiKey: settings?.openAiApiKey,
          },
        });

        extracted += result.created;
        duplicates += result.duplicates;
        skipped += result.skipped;
      } catch (error) {
        skipped += 1;
        console.warn("cron_backfill_artworks_extract_failed", { eventId: event.id, error });
      }
    }

    const summary = {
      ok: true,
      cronName: CRON_NAME,
      cronRunId,
      startedAt,
      finishedAt: new Date(deps.now()).toISOString(),
      durationMs: deps.now() - startedAtMs,
      processedCount: events.length,
      errorCount: 0,
      dryRun: false,
      lock: lock.supported ? "acquired" as const : "unsupported" as const,
      processedEvents: events.length,
      extracted,
      duplicates,
      skipped,
    };

    deps.logCronSummary(summary);
    return noStoreJson(summary);
  } finally {
    await lock.release();
  }
}
