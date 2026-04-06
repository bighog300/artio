import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getStrategy } from "@/lib/ingestion/strategies/registry";
import { fuzzyArtistConfidence, normalizeArtistName } from "@/lib/ingestion/matching/normalize";
import { logInfo } from "@/lib/logging";

export async function extractGalleryPage(params: { galleryPageId: string; gallerySourceId: string }) {
  const [page, source] = await Promise.all([
    db.galleryPage.findUnique({ where: { id: params.galleryPageId } }),
    db.gallerySource.findUnique({ where: { id: params.gallerySourceId } }),
  ]);

  if (!page || !source) throw new Error("gallery_page_or_source_not_found");

  const strategy = getStrategy(source.strategyType ?? source.platformType ?? null);
  const result = await strategy.extract({ pageUrl: page.url, html: page.html ?? "", gallery: source });

  for (const extractedArtist of result.artists) {
    const normalized = normalizeArtistName(extractedArtist.name);

    const existing = await db.ingestExtractedArtist.findFirst({
      where: { normalizedName: normalized },
      select: { id: true, name: true, normalizedName: true },
    });

    if (existing) {
      const confidence = fuzzyArtistConfidence(existing.name, extractedArtist.name);
      if (confidence >= 0.92) continue;
    }

    await db.ingestExtractedArtist.create({
      data: {
        name: extractedArtist.name,
        normalizedName: normalized,
        sourceUrl: page.url,
        searchQuery: source.name,
        confidenceScore: Math.round(extractedArtist.confidence * 100),
        confidenceBand: extractedArtist.confidence > 0.8 ? "HIGH" : extractedArtist.confidence > 0.5 ? "MEDIUM" : "LOW",
        fingerprint: `${source.id}:${normalized}`,
        extractionProvider: source.strategyType ?? "dom",
      },
    }).catch(() => undefined);
  }

  for (const event of result.events) {
    await db.ingestExtractedEvent.create({
      data: {
        runId: source.lastIngestRunId ?? (await ensureDefaultRunId(source.id)),
        venueId: source.venueId,
        fingerprint: `${source.id}:${event.title}:${event.sourceUrl}`,
        similarityKey: `${source.id}:${event.title.toLowerCase().replace(/\s+/g, " ")}`,
        clusterKey: `${source.id}:${new Date().toISOString().slice(0, 10)}`,
        sourceUrl: event.sourceUrl,
        title: event.title,
        description: event.description ?? null,
        artistNames: event.artistNames,
        rawJson: event as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);
  }

  await db.galleryPage.update({
    where: { id: page.id },
    data: {
      extractedAt: new Date(),
      extractionStatus: "SUCCEEDED",
      extractedEventsCount: result.events.length,
      extractedArtistsCount: result.artists.length,
      extractedArtworksCount: result.artworks.length,
      extractionHash: result.contentHash,
    },
  });

  await db.ingestMetrics.create({
    data: {
      bucketDate: new Date(new Date().toISOString().slice(0, 10)),
      gallerySourceId: source.id,
      pagesCrawled: 0,
      pagesExtracted: 1,
      eventsExtracted: result.events.length,
      artistsExtracted: result.artists.length,
      artworksExtracted: result.artworks.length,
      failedJobs: 0,
      succeededJobs: 1,
    },
  });

  logInfo({ message: "gallery_page_extracted", gallerySourceId: source.id, pageId: page.id, events: result.events.length });
  return result;
}

async function ensureDefaultRunId(venueId: string): Promise<string> {
  const run = await db.ingestRun.create({
    data: {
      venueId,
      sourceUrl: "gallery-source",
      status: "RUNNING",
      startedAt: new Date(),
    },
    select: { id: true },
  });

  return run.id;
}
