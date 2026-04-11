import type { PrismaClient } from "@prisma/client";
import { discoverArtist } from "@/lib/ingest/artist-discovery";
import { ARTIST_PROFILE_ARTWORK_SYSTEM_PROMPT, extractArtworksForEvent } from "@/lib/ingest/artwork-extraction";
import type { ProviderName } from "@/lib/ingest/providers";
import { runDirectoryCrawl } from "@/lib/ingest/run-directory-crawl";
import { normaliseDirectoryName } from "@/lib/ingestion/directory/miner";
import { getOrCreateDirectoryStubEvent } from "@/lib/ingestion/workers/worker";
import { logInfo, logWarn } from "@/lib/logging";

export type PipelineResult = {
  sourceId: string;
  letter: string;
  entitiesCrawled: number;
  artistsDiscovered: number;
  artworksExtracted: number;
  errors: string[];
};

export async function runDirectoryPipeline(args: {
  db: PrismaClient;
  sourceId: string;
  pipelineMode: "auto_discover" | "auto_full";
  aiApiKey: string;
  aiProviderName?: ProviderName;
  maxPagesPerRun?: number;
}): Promise<PipelineResult> {
  const errors: string[] = [];

  const crawlResult = await runDirectoryCrawl({
    db: args.db,
    sourceId: args.sourceId,
    maxPagesPerRun: args.maxPagesPerRun ?? 1,
    aiApiKey: args.aiApiKey,
    aiProviderName: args.aiProviderName,
  });

  logInfo({
    message: "directory_pipeline_crawl",
    sourceId: args.sourceId,
    letter: crawlResult.letter,
    found: crawlResult.found,
    newEntities: crawlResult.newEntities,
  });

  const unmatchedEntities = await args.db.directoryEntity.findMany({
    where: {
      directorySourceId: args.sourceId,
      matchedArtistId: null,
      entityName: { not: null },
    },
    select: { id: true, entityUrl: true, entityName: true },
    take: 20,
  });

  const stubEvent = await getOrCreateDirectoryStubEvent(args.db as never, args.sourceId);
  if (!stubEvent) {
    errors.push("Could not create stub event for discovery");
    return {
      sourceId: args.sourceId,
      letter: crawlResult.letter,
      entitiesCrawled: crawlResult.found,
      artistsDiscovered: 0,
      artworksExtracted: 0,
      errors,
    };
  }

  const settings = await args.db.siteSettings.findUnique({
    where: { id: "default" },
    select: {
      googlePseApiKey: true,
      googlePseCx: true,
      artistBioProvider: true,
      anthropicApiKey: true,
      openAiApiKey: true,
      geminiApiKey: true,
      artworkExtractionProvider: true,
    },
  });

  let artistsDiscovered = 0;

  for (const entity of unmatchedEntities) {
    const rawName = entity.entityName?.trim() ?? null;
    const artistName = rawName ? (normaliseDirectoryName(rawName) ?? rawName) : null;
    if (!artistName || artistName.length < 3) continue;

    try {
      const result = await discoverArtist({
        db: args.db as never,
        artistName,
        eventId: stubEvent.id,
        knownProfileUrl: entity.entityUrl,
        settings: {
          googlePseApiKey: settings?.googlePseApiKey,
          googlePseCx: settings?.googlePseCx,
          artistBioProvider: settings?.artistBioProvider,
          anthropicApiKey: settings?.anthropicApiKey ?? args.aiApiKey,
          openAiApiKey: settings?.openAiApiKey,
          geminiApiKey: settings?.geminiApiKey,
        },
      });

      if (result.status === "created" || result.status === "linked") {
        artistsDiscovered += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logWarn({ message: "directory_pipeline_discover_failed", entityId: entity.id, error: msg });
      errors.push(`Discovery failed for ${artistName}: ${msg}`);
    }
  }

  let artworksExtracted = 0;

  if (args.pipelineMode === "auto_full") {
    const matchedEntities = await args.db.directoryEntity.findMany({
      where: {
        directorySourceId: args.sourceId,
        matchedArtistId: { not: null },
      },
      select: { entityUrl: true, matchedArtistId: true },
      take: 10,
    });

    for (const entity of matchedEntities) {
      try {
        const artworkResult = await extractArtworksForEvent({
          db: args.db,
          eventId: stubEvent.id,
          sourceUrl: entity.entityUrl,
          systemPromptOverride: ARTIST_PROFILE_ARTWORK_SYSTEM_PROMPT,
          matchedArtistId: entity.matchedArtistId ?? null,
          settings: {
            artworkExtractionProvider: settings?.artworkExtractionProvider,
            anthropicApiKey: settings?.anthropicApiKey ?? args.aiApiKey,
            openAiApiKey: settings?.openAiApiKey,
            geminiApiKey: settings?.geminiApiKey,
          },
        });
        artworksExtracted += artworkResult.created;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logWarn({ message: "directory_pipeline_artwork_failed", entityUrl: entity.entityUrl, error: msg });
        errors.push(`Artwork extraction failed for ${entity.entityUrl}: ${msg}`);
      }
    }
  }

  await args.db.directorySource.update({
    where: { id: args.sourceId },
    data: {
      lastPipelineRunAt: new Date(),
      lastPipelineError: errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
    },
  }).catch(() => {});

  return {
    sourceId: args.sourceId,
    letter: crawlResult.letter,
    entitiesCrawled: crawlResult.found,
    artistsDiscovered,
    artworksExtracted,
    errors,
  };
}
