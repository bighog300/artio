import { logInfo } from "@/lib/logging";

export type CronSummary = {
  cronName: string;
  cronRunId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  processedCount: number;
  errorCount: number;
  dryRun: boolean;
  lock: "acquired" | "skipped" | "unsupported";
};

type QueryCapable = {
  $queryRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

function hashLockKey(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash || 1);
}

export function createCronRunId() {
  return crypto.randomUUID();
}

export async function tryAcquireCronLock(store: unknown, lockName: string): Promise<{ acquired: boolean; release: () => Promise<void>; supported: boolean }> {
  const queryStore = store as QueryCapable;
  if (!queryStore?.$queryRaw) {
    return { acquired: true, supported: false, release: async () => {} };
  }

  const lockId = hashLockKey(lockName);
  try {
    const rows = await queryStore.$queryRaw`SELECT pg_try_advisory_lock(${lockId}) AS locked` as Array<{ locked?: boolean }>;
    const locked = Boolean(rows?.[0]?.locked);
    if (!locked) {
      return { acquired: false, supported: true, release: async () => {} };
    }

    return {
      acquired: true,
      supported: true,
      release: async () => {
        if (queryStore.$queryRaw) {
          await queryStore.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
        }
      },
    };
  } catch {
    return { acquired: true, supported: false, release: async () => {} };
  }
}

export function shouldDryRun(value: string | null | undefined) {
  return value === "1" || value === "true";
}

export function logCronSummary(summary: CronSummary & Record<string, unknown>) {
  logInfo({ message: "cron_summary", ...summary });
}
