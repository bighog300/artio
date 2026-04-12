import type { PrismaClient } from "@prisma/client";
import { buildStrategyChain } from "@/lib/ingest/directory/auto-detect";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { classifyPage, type PageType } from "@/lib/ingest/directory/classify-page";
import type { ProviderName } from "@/lib/ingest/providers";
import { logInfo, logWarn } from "@/lib/logging";

export type PathCrawlResult = {
  pathId: string;
  contentType: string;
  found: number;
  newEntities: number;
  done: boolean;
  error: string | null;
};

function buildPageUrl(
  baseUrl: string,
  indexPattern: string | null,
  paginationType: string,
  cursor: { letter: string; page: number },
): string {
  if (!indexPattern) return baseUrl;

  if (paginationType === "letter") {
    return indexPattern
      .replaceAll("[letter]", cursor.letter)
      .replaceAll("[page]", String(cursor.page));
  }

  if (paginationType === "numbered") {
    return indexPattern.replaceAll("[page]", String(cursor.page));
  }

  return baseUrl;
}

export async function runPathCrawl(args: {
  db: PrismaClient;
  pathId: string;
  maxPagesPerRun?: number;
  aiApiKey?: string | null;
  aiProviderName?: ProviderName;
}): Promise<PathCrawlResult> {
  const path = await (args.db as any).ingestionPath.findUnique({
    where: { id: args.pathId },
    select: {
      id: true,
      siteProfileId: true,
      baseUrl: true,
      contentType: true,
      indexPattern: true,
      linkPattern: true,
      paginationType: true,
    },
  });

  if (!path) throw new Error(`IngestionPath not found: ${args.pathId}`);

  const maxPages = args.maxPagesPerRun ?? 1;
  const now = new Date();
  let totalFound = 0;
  let totalNew = 0;
  let done = false;
  let errorMessage: string | null = null;

  if (path.paginationType === "letter" && path.indexPattern?.includes("[letter]")) {
    const existingSource = await (args.db as any).directorySource.findFirst({
      where: {
        siteProfileId: path.siteProfileId,
        indexPattern: path.indexPattern ?? "",
      },
      select: { id: true },
    });

    if (existingSource) {
      const { runDirectoryCrawl } = await import("@/lib/ingest/run-directory-crawl");
      const result = await runDirectoryCrawl({
        db: args.db,
        sourceId: existingSource.id,
        maxPagesPerRun: maxPages,
        aiApiKey: args.aiApiKey,
        aiProviderName: args.aiProviderName,
      });
      totalFound = result.found;
      totalNew = result.newEntities;
      done = result.done;
    } else {
      logWarn({
        message: "path_crawl_no_directory_source",
        pathId: args.pathId,
        note: "Letter-paginated path has no linked DirectorySource — skipping",
      });
    }
  } else {
    let currentPage = 1;

    for (let i = 0; i < maxPages && !done; i += 1) {
      const pageNumber = currentPage;
      const pageUrl = buildPageUrl(
        path.baseUrl,
        path.indexPattern,
        path.paginationType,
        { letter: "A", page: pageNumber },
      );

      try {
        const response = await fetchHtmlWithGuards(pageUrl);
        const hostname = (() => {
          try {
            return new URL(path.baseUrl).hostname.replace(/^www\./, "");
          } catch {
            return "";
          }
        })();

        const strategyChain = buildStrategyChain({
          html: response.html,
          linkPattern: path.linkPattern,
          aiApiKey: args.aiApiKey,
          aiProviderName: args.aiProviderName,
        });

        let entities: Array<{ entityUrl: string; entityName: string | null }> = [];
        let usedStrategy = "none";

        for (const strategy of strategyChain) {
          try {
            const found = await strategy.extractEntities({
              html: response.html,
              pageUrl: response.finalUrl,
              baseUrl: path.baseUrl,
              linkPattern: path.linkPattern,
              sourceBaseHostname: hostname,
            });
            if (found.length > 0) {
              entities = found;
              usedStrategy = strategy.name;
              break;
            }
          } catch (err) {
            logWarn({
              message: "path_crawl_strategy_failed",
              pathId: args.pathId,
              strategy: strategy.name,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (entities.length > 0) {
          logInfo({
            message: "path_crawl_page",
            pathId: args.pathId,
            contentType: path.contentType,
            pageUrl,
            strategy: usedStrategy,
            found: entities.length,
          });

          totalFound += entities.length;

          const linkedSource = await (args.db as any).directorySource.findFirst({
            where: { siteProfileId: path.siteProfileId },
            select: { id: true },
          });

          if (linkedSource) {
            for (const entity of entities) {
              const existing = await args.db.directoryEntity.findUnique({
                where: {
                  directorySourceId_entityUrl: {
                    directorySourceId: linkedSource.id,
                    entityUrl: entity.entityUrl,
                  },
                },
                select: { id: true },
              });

              await args.db.directoryEntity.upsert({
                where: {
                  directorySourceId_entityUrl: {
                    directorySourceId: linkedSource.id,
                    entityUrl: entity.entityUrl,
                  },
                },
                create: {
                  directorySourceId: linkedSource.id,
                  entityUrl: entity.entityUrl,
                  entityName: entity.entityName,
                  lastSeenAt: now,
                },
                update: {
                  entityName: entity.entityName ?? undefined,
                  lastSeenAt: now,
                },
              });

              if (!existing) totalNew += 1;
            }
          }
        } else {
          const classification = await classifyPage({
            url: pageUrl,
            html: response.html,
            aiApiKey: args.aiApiKey,
            aiProviderName: args.aiProviderName,
          }).catch(() => ({ pageType: "unknown" as PageType, confidence: 0, reasoning: "" }));

          logInfo({
            message: "path_crawl_page_classified",
            pathId: args.pathId,
            pageUrl,
            pageType: classification.pageType,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
          });

          if (
            classification.pageType === "artist_profile"
            && classification.confidence >= 60
            && path.contentType === "artist"
          ) {
            const linkedSource = await (args.db as any).directorySource.findFirst({
              where: { siteProfileId: path.siteProfileId },
              select: { id: true },
            });

            if (linkedSource) {
              await args.db.directoryEntity.upsert({
                where: {
                  directorySourceId_entityUrl: {
                    directorySourceId: linkedSource.id,
                    entityUrl: pageUrl,
                  },
                },
                create: {
                  directorySourceId: linkedSource.id,
                  entityUrl: pageUrl,
                  entityName: null,
                  lastSeenAt: now,
                },
                update: { lastSeenAt: now },
              });
              totalNew += 1;
              totalFound += 1;
            }
          } else if (
            (classification.pageType === "event_detail" || classification.pageType === "exhibition_overview")
            && classification.confidence >= 60
            && (path.contentType === "event" || path.contentType === "exhibition")
          ) {
            const linkedSource = await (args.db as any).directorySource.findFirst({
              where: { siteProfileId: path.siteProfileId },
              select: { id: true },
            });

            if (linkedSource) {
              await args.db.directoryEntity.upsert({
                where: {
                  directorySourceId_entityUrl: {
                    directorySourceId: linkedSource.id,
                    entityUrl: pageUrl,
                  },
                },
                create: {
                  directorySourceId: linkedSource.id,
                  entityUrl: pageUrl,
                  entityName: null,
                  lastSeenAt: now,
                },
                update: { lastSeenAt: now },
              });
              totalFound += 1;
            }
          } else {
            logWarn({
              message: "path_crawl_no_entities",
              pathId: args.pathId,
              pageUrl,
              pageType: classification.pageType,
            });
            done = true;
            break;
          }
        }

        if (path.paginationType === "none") {
          done = true;
        }

        currentPage += 1;
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        logWarn({ message: "path_crawl_page_failed", pathId: args.pathId, pageUrl, error: errorMessage });
        done = true;
      }
    }
  }

  await (args.db as any).ingestionPath.update({
    where: { id: args.pathId },
    data: {
      lastRunAt: now,
      lastRunFound: totalFound,
      lastRunError: errorMessage,
    },
  }).catch(() => {});

  return {
    pathId: args.pathId,
    contentType: path.contentType,
    found: totalFound,
    newEntities: totalNew,
    done,
    error: errorMessage,
  };
}
