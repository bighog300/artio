import { db } from "@/lib/db";
import { enqueueIngestionJob } from "@/lib/ingestion/jobs/queue";

export async function scheduleGallerySync(limit = 100) {
  const now = new Date();
  const due = await db.gallerySource.findMany({
    where: {
      isActive: true,
      OR: [{ nextCrawlAt: null }, { nextCrawlAt: { lte: now } }],
    },
    take: limit,
    orderBy: [{ nextCrawlAt: "asc" }, { updatedAt: "asc" }],
    select: { id: true },
  });

  let queued = 0;
  for (const source of due) {
    const item = await enqueueIngestionJob("crawl-gallery", { gallerySourceId: source.id }, { idempotencyKey: `crawl-gallery:${source.id}:${now.toISOString().slice(0, 13)}` });
    if (item.enqueued) queued += 1;
  }

  return { queued };
}
