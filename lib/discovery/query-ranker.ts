import type { PrismaClient } from "@prisma/client";

export type TemplateScore = {
  template: string;
  avgYield: number;
  jobCount: number;
};

export async function scoreTemplates(
  db: PrismaClient,
  templates: string[],
  opts?: {
    lookbackDays?: number;
    minJobs?: number;
  },
): Promise<TemplateScore[]> {
  const lookbackDays = opts?.lookbackDays ?? 30;
  const minJobs = opts?.minJobs ?? 3;

  if (templates.length === 0) {
    return [];
  }

  const lookbackCutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const jobs = await db.ingestDiscoveryJob.findMany({
    where: {
      status: "DONE",
      queryYield: { not: null },
      queryTemplate: { in: templates },
      createdAt: { gte: lookbackCutoff },
    },
    select: {
      queryTemplate: true,
      queryYield: true,
    },
  });

  const grouped = new Map<string, { sum: number; count: number }>();
  for (const job of jobs) {
    const current = grouped.get(job.queryTemplate) ?? { sum: 0, count: 0 };
    grouped.set(job.queryTemplate, {
      sum: current.sum + (job.queryYield ?? 0),
      count: current.count + 1,
    });
  }

  return templates.map((template) => {
    const stats = grouped.get(template);
    if (!stats) {
      return {
        template,
        avgYield: 0,
        jobCount: 0,
      };
    }

    if (stats.count < minJobs) {
      return {
        template,
        avgYield: 0,
        jobCount: stats.count,
      };
    }

    return {
      template,
      avgYield: stats.sum / stats.count,
      jobCount: stats.count,
    };
  });
}

export function rankTemplates(
  scores: TemplateScore[],
  opts?: {
    dropThreshold?: number;
    minJobs?: number;
  },
): string[] {
  const dropThreshold = opts?.dropThreshold ?? 0.1;
  const minJobs = opts?.minJobs ?? 3;

  const unknown: string[] = [];
  const scored: TemplateScore[] = [];

  for (const score of scores) {
    if (score.jobCount < minJobs) {
      unknown.push(score.template);
      continue;
    }

    if (score.avgYield < dropThreshold) {
      continue;
    }

    scored.push(score);
  }

  const ranked = [
    ...scored.sort((a, b) => b.avgYield - a.avgYield).map((score) => score.template),
    ...unknown,
  ];

  if (ranked.length === 0) {
    return scores.map((score) => score.template);
  }

  return ranked;
}
