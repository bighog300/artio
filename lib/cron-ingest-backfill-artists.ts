import { z } from "zod";
import { db } from "@/lib/db";
import { extractCronSecret, validateCronRequest } from "@/lib/cron-auth";
import { createCronRunId, logCronSummary, tryAcquireCronLock } from "@/lib/cron-runtime";
import { discoverArtist } from "@/lib/ingest/artist-discovery";
import { logWarn } from "@/lib/logging";

const CRON_NAME = "ingest_backfill_artists";
const ROUTE = "/api/cron/ingest/backfill-artists";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ARTIST_DISCOVERY_CONCURRENCY = 3;
const SEARCH_QUOTA_SOFT_LIMIT = 80;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

type BackfillArtistsDeps = {
  db: {
    ingestExtractedEvent: {
      findMany: (args: {
        where: {
          status: "APPROVED";
          createdEventId: { not: null };
          artistNames: { isEmpty: false };
        };
        select: {
          id: true;
          artistNames: true;
          title: true;
          createdEventId: true;
        };
        orderBy: { createdAt: "desc" };
        take: number;
      }) => Promise<Array<{ id: string; artistNames: string[]; title: string | null; createdEventId: string | null }>>;
    };
    eventArtist: {
      findMany: (args: {
        where: { eventId: string };
        select: { artist: { select: { name: true } } };
      }) => Promise<Array<{ artist: { name: string } }>>;
    };
    siteSettings: {
      findUnique: (args: {
        where: { id: "default" };
        select: {
          braveSearchApiKey: true;
          googlePseApiKey: true;
          googlePseCx: true;
          artistLookupProvider: true;
          artistBioProvider: true;
          geminiApiKey: true;
          anthropicApiKey: true;
          openAiApiKey: true;
        };
      }) => Promise<{
        braveSearchApiKey: string | null;
        googlePseApiKey: string | null;
        googlePseCx: string | null;
        artistLookupProvider: string | null;
        artistBioProvider: string | null;
        geminiApiKey: string | null;
        anthropicApiKey: string | null;
        openAiApiKey: string | null;
      } | null>;
    };
  };
  discoverArtist: typeof discoverArtist;
  extractCronSecret: typeof extractCronSecret;
  validateCronRequest: typeof validateCronRequest;
  tryAcquireCronLock: typeof tryAcquireCronLock;
  createCronRunId: typeof createCronRunId;
  logCronSummary: typeof logCronSummary;
  now: () => number;
};

const defaultDeps: BackfillArtistsDeps = {
  db: db as never,
  discoverArtist,
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

function normalize(name: string) {
  return name.trim().toLowerCase();
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item !== undefined) await fn(item).catch(() => {});
      }
    },
  );
  await Promise.all(workers);
}

export async function handleBackfillArtistsCron(req: Request, deps: BackfillArtistsDeps = defaultDeps) {
  const authFailure = deps.validateCronRequest(deps.extractCronSecret(req.headers), { route: ROUTE, method: req.method });
  if (authFailure) return authFailure;

  const cronRunId = deps.createCronRunId();
  const startedAtMs = deps.now();
  const startedAt = new Date(startedAtMs).toISOString();

  if (process.env.AI_ARTIST_INGEST_ENABLED !== "1") {
    return noStoreJson({ ok: true, cronName: CRON_NAME, cronRunId, skipped: true, reason: "AI_ARTIST_INGEST_ENABLED not set" });
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
        braveSearchApiKey: true,
        googlePseApiKey: true,
        googlePseCx: true,
        artistLookupProvider: true,
        artistBioProvider: true,
        geminiApiKey: true,
        anthropicApiKey: true,
        openAiApiKey: true,
      },
    });

    const extractedEvents = await deps.db.ingestExtractedEvent.findMany({
      where: {
        status: "APPROVED",
        createdEventId: { not: null },
        artistNames: { isEmpty: false },
      },
      select: {
        id: true,
        artistNames: true,
        title: true,
        createdEventId: true,
      },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
    });

    let discovered = 0;
    let failed = 0;
    let unresolvedTotal = 0;
    let searchQueriesUsed = 0;

    for (const extractedEvent of extractedEvents) {
      if (!extractedEvent.createdEventId) continue;
      const createdEventId = extractedEvent.createdEventId;

      const existingLinks = await deps.db.eventArtist.findMany({
        where: { eventId: createdEventId },
        select: { artist: { select: { name: true } } },
      });

      const linkedNames = new Set(existingLinks.map((link) => normalize(link.artist.name)));
      const unresolvedNames = extractedEvent.artistNames.filter((name) => !linkedNames.has(normalize(name)));
      unresolvedTotal += unresolvedNames.length;

      await runWithConcurrency(unresolvedNames, ARTIST_DISCOVERY_CONCURRENCY, async (artistName) => {
        try {
          if (searchQueriesUsed >= SEARCH_QUOTA_SOFT_LIMIT) {
            logWarn({ message: "cron_backfill_artists_quota_soft_limit", searchQueriesUsed });
            failed += 1;
            return;
          }
          searchQueriesUsed += 1;

          await deps.discoverArtist({
            db: deps.db as never,
            eventId: createdEventId,
            artistName,
            eventTitle: extractedEvent.title,
            venueName: null,
            settings: {
              braveSearchApiKey: settings?.braveSearchApiKey ?? process.env.BRAVE_SEARCH_API_KEY,
              googlePseApiKey: settings?.googlePseApiKey ?? process.env.GOOGLE_PSE_API_KEY,
              googlePseCx: settings?.googlePseCx ?? process.env.GOOGLE_PSE_CX,
              artistLookupProvider: settings?.artistLookupProvider,
              artistBioProvider: settings?.artistBioProvider,
              geminiApiKey: settings?.geminiApiKey,
              anthropicApiKey: settings?.anthropicApiKey,
              openAiApiKey: settings?.openAiApiKey,
            },
          });
          discovered += 1;
        } catch (error) {
          failed += 1;
          logWarn({
            message: "cron_backfill_artists_discover_failed",
            extractedEventId: extractedEvent.id,
            eventId: createdEventId,
            artistName,
            error,
          });
        }
      });
    }

    const summary = {
      ok: failed === 0,
      cronName: CRON_NAME,
      cronRunId,
      startedAt,
      finishedAt: new Date(deps.now()).toISOString(),
      durationMs: deps.now() - startedAtMs,
      processedCount: extractedEvents.length,
      errorCount: failed,
      dryRun: false,
      lock: lock.supported ? "acquired" as const : "unsupported" as const,
      processedEvents: extractedEvents.length,
      unresolvedNames: unresolvedTotal,
      discovered,
      failed,
    };

    deps.logCronSummary(summary);
    return noStoreJson(summary);
  } finally {
    await lock.release();
  }
}
