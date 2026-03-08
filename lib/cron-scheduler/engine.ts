import type { Prisma, PrismaClient } from "@prisma/client";
import { computeNextFireAt } from "@/lib/cron-scheduler/cron-expression";
import { seedDefaultCronJobs } from "@/lib/cron-scheduler/seed-defaults";

export { computeNextFireAt };

type SchedulerDeps = {
  db: Pick<PrismaClient, "cronJob" | "perfSnapshot">;
  appBaseUrl: string;
  cronSecret: string;
};

type TickResult = { fired: string[]; skipped: string[]; errors: string[] };

const LOCK_NAME = "cron:tick:lock";
const LAST_TICK_NAME = "cron:tick:last";

function isRecentLock(paramsJson: unknown, now: Date) {
  const lockAt = typeof paramsJson === "object" && paramsJson && "lockedAt" in paramsJson ? (paramsJson as { lockedAt?: unknown }).lockedAt : null;
  if (typeof lockAt !== "string") return false;
  const lockTime = new Date(lockAt);
  if (Number.isNaN(lockTime.getTime())) return false;
  return now.getTime() - lockTime.getTime() < 55_000;
}

async function upsertPerfSnapshotByName(db: Pick<PrismaClient, "perfSnapshot">, name: string, paramsJson: Prisma.InputJsonValue) {
  const existing = await db.perfSnapshot.findFirst({ where: { name }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (existing) {
    await db.perfSnapshot.update({ where: { id: existing.id }, data: { paramsJson, explainText: "cron_scheduler" } });
    return existing.id;
  }

  const created = await db.perfSnapshot.create({ data: { name, paramsJson, explainText: "cron_scheduler" }, select: { id: true } });
  return created.id;
}

export async function runSchedulerTick({ db, appBaseUrl, cronSecret }: SchedulerDeps): Promise<TickResult> {
  const now = new Date();
  const emptyCount = await db.cronJob.count();
  if (emptyCount === 0) {
    await seedDefaultCronJobs(db as Pick<PrismaClient, "cronJob">);
  }

  const lockRow = await db.perfSnapshot.findFirst({ where: { name: LOCK_NAME }, orderBy: { createdAt: "desc" }, select: { id: true, paramsJson: true } });
  if (lockRow && isRecentLock(lockRow.paramsJson, now)) {
    return { fired: [], skipped: ["locked"], errors: [] };
  }

  const lockId = await upsertPerfSnapshotByName(db as Pick<PrismaClient, "perfSnapshot">, LOCK_NAME, { lockedAt: now.toISOString() });
  await upsertPerfSnapshotByName(db as Pick<PrismaClient, "perfSnapshot">, LAST_TICK_NAME, { firedAt: now.toISOString() });

  const fired: string[] = [];
  const errors: string[] = [];

  try {
    const dueJobs = await db.cronJob.findMany({
      where: {
        enabled: true,
        OR: [{ nextFireAt: { lte: now } }, { nextFireAt: null }],
      },
      orderBy: { name: "asc" },
    });

    for (const job of dueJobs) {
      const nextFireAt = computeNextFireAt(job.schedule, now);
      await db.cronJob.update({
        where: { id: job.id },
        data: { lastStatus: "running", nextFireAt, lastMessage: null },
      });

      const url = new URL(job.endpoint, appBaseUrl).toString();
      let responseStatus = 500;
      let responseMessage = "";
      let ok = false;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(30_000),
        });
        responseStatus = response.status;
        const bodyText = await response.text();
        responseMessage = (bodyText || response.statusText || "no_response_body").slice(0, 200);
        ok = response.ok;
      } catch (error) {
        responseStatus = 500;
        responseMessage = error instanceof Error ? error.message.slice(0, 200) : "request_failed";
      }

      await db.cronJob.update({
        where: { id: job.id },
        data: {
          lastFiredAt: new Date(),
          lastStatus: ok ? "success" : "error",
          lastMessage: responseMessage || `HTTP ${responseStatus}`,
        },
      });

      if (ok) fired.push(job.name);
      else errors.push(job.name);
    }

    return { fired, skipped: [], errors };
  } finally {
    await db.perfSnapshot.delete({ where: { id: lockId } }).catch(() => undefined);
  }
}
