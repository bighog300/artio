import type { PrismaClient } from "@prisma/client";
import { checkAndCompleteGoal, getGoalProgress } from "@/lib/discovery/goal-service";
import { scoreTemplates, rankTemplates } from "@/lib/discovery/query-ranker";
import { generateTemplateVariants } from "@/lib/discovery/template-variants";
import { runDiscoveryJob } from "@/lib/ingest/run-discovery-job";
import { logWarn } from "@/lib/logging";

export async function runGoalDiscovery(args: {
  goalId: string;
  db: PrismaClient;
  env: {
    googlePseApiKey?: string | null;
    googlePseCx?: string | null;
    braveSearchApiKey?: string | null;
  };
  searchProvider?: "google_pse" | "brave";
  maxResultsPerQuery?: number;
}): Promise<{ jobIds: string[]; totalQueued: number; skipped: boolean }> {
  const goal = await args.db.discoveryGoal.findUnique({ where: { id: args.goalId } });
  if (!goal || goal.status !== "ACTIVE" || goal.entityType !== "VENUE") {
    return { jobIds: [], totalQueued: 0, skipped: true };
  }

  const progress = await getGoalProgress(args.db, goal.id);
  if (progress.seeded >= goal.targetCount) {
    await checkAndCompleteGoal(args.db, goal.id);
    return { jobIds: [], totalQueued: 0, skipped: true };
  }

  const baseVenueTemplates = [
    `art gallery ${goal.region} ${goal.country}`,
    `contemporary art gallery ${goal.region} ${goal.country}`,
    `artist-run space ${goal.region} ${goal.country}`,
    `visual art centre ${goal.region} ${goal.country}`,
    `exhibition space ${goal.region} ${goal.country}`,
  ];
  const [scores, variants] = await Promise.all([
    scoreTemplates(args.db, baseVenueTemplates),
    generateTemplateVariants(args.db, {
      region: goal.region,
      country: goal.country,
      entityType: "VENUE",
      maxVariants: 3,
    }),
  ]);

  const rankedTemplates = rankTemplates(scores);
  const templates = [...variants, ...rankedTemplates].slice(0, 8);

  const jobIds: string[] = [];

  for (const template of templates) {
    const job = await args.db.ingestDiscoveryJob.create({
      data: {
        entityType: "VENUE",
        queryTemplate: template,
        region: goal.region,
        regionId: null,
        goalId: goal.id,
        searchProvider: args.searchProvider ?? "google_pse",
        maxResults: args.maxResultsPerQuery ?? 10,
        status: "PENDING",
      },
      select: { id: true },
    });

    jobIds.push(job.id);

    try {
      await runDiscoveryJob({ db: args.db, jobId: job.id, env: args.env });
    } catch (queryError) {
      logWarn({
        message: "goal_discovery_query_failed",
        goalId: goal.id,
        template,
        jobId: job.id,
        error: queryError instanceof Error ? queryError.message : String(queryError),
      });
    }
  }

  const totalQueued = await args.db.ingestDiscoveryCandidate.count({
    where: {
      jobId: { in: jobIds },
      status: "PENDING",
    },
  });

  await checkAndCompleteGoal(args.db, goal.id);

  return { jobIds, totalQueued, skipped: false };
}
