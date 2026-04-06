import { db } from "@/lib/db";
import { detectPlatform } from "@/lib/ingest/detect-platform";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { enqueueIngestionJob } from "@/lib/ingestion/jobs/queue";
import { logWarn } from "@/lib/logging";

export async function enqueueGalleryIngestionForVenue(venueId: string, sourceUrl: string) {
  let platformType: string | null = null;
  try {
    const fetched = await fetchHtmlWithGuards(sourceUrl, { timeoutMs: 8_000, maxBytes: 400_000 });
    platformType = detectPlatform(fetched.html, fetched.finalUrl);
  } catch (error) {
    logWarn({ message: "gallery_platform_detection_failed", venueId, sourceUrl, error: error instanceof Error ? error.message : String(error) });
  }

  const source = await db.gallerySource.upsert({
    where: { venueId_baseUrl: { venueId, baseUrl: sourceUrl } },
    update: {
      platformType,
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      venueId,
      name: `Venue ${venueId}`,
      baseUrl: sourceUrl,
      platformType,
      strategyType: platformType === "wordpress" ? "wordpress" : "dom",
      isActive: true,
    },
  });

  await enqueueIngestionJob("crawl-gallery", { gallerySourceId: source.id }, {
    idempotencyKey: `manual:${venueId}:${new Date().toISOString().slice(0, 13)}`,
  });

  return source.id;
}
