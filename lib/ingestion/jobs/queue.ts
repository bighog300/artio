import { createHash, randomUUID } from "node:crypto";
import { logError, logInfo } from "@/lib/logging";
import { redisGet, redisLpush, redisRpop, redisSetEx, redisSetNx, safeRedisCall } from "@/lib/ingestion/jobs/redis";
import type { IngestionJob, IngestionJobPayloadMap, IngestionJobType, QueueEnqueueOptions } from "@/lib/ingestion/jobs/types";

const QUEUE_KEY = "queue:ingestion:jobs:v1";
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;
const RESULT_TTL_SECONDS = 60 * 60 * 24 * 7;

function buildIdempotencyKey(type: IngestionJobType, payload: unknown): string {
  return createHash("sha256").update(`${type}:${JSON.stringify(payload)}`).digest("hex");
}

function nextBackoffMs(attempt: number) {
  const exp = Math.min(6, Math.max(1, attempt));
  return 1_000 * (2 ** exp);
}

export async function enqueueIngestionJob<T extends IngestionJobType>(
  type: T,
  payload: IngestionJobPayloadMap[T],
  options: QueueEnqueueOptions = {},
): Promise<{ enqueued: boolean; jobId: string; idempotencyKey: string }> {
  const idempotencyKey = options.idempotencyKey ?? buildIdempotencyKey(type, payload);
  const idempotentToken = `ingest:idempotency:${idempotencyKey}`;

  const allowed = await safeRedisCall(
    () => redisSetNx(idempotentToken, "1", IDEMPOTENCY_TTL_SECONDS),
    true,
    "enqueue_idempotency",
  );

  if (!allowed) {
    return { enqueued: false, jobId: idempotencyKey, idempotencyKey };
  }

  const now = Date.now();
  const job: IngestionJob<T> = {
    id: randomUUID(),
    type,
    payload,
    attempts: 0,
    maxAttempts: options.maxAttempts ?? 4,
    runAt: now + (options.initialDelayMs ?? 0),
    idempotencyKey,
    createdAt: now,
  };

  const pushed = await safeRedisCall(
    () => redisLpush(QUEUE_KEY, JSON.stringify(job)),
    null,
    "enqueue_lpush",
  );
  if (pushed === null) {
    logError({ message: "ingestion_job_enqueue_failed", jobType: type, jobId: job.id, idempotencyKey });
    return { enqueued: false, jobId: job.id, idempotencyKey };
  }
  logInfo({ message: "ingestion_job_enqueued", jobType: type, jobId: job.id, idempotencyKey });
  return { enqueued: true, jobId: job.id, idempotencyKey };
}

export async function dequeueIngestionJob(): Promise<IngestionJob | null> {
  const raw = await safeRedisCall(() => redisRpop(QUEUE_KEY), null, "dequeue_job");
  if (!raw) return null;

  let parsed: IngestionJob;
  try {
    parsed = JSON.parse(raw) as IngestionJob;
  } catch {
    logError({ message: "ingestion_job_invalid_json", raw });
    return null;
  }

  if (parsed.runAt > Date.now()) {
    await redisLpush(QUEUE_KEY, JSON.stringify(parsed));
    return null;
  }

  return parsed;
}

export async function markJobSucceeded(job: IngestionJob, result: unknown): Promise<void> {
  await safeRedisCall(
    () => redisSetEx(`ingest:job:result:${job.id}`, RESULT_TTL_SECONDS, JSON.stringify({ ok: true, result, finishedAt: new Date().toISOString() })),
    undefined,
    "job_success_result",
  );
}

export async function markJobFailed(job: IngestionJob, error: unknown): Promise<void> {
  const detail = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };

  if (job.attempts + 1 >= job.maxAttempts) {
    await safeRedisCall(
      () => redisSetEx(`ingest:job:result:${job.id}`, RESULT_TTL_SECONDS, JSON.stringify({ ok: false, error: detail, finishedAt: new Date().toISOString() })),
      undefined,
      "job_failed_result",
    );
    logError({ message: "ingestion_job_failed_terminal", jobType: job.type, jobId: job.id, attempts: job.attempts + 1, maxAttempts: job.maxAttempts, error: detail.message });
    return;
  }

  const retried: IngestionJob = {
    ...job,
    attempts: job.attempts + 1,
    runAt: Date.now() + nextBackoffMs(job.attempts + 1),
  };
  await safeRedisCall(
    () => redisLpush(QUEUE_KEY, JSON.stringify(retried)),
    null,
    "requeue_failed_job",
  );
  logInfo({ message: "ingestion_job_requeued", jobType: job.type, jobId: job.id, attempts: retried.attempts, nextRunAt: retried.runAt });
}

export async function getJobResult(jobId: string): Promise<unknown | null> {
  const raw = await safeRedisCall(() => redisGet(`ingest:job:result:${jobId}`), null, "get_job_result");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return { ok: false, error: { message: "invalid_result_payload" } };
  }
}
