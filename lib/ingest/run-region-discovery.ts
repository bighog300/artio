import type { PrismaClient } from "@prisma/client";
import { scoreTemplates, rankTemplates } from "@/lib/discovery/query-ranker";
import { generateTemplateVariants } from "@/lib/discovery/template-variants";
import { runDiscoveryJob } from "@/lib/ingest/run-discovery-job";
import { logWarn } from "@/lib/logging";

export async function runRegionDiscovery(args: {
  regionId: string;
  db: PrismaClient;
  env: {
    googlePseApiKey?: string | null;
    googlePseCx?: string | null;
    braveSearchApiKey?: string | null;
  };
  searchProvider?: "google_pse" | "brave";
  maxResultsPerQuery?: number;
}): Promise<{ jobIds: string[]; totalQueued: number }> {
  const region = await args.db.ingestRegion.findUnique({ where: { id: args.regionId } });
  if (!region || region.discoveryDone) {
    return { jobIds: [], totalQueued: 0 };
  }

  try {
    const baseVenueTemplates = [
      `art gallery ${region.region} ${region.country}`,
      `contemporary art gallery ${region.region} ${region.country}`,
      `artist-run space ${region.region} ${region.country}`,
      `visual art centre ${region.region} ${region.country}`,
      `exhibition space ${region.region} ${region.country}`,
    ];
    const [scores, variants, approvedSuggestions] = await Promise.all([
      scoreTemplates(args.db, baseVenueTemplates),
      generateTemplateVariants(args.db, {
        region: region.region,
        country: region.country,
        entityType: "VENUE",
        maxVariants: 3,
      }),
      args.db.discoveryTemplateSuggestion.findMany({
        where: {
          status: "APPROVED",
          entityType: "VENUE",
          region: {
            equals: region.region, mode: "insensitive",
          },
        },
        select: { template: true },
        orderBy: { approvedAt: "desc" },
        take: 5,
      }),
    ]);

    const suggestionTemplates = approvedSuggestions.map((s) => s.template);
    const rankedTemplates = rankTemplates(scores);
    const templates = [
      ...suggestionTemplates,
      ...variants,
      ...rankedTemplates,
    ].slice(0, 10);

    const jobIds: string[] = [];
    let queryFailCount = 0;

    for (const template of templates) {
      const job = await args.db.ingestDiscoveryJob.create({
        data: {
          entityType: "VENUE",
          queryTemplate: template,
          region: region.region,
          regionId: args.regionId,
          searchProvider: args.searchProvider ?? "google_pse",
          maxResults: args.maxResultsPerQuery ?? 10,
          status: "PENDING",
        },
        select: { id: true },
      });

      try {
        await runDiscoveryJob({ db: args.db, jobId: job.id, env: args.env });
        jobIds.push(job.id);
      } catch (queryError) {
        queryFailCount += 1;
        logWarn({ message: "region_discovery_query_failed",
          regionId: args.regionId,
          template,
          jobId: job.id,
          error: queryError instanceof Error ? queryError.message : String(queryError),
        });
      }
    }

    // Artist discovery — only when flag is enabled
    let artistTemplates: string[] = [];
    if (region.artistDiscoveryEnabled) {
      const approvedArtistSuggestions = await args.db.discoveryTemplateSuggestion.findMany({
        where: {
          status: "APPROVED",
          entityType: "ARTIST",
          region: {
            equals: region.region, mode: "insensitive",
          },
        },
        select: { template: true },
        orderBy: { approvedAt: "desc" },
        take: 3,
      });

      artistTemplates = [
        ...approvedArtistSuggestions.map((s) => s.template),
        `contemporary artists ${region.region} ${region.country}`,
        `visual artists ${region.region} ${region.country}`,
        `emerging artists ${region.region} ${region.country}`,
      ].slice(0, 6);

      for (const template of artistTemplates) {
        const job = await args.db.ingestDiscoveryJob.create({
          data: {
            entityType: "ARTIST",
            queryTemplate: template,
            region: region.region,
            regionId: args.regionId,
            searchProvider: args.searchProvider ?? "google_pse",
            maxResults: args.maxResultsPerQuery ?? 10,
            status: "PENDING",
          },
          select: { id: true },
        });

        try {
          await runDiscoveryJob({
            db: args.db,
            jobId: job.id,
            env: args.env,
          });
          jobIds.push(job.id);
        } catch (queryError) {
          queryFailCount += 1;
          logWarn({
            message: "region_artist_discovery_query_failed",
            regionId: args.regionId,
            template,
            jobId: job.id,
            error: queryError instanceof Error
              ? queryError.message
              : String(queryError),
          });
        }
      }
    }

    const attemptedTemplateCount = templates.length + (region.artistDiscoveryEnabled ? artistTemplates.length : 0);
    if (queryFailCount === attemptedTemplateCount) {
      throw new Error(
        `All ${attemptedTemplateCount} discovery queries failed for region ${args.regionId}`,
      );
    }

    const totalQueued = await args.db.ingestDiscoveryCandidate.count({
      where: {
        jobId: { in: jobIds },
        status: "PENDING",
      },
    });

    await args.db.ingestRegion.update({
      where: { id: args.regionId },
      data: { discoveryDone: true, lastRunAt: new Date() },
    });

    return { jobIds, totalQueued };
  } catch (error) {
    throw error;
  }
}
