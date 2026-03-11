import type { PrismaClient } from "@prisma/client";
import { runVenueGenerationProcessRunJob } from "@/lib/jobs/venue-generation-process-run";
import { createOpenAIResponsesClient, runVenueGenerationPhase1 } from "@/lib/venue-generation/generation-pipeline";

export async function runRegionVenueGeneration(args: {
  regionId: string;
  db: PrismaClient;
  openAiApiKey: string;
  autoPublishVenues: boolean;
  model?: string;
}): Promise<{ runId: string; totalCreated: number; totalSkipped: number; totalFailed: number }> {
  try {
    const ingestRegion = (args.db as PrismaClient & {
      ingestRegion: {
        findUnique: (args: unknown) => Promise<{
          id: string;
          country: string;
          region: string | null;
          venueGenDone: boolean;
          triggeredById: string;
        } | null>;
        update: (args: unknown) => Promise<unknown>;
      };
    }).ingestRegion;

    const region = await ingestRegion.findUnique({
      where: { id: args.regionId },
      select: {
        id: true,
        country: true,
        region: true,
        venueGenDone: true,
        triggeredById: true,
      },
    });

    if (!region || region.venueGenDone) {
      return { runId: "", totalCreated: 0, totalSkipped: 0, totalFailed: 0 };
    }

    const openai = await createOpenAIResponsesClient({ apiKey: args.openAiApiKey });

    const phase1 = await runVenueGenerationPhase1({
      input: { country: region.country, region: region.region ?? "" },
      triggeredById: region.triggeredById,
      db: args.db,
      openai,
      model: args.model,
    });

    const result = await runVenueGenerationProcessRunJob({
      runId: phase1.runId,
      db: args.db,
      autoPublishOverride: args.autoPublishVenues,
    });

    await ingestRegion.update({
      where: { id: args.regionId },
      data: {
        venueGenDone: true,
        lastRunAt: new Date(),
      },
    });

    const metadata = result.metadata as { totalCreated?: number; totalSkipped?: number; totalFailed?: number } | undefined;

    return {
      runId: phase1.runId,
      totalCreated: metadata?.totalCreated ?? 0,
      totalSkipped: metadata?.totalSkipped ?? 0,
      totalFailed: metadata?.totalFailed ?? 0,
    };
  } catch (error) {
    throw error;
  }
}
