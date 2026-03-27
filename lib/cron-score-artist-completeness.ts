import type { PrismaClient } from "@prisma/client";
import { validateCronRequest } from "@/lib/cron-auth";
import { computeArtistCompleteness } from "@/lib/artist-completeness";
import { createCronRunId, logCronSummary, tryAcquireCronLock } from "@/lib/cron-runtime";

const ROUTE = "/api/cron/artists/score-completeness";
const CRON_NAME = "score_artist_completeness";
const BATCH_SIZE = 50;
const STALE_HOURS = 24;

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

export async function runCronScoreArtistCompleteness(
  cronSecret: string | null,
  { db }: { db: PrismaClient },
): Promise<Response> {
  const authFailure = validateCronRequest(cronSecret, { route: ROUTE });
  if (authFailure) return withNoStore(authFailure);

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const cronRunId = createCronRunId();

  const lock = await tryAcquireCronLock(db, "cron:artist:score-completeness");
  if (!lock.acquired) {
    const summary = {
      ok: false,
      reason: "lock_not_acquired",
      cronName: CRON_NAME,
      cronRunId,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      processedCount: 0,
      errorCount: 0,
      dryRun: false,
      lock: "skipped" as const,
      scored: 0,
      failed: 0,
    };
    logCronSummary(summary);
    return noStoreJson(summary);
  }

  let scored = 0;
  let failed = 0;

  try {
    const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

    const artists = await db.artist.findMany({
      where: {
        deletedAt: null,
        OR: [
          { completenessUpdatedAt: null },
          { completenessUpdatedAt: { lt: staleThreshold } },
        ],
      },
      select: {
        id: true,
        name: true,
        bio: true,
        featuredAssetId: true,
        websiteUrl: true,
        mediums: true,
      },
      orderBy: [
        { completenessUpdatedAt: "asc" },
        { updatedAt: "asc" },
      ],
      take: BATCH_SIZE * 10,
    });

    for (let i = 0; i < artists.length; i += BATCH_SIZE) {
      const batch = artists.slice(i, i + BATCH_SIZE);
      const now = new Date();

      const results = await Promise.allSettled(
        batch.map(async (artist) => {
          const result = computeArtistCompleteness({
            name: artist.name,
            bio: artist.bio,
            featuredAssetId: artist.featuredAssetId,
            websiteUrl: artist.websiteUrl,
            mediums: artist.mediums,
          });

          await db.artist.update({
            where: { id: artist.id },
            data: {
              completenessScore: result.scorePct,
              completenessFlags: result.flags,
              completenessUpdatedAt: now,
            },
          });
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") scored += 1;
        else failed += 1;
      }
    }
  } finally {
    await lock.release();
  }

  const finishedAt = new Date().toISOString();
  const summary = {
    ok: true,
    cronName: CRON_NAME,
    cronRunId,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedAtMs,
    processedCount: scored,
    errorCount: failed,
    dryRun: false,
    lock: "acquired" as const,
    scored,
    failed,
  };

  logCronSummary(summary);
  return noStoreJson(summary);
}
