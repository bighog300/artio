import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { JOBS } from "@/lib/jobs/registry";

const RUNNING_LOCK_WINDOW_MS = 10 * 60 * 1000;
const MAX_ERROR_MESSAGE_LENGTH = 500;

export class RunJobError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RunJobOptions = {
  trigger: "cron" | "admin" | "system";
  actorEmail?: string;
  params?: Prisma.InputJsonValue;
};

type JobRunStore = {
  findFirst: typeof db.jobRun.findFirst;
  create: typeof db.jobRun.create;
  update: typeof db.jobRun.update;
};

function truncateMessage(input: string): string {
  return input.length > MAX_ERROR_MESSAGE_LENGTH ? `${input.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : input;
}

export async function runJobWithStore(name: string, options: RunJobOptions, store: JobRunStore) {
  const definition = JOBS[name];
  if (!definition) {
    throw new RunJobError(400, "invalid_job_name");
  }

  const now = new Date();
  const lockThreshold = new Date(now.getTime() - RUNNING_LOCK_WINDOW_MS);
  const existingRunning = await store.findFirst({
    where: {
      name,
      status: "running",
      startedAt: { gte: lockThreshold },
    },
    select: { id: true },
  });

  if (existingRunning) {
    throw new RunJobError(409, "job_already_running");
  }

  const startedAt = new Date();
  const created = await store.create({
    data: {
      name,
      status: "running",
      trigger: options.trigger,
      actorEmail: options.actorEmail ?? null,
      startedAt,
      metadata: options.params ? { params: options.params } : undefined,
    },
    select: { id: true },
  });

  if (!created?.id) {
    throw new RunJobError(500, "job_record_not_created");
  }

  try {
    const result = await definition.run({ params: options.params, actorEmail: options.actorEmail ?? null });
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    return await store.update({
      where: { id: created.id },
      data: {
        status: "succeeded",
        finishedAt,
        message: result?.message ?? null,
        metadata: {
          ...(options.params ? { params: options.params } : {}),
          durationMs,
          ...(result?.metadata ?? {}),
        },
      },
    });
  } catch (error) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const message = error instanceof Error ? error.message : "unknown_error";

    return await store.update({
      where: { id: created.id },
      data: {
        status: "failed",
        finishedAt,
        message: truncateMessage(message),
        metadata: {
          ...(options.params ? { params: options.params } : {}),
          durationMs,
          errorName: error instanceof Error ? error.name : "unknown",
        },
      },
    });
  }
}

export async function runJob(name: string, options: RunJobOptions) {
  return runJobWithStore(name, options, db.jobRun);
}

export function runJobErrorResponse(error: unknown) {
  if (error instanceof RunJobError) {
    const code = error.message;
    if (error.status === 409) {
      return apiError(409, code, "A run for this job is already in progress");
    }
    return apiError(error.status, code, "Unable to run job");
  }
  return apiError(500, "internal_error", "Unexpected server error");
}
