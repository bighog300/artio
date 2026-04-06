import type { PrismaClient } from "@prisma/client";
import { validateCronRequest } from "@/lib/cron-auth";
import { createCronRunId, logCronSummary, tryAcquireCronLock } from "@/lib/cron-runtime";
import { markCronFailure, markCronSuccess } from "@/lib/ops-metrics";
import { captureException } from "@/lib/monitoring";
import { runDirectoryCrawl } from "@/lib/ingest/run-directory-crawl";

const CRON_NAME = "ingest_directory_crawl";
const ROUTE = "/api/cron/ingest/directory-crawl";

export async function runCronIngestDirectoryCrawl(
  cronSecret: string | null,
  db: PrismaClient,
  opts?: { requestId?: string },
): Promise<Response> {
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const cronRunId = createCronRunId();

  const authFailure = validateCronRequest(cronSecret, { route: ROUTE, requestId: opts?.requestId });
  if (authFailure) return authFailure;

  const lock = await tryAcquireCronLock(db, "cron:ingest:directory-crawl");
  if (!lock.acquired) {
    return Response.json(
      { ok: false, reason: "lock_not_acquired", requestId: opts?.requestId ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const now = Date.now();
    const sources = await db.directorySource.findMany({
      where: {
        isActive: true,
        OR: [
          { cursor: { is: null } },
          { cursor: { is: { lastSuccessAt: null } } },
          {
            cursor: {
              is: {
                lastSuccessAt: {
                  lte: new Date(now - 60_000),
                },
              },
            },
          },
        ],
      },
      include: { cursor: true },
      orderBy: { createdAt: "asc" },
    });

    const due = sources.filter((source) => {
      if (!source.cursor?.lastSuccessAt) return true;
      const nextAt = source.cursor.lastSuccessAt.getTime() + source.crawlIntervalMinutes * 60_000;
      return nextAt <= Date.now();
    });

    let processed = 0;
    let failed = 0;

    for (const source of due) {
      try {
        await runDirectoryCrawl({ db, sourceId: source.id, maxPagesPerRun: 1 });
      } catch {
        failed += 1;
      } finally {
        processed += 1;
      }
    }

    const finishedAt = new Date().toISOString();
    logCronSummary({
      ok: failed === 0,
      cronName: CRON_NAME,
      cronRunId,
      startedAt: startedAtIso,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      processedCount: processed,
      errorCount: failed,
      dryRun: false,
      lock: lock.supported ? ("acquired" as const) : ("unsupported" as const),
      requestId: opts?.requestId ?? null,
    });

    if (failed > 0) {
      await markCronFailure(CRON_NAME, `failed=${failed}`, finishedAt, cronRunId);
    } else {
      await markCronSuccess(CRON_NAME, finishedAt, cronRunId);
    }

    return Response.json(
      { ok: true, processed, errorCount: failed, requestId: opts?.requestId ?? null },
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
