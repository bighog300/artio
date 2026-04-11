import type { PrismaClient } from "@prisma/client";
import { buildStrategyChain } from "@/lib/ingest/directory/auto-detect";
import { IngestError } from "@/lib/ingest/errors";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import type { ProviderName } from "@/lib/ingest/providers";
import { normaliseDirectoryName } from "@/lib/ingestion/directory/miner";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function normalizeHostname(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;

  const withProtocol = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function buildIndexUrl(indexPattern: string, letter: string, page: number): string {
  let url = indexPattern.replaceAll("[letter]", letter);
  if (url.includes("[page]")) {
    url = url.replaceAll("[page]", String(page));
  }
  return url;
}

function nextLetter(letter: string): string | null {
  const index = LETTERS.indexOf(letter.toUpperCase());
  if (index < 0) return "A";
  if (index >= LETTERS.length - 1) return null;
  return LETTERS[index + 1];
}

export async function runDirectoryCrawl(args: {
  db: PrismaClient;
  sourceId: string;
  maxPagesPerRun?: number;
  aiApiKey?: string | null;
  aiProviderName?: string | null;
}): Promise<{ letter: string; page: number; found: number; newEntities: number; done: boolean }> {
  const maxPagesPerRun = args.maxPagesPerRun ?? 1;

  const source = await args.db.directorySource.findUnique({
    where: { id: args.sourceId },
    include: { cursor: true },
  });
  if (!source) {
    throw new Error("Directory source not found");
  }

  const cursor = source.cursor ?? await args.db.directoryCursor.create({
    data: {
      directorySourceId: source.id,
      currentLetter: "A",
      currentPage: 1,
    },
  });

  const now = new Date();
  const sourceBaseHostname = normalizeHostname(source.baseUrl);
  if (!sourceBaseHostname) throw new Error("Invalid directory source baseUrl hostname");

  const currentLetter = /^[A-Z]$/.test(cursor.currentLetter.toUpperCase()) ? cursor.currentLetter.toUpperCase() : "A";
  const currentPage = Number.isFinite(cursor.currentPage) && cursor.currentPage > 0 ? cursor.currentPage : 1;

  let processedLetter = currentLetter;
  let processedPage = currentPage;
  let totalFound = 0;
  let totalNew = 0;
  let done = false;
  let detectedStrategyForThisRun: string | null = null;

  try {
    let nextCursorLetter = currentLetter;
    let nextCursorPage = currentPage;

    for (let i = 0; i < maxPagesPerRun; i += 1) {
      processedLetter = nextCursorLetter;
      processedPage = nextCursorPage;
      const letterStartMs = Date.now();

      const crawlUrl = buildIndexUrl(source.indexPattern, processedLetter, processedPage);
      const response = await fetchHtmlWithGuards(crawlUrl);

      const strategyChain = buildStrategyChain({
        html: response.html,
        linkPattern: source.linkPattern ?? null,
        aiApiKey: args.aiApiKey,
        aiProviderName: args.aiProviderName as ProviderName | undefined,
      });

      let entities: Array<{ entityUrl: string; entityName: string | null }> = [];
      let usedStrategy = "none";

      for (const strategy of strategyChain) {
        try {
          const found = await strategy.extractEntities({
            html: response.html,
            pageUrl: response.finalUrl,
            baseUrl: source.baseUrl,
            linkPattern: source.linkPattern ?? null,
            sourceBaseHostname,
          });

          if (found.length > 0) {
            entities = found;
            usedStrategy = strategy.name;
            break;
          }
        } catch (err) {
          console.warn("run_directory_crawl_strategy_failed", {
            sourceId: args.sourceId,
            strategy: strategy.name,
            letter: processedLetter,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      detectedStrategyForThisRun = usedStrategy;

      console.info("run_directory_crawl_strategy", {
        sourceId: args.sourceId,
        letter: processedLetter,
        strategy: usedStrategy,
        found: entities.length,
        chainTried: strategyChain.map((s) => s.name),
      });

      if (entities.length === 0) {
        console.warn("run_directory_crawl_no_entities", {
          sourceId: args.sourceId,
          crawlUrl,
          finalUrl: response.finalUrl,
          chainTried: strategyChain.map((s) => s.name),
          htmlLength: response.html.length,
          htmlPreview: response.html.slice(0, 500),
        });
      }

      totalFound += entities.length;
      let newThisLetter = 0;

      let artistWebsiteByHost: Map<string, string> | null = null;
      if (source.entityType === "ARTIST" && entities.length > 0) {
        const artists = await args.db.artist.findMany({
          where: { deletedAt: null, websiteUrl: { not: null } },
          select: { id: true, websiteUrl: true },
        });
        artistWebsiteByHost = new Map<string, string>();
        for (const artist of artists) {
          const host = normalizeHostname(artist.websiteUrl);
          if (host && !artistWebsiteByHost.has(host)) artistWebsiteByHost.set(host, artist.id);
        }
      }

      for (const entity of entities) {
        let matchedArtistId: string | null = null;
        const normalisedName = entity.entityName
          ? (normaliseDirectoryName(entity.entityName) ?? entity.entityName)
          : null;

        if (source.entityType === "ARTIST" && artistWebsiteByHost) {
          const host = normalizeHostname(entity.entityUrl);
          matchedArtistId = host ? (artistWebsiteByHost.get(host) ?? null) : null;
        }

        const existing = await args.db.directoryEntity.findUnique({
          where: {
            directorySourceId_entityUrl: {
              directorySourceId: source.id,
              entityUrl: entity.entityUrl,
            },
          },
          select: { id: true },
        });

        await args.db.directoryEntity.upsert({
          where: {
            directorySourceId_entityUrl: {
              directorySourceId: source.id,
              entityUrl: entity.entityUrl,
            },
          },
          create: {
            directorySourceId: source.id,
            entityUrl: entity.entityUrl,
            entityName: normalisedName,
            matchedArtistId,
            lastSeenAt: now,
          },
          update: {
            entityName: normalisedName,
            matchedArtistId: matchedArtistId ?? undefined,
            lastSeenAt: now,
          },
        });

        if (!existing) {
          totalNew += 1;
          newThisLetter += 1;
        }
      }

      const runDurationMs = Date.now() - letterStartMs;
      await args.db.directoryCrawlRun.create({
        data: {
          directorySourceId: source.id,
          letter: processedLetter,
          page: processedPage,
          strategy: usedStrategy,
          found: entities.length,
          newEntities: newThisLetter,
          errorMessage: entities.length === 0 ? `No entities found. Chain tried: ${strategyChain.map((strategy) => strategy.name).join(", ")}` : null,
          htmlPreview: entities.length === 0 ? response.html.slice(0, 500) : null,
          durationMs: runDurationMs,
        },
      }).catch((err: unknown) => {
        console.warn("run_directory_crawl_run_write_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      const shouldAdvanceLetter = entities.length === 0 || processedPage >= source.maxPagesPerLetter;
      if (shouldAdvanceLetter) {
        const next = nextLetter(processedLetter);
        if (!next) {
          done = true;
          nextCursorLetter = "A";
          nextCursorPage = 1;
          break;
        }
        nextCursorLetter = next;
        nextCursorPage = 1;
      } else {
        nextCursorPage += 1;
      }
    }

    await args.db.directoryCursor.update({
      where: { id: cursor.id },
      data: {
        currentLetter: nextCursorLetter,
        currentPage: nextCursorPage,
        lastRunAt: now,
        lastSuccessAt: now,
        lastError: null,
      },
    });
    await args.db.directorySource.update({
      where: { id: source.id },
      data: {
        lastRunFound: totalFound,
        lastRunStrategy: detectedStrategyForThisRun,
        lastRunError: null,
      },
    });

    return {
      letter: processedLetter,
      page: processedPage,
      found: totalFound,
      newEntities: totalNew,
      done,
    };
  } catch (error) {
    const lastRunError = error instanceof IngestError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : String(error);

    if (error instanceof IngestError) {
      await args.db.directoryCursor.update({
        where: { id: cursor.id },
        data: {
          lastRunAt: now,
          lastError: lastRunError,
        },
      });
    } else {
      await args.db.directoryCursor.update({
        where: { id: cursor.id },
        data: {
          lastRunAt: now,
          lastError: lastRunError,
        },
      });
    }
    await args.db.directorySource.update({
      where: { id: source.id },
      data: {
        lastRunFound: totalFound,
        lastRunStrategy: detectedStrategyForThisRun,
        lastRunError,
      },
    });

    return {
      letter: processedLetter,
      page: processedPage,
      found: totalFound,
      newEntities: totalNew,
      done: false,
    };
  }
}
