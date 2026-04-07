import { db } from "@/lib/db";
import { crawlGallerySource } from "@/lib/ingestion/crawler/crawler";
import { extractEntityLinks } from "@/lib/ingestion/directory/miner";
import { dequeueIngestionJob, enqueueIngestionJob, markJobFailed, markJobSucceeded } from "@/lib/ingestion/jobs/queue";
import { extractGalleryPage } from "@/lib/ingestion/pipeline";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";

async function processOne() {
  const job = await dequeueIngestionJob();
  if (!job) return { processed: false };

  try {
    switch (job.type) {
      case "crawl-page": {
        const payload = job.payload as { galleryPageId: string; gallerySourceId: string };
        await enqueueIngestionJob(
          "extract-page",
          {
            galleryPageId: payload.galleryPageId,
            gallerySourceId: payload.gallerySourceId,
            pageUrl: "",
          },
          { idempotencyKey: `extract-page:${payload.galleryPageId}` },
        );
        await markJobSucceeded(job, { forwarded: true });
        break;
      }
      case "crawl-gallery": {
        const payload = job.payload as { gallerySourceId: string };
        const result = await crawlGallerySource(payload.gallerySourceId);
        await markJobSucceeded(job, result);
        break;
      }
      case "extract-page": {
        const payload = job.payload as { galleryPageId: string; gallerySourceId: string };
        const result = await extractGalleryPage(payload);
        await markJobSucceeded(job, { events: result.events.length, artists: result.artists.length, artworks: result.artworks.length });
        break;
      }
      case "directory-page": {
        const payload = job.payload as { directorySourceId: string; url: string };
        const fetched = await fetchHtmlWithGuards(payload.url);
        const links = extractEntityLinks(fetched.html, payload.url);
        for (const link of links) {
          await enqueueIngestionJob("entity-page", { directorySourceId: payload.directorySourceId, entityUrl: link }, { idempotencyKey: `${payload.directorySourceId}:${link}` });
        }
        await markJobSucceeded(job, { links: links.length });
        break;
      }
      case "entity-page": {
        const payload = job.payload as { directorySourceId: string; entityUrl: string };
        await db.directoryEntity.upsert({
          where: { directorySourceId_entityUrl: { directorySourceId: payload.directorySourceId, entityUrl: payload.entityUrl } },
          update: { lastSeenAt: new Date() },
          create: { directorySourceId: payload.directorySourceId, entityUrl: payload.entityUrl, lastSeenAt: new Date() },
        });
        await markJobSucceeded(job, { entityUrl: payload.entityUrl });
        break;
      }
      case "enrich-artist":
      case "enrich-artwork": {
        await markJobSucceeded(job, { skipped: true, reason: "not_implemented" });
        break;
      }
      default:
        await markJobSucceeded(job, { skipped: true, reason: "handler_not_implemented" });
    }
    return { processed: true };
  } catch (error) {
    await markJobFailed(job, error);
    return { processed: true };
  }
}

export async function runIngestionWorkerLoop(limit = 25) {
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const tick = await processOne();
    if (!tick.processed) break;
    processed += 1;
  }
  return { processed };
}
