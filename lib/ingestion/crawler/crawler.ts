import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { logError, logInfo } from "@/lib/logging";
import { withDomainRateLimit } from "@/lib/ingestion/crawler/rate-limit";
import { enqueueIngestionJob } from "@/lib/ingestion/jobs/queue";

export async function crawlGallerySource(gallerySourceId: string) {
  const source = await db.gallerySource.findUnique({ where: { id: gallerySourceId } });
  if (!source || !source.isActive) return { crawled: 0, enqueued: 0 };

  const targetUrl = source.eventsPageUrl ?? source.baseUrl;
  if (!targetUrl) {
    logError({ message: "crawl_gallery_missing_url", gallerySourceId });
    return { crawled: 0, enqueued: 0 };
  }

  const fetchResult = await withDomainRateLimit(targetUrl, () => fetchHtmlWithGuards(targetUrl));
  const contentHash = createHash("sha256").update(fetchResult.html).digest("hex");
  const changed = source.lastContentHash !== contentHash;

  const page = await db.galleryPage.upsert({
    where: { gallerySourceId_url: { gallerySourceId, url: fetchResult.finalUrl } },
    update: {
      contentHash,
      html: fetchResult.html,
      crawlStatus: "SUCCEEDED",
      lastCrawledAt: new Date(),
      changed,
      updatedAt: new Date(),
    },
    create: {
      gallerySourceId,
      url: fetchResult.finalUrl,
      contentHash,
      html: fetchResult.html,
      crawlStatus: "SUCCEEDED",
      lastCrawledAt: new Date(),
      changed,
    },
  });

  await db.gallerySource.update({
    where: { id: gallerySourceId },
    data: {
      lastCrawledAt: new Date(),
      lastContentHash: contentHash,
      lastCrawlStatus: "SUCCEEDED",
      crawlFailureCount: 0,
      nextCrawlAt: new Date(Date.now() + source.crawlIntervalMinutes * 60_000),
    },
  });

  if (!changed) {
    logInfo({ message: "crawl_gallery_no_change", gallerySourceId, pageId: page.id });
    return { crawled: 1, enqueued: 0 };
  }

  const enqueue = await enqueueIngestionJob("extract-page", {
    galleryPageId: page.id,
    gallerySourceId,
    pageUrl: page.url,
  });

  return { crawled: 1, enqueued: enqueue.enqueued ? 1 : 0 };
}
