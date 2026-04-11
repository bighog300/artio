import type { PrismaClient } from "@prisma/client";
import { IngestError } from "@/lib/ingest/errors";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NAV_LABELS = new Set([
  "home",
  "about",
  "contact",
  "privacy",
  "terms",
  "login",
  "sign in",
  "sign up",
  "artists",
  "venues",
  "next",
  "previous",
  "back",
  "menu",
]);

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

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function isPlausibleName(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  if (normalized.length > 140) return false;
  const lower = normalized.toLowerCase();
  if (NAV_LABELS.has(lower)) return false;
  if (/^[0-9\W_]+$/.test(normalized)) return false;
  return /[a-z]/i.test(normalized);
}

function buildIndexUrl(indexPattern: string, letter: string, page: number): string {
  let url = indexPattern.replaceAll("[letter]", letter);
  if (url.includes("[page]")) {
    url = url.replaceAll("[page]", String(page));
  }
  return url;
}

function isEntityProfilePath(pathname: string, sourceBaseUrl: string): boolean {
  try {
    const basePath = new URL(sourceBaseUrl).pathname.toLowerCase();
    const linkPath = pathname.toLowerCase();
    const normalizedBasePath = basePath.replace(/\/$/, "");

    if (!linkPath.startsWith(normalizedBasePath)) return false;

    const remainder = linkPath.slice(normalizedBasePath.length);
    if (/^\/[a-z]?\/?$/.test(remainder)) return false;
    if (/\/(page|p)\/\d+/.test(remainder)) return false;

    return remainder.replace(/^\//, "").length > 1;
  } catch {
    return false;
  }
}

function extractEntities(args: { html: string; baseUrl: string; sourceBaseHostname: string }): Array<{ entityUrl: string; entityName: string | null }> {
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const entities: Array<{ entityUrl: string; entityName: string | null }> = [];
  const seen = new Set<string>();
  const base = new URL(args.baseUrl);

  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(args.html)) !== null) {
    const href = match[1]?.trim();
    const text = stripTags(match[2] ?? "");
    if (!href || !isPlausibleName(text)) continue;

    try {
      const resolved = new URL(href, base);
      const normalizedHost = resolved.hostname.toLowerCase().replace(/^www\./, "");
      if (normalizedHost !== args.sourceBaseHostname) continue;
      if (!isEntityProfilePath(resolved.pathname, args.baseUrl)) continue;
      if (seen.has(resolved.toString())) continue;

      seen.add(resolved.toString());
      entities.push({ entityUrl: resolved.toString(), entityName: text || null });
    } catch {
      continue;
    }
  }

  return entities;
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

  try {
    let nextCursorLetter = currentLetter;
    let nextCursorPage = currentPage;

    for (let i = 0; i < maxPagesPerRun; i += 1) {
      processedLetter = nextCursorLetter;
      processedPage = nextCursorPage;

      const crawlUrl = buildIndexUrl(source.indexPattern, processedLetter, processedPage);
      const response = await fetchHtmlWithGuards(crawlUrl);
      const entities = extractEntities({
        html: response.html,
        baseUrl: response.finalUrl,
        sourceBaseHostname,
      });

      totalFound += entities.length;

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
            entityName: entity.entityName,
            matchedArtistId,
            lastSeenAt: now,
          },
          update: {
            entityName: entity.entityName,
            matchedArtistId: matchedArtistId ?? undefined,
            lastSeenAt: now,
          },
        });

        if (!existing) totalNew += 1;
      }

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

    return {
      letter: processedLetter,
      page: processedPage,
      found: totalFound,
      newEntities: totalNew,
      done,
    };
  } catch (error) {
    if (error instanceof IngestError) {
      await args.db.directoryCursor.update({
        where: { id: cursor.id },
        data: {
          lastRunAt: now,
          lastError: `${error.code}: ${error.message}`,
        },
      });
    } else {
      await args.db.directoryCursor.update({
        where: { id: cursor.id },
        data: {
          lastRunAt: now,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    }

    return {
      letter: processedLetter,
      page: processedPage,
      found: totalFound,
      newEntities: totalNew,
      done: false,
    };
  }
}
