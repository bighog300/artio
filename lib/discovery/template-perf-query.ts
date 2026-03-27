import type { PrismaClient } from "@prisma/client";

export type TemplatePerfRow = {
  queryTemplate: string;
  entityType: "VENUE" | "ARTIST" | "EVENT";
  region: string;
  jobCount: number;
  avgYield: number;
  totalQueued: number;
  totalSkipped: number;
  lastRunAt: Date | null;
  trend: "up" | "down" | "flat" | "new";
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeTrend(jobs: Array<{ createdAt: Date; queryYield: number | null }>): TemplatePerfRow["trend"] {
  if (jobs.length < 3) return "new";

  const sorted = [...jobs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const splitIndex = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, splitIndex);
  const secondHalf = sorted.slice(splitIndex);

  const firstAvg = average(firstHalf.map((job) => job.queryYield ?? 0));
  const secondAvg = average(secondHalf.map((job) => job.queryYield ?? 0));
  const diff = secondAvg - firstAvg;

  if (Math.abs(diff) < 0.05) return "flat";
  return diff > 0 ? "up" : "down";
}

export async function getTemplatePerfData(
  db: PrismaClient,
  opts?: {
    lookbackDays?: number;
    entityType?: "VENUE" | "ARTIST" | "EVENT";
    region?: string;
  },
): Promise<TemplatePerfRow[]> {
  const lookbackDays = opts?.lookbackDays ?? 30;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const jobs = await db.ingestDiscoveryJob.findMany({
    where: {
      status: "DONE",
      createdAt: { gte: since },
      ...(opts?.entityType ? { entityType: opts.entityType } : {}),
      ...(opts?.region ? { region: opts.region } : {}),
    },
    select: {
      queryTemplate: true,
      entityType: true,
      region: true,
      queryYield: true,
      candidatesQueued: true,
      candidatesSkipped: true,
      createdAt: true,
    },
  });

  const grouped = new Map<string, typeof jobs>();

  for (const job of jobs) {
    const key = `${job.queryTemplate}__${job.entityType}__${job.region}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(job);
    } else {
      grouped.set(key, [job]);
    }
  }

  const rows: TemplatePerfRow[] = [];

  for (const groupJobs of grouped.values()) {
    const first = groupJobs[0];
    if (!first) continue;

    const nonNullYield = groupJobs
      .map((job) => job.queryYield)
      .filter((value): value is number => value !== null);

    rows.push({
      queryTemplate: first.queryTemplate,
      entityType: first.entityType,
      region: first.region,
      jobCount: groupJobs.length,
      avgYield: average(nonNullYield),
      totalQueued: groupJobs.reduce((sum, job) => sum + (job.candidatesQueued ?? 0), 0),
      totalSkipped: groupJobs.reduce((sum, job) => sum + (job.candidatesSkipped ?? 0), 0),
      lastRunAt: groupJobs.reduce<Date | null>((last, job) => {
        if (!last) return job.createdAt;
        return job.createdAt > last ? job.createdAt : last;
      }, null),
      trend: computeTrend(groupJobs),
    });
  }

  return rows.sort((a, b) => b.avgYield - a.avgYield);
}
