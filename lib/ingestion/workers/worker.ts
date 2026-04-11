import { db } from "@/lib/db";
import { crawlGallerySource } from "@/lib/ingestion/crawler/crawler";
import { extractEntityLinks, extractNamesFromDirectoryHtml } from "@/lib/ingestion/directory/miner";
import { dequeueIngestionJob, enqueueIngestionJob, markJobFailed, markJobSucceeded } from "@/lib/ingestion/jobs/queue";
import { discoverArtist } from "@/lib/ingest/artist-discovery";
import { extractGalleryPage } from "@/lib/ingestion/pipeline";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { logWarn } from "@/lib/logging";

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
        const payload = job.payload as { directorySourceId: string; url: string; letter?: string };
        const source = await db.directorySource.findUnique({
          where: { id: payload.directorySourceId },
          select: { id: true, entityType: true, baseUrl: true },
        });
        if (!source) {
          await markJobSucceeded(job, { skipped: true });
          break;
        }

        const fetched = await fetchHtmlWithGuards(payload.url);
        const links = extractEntityLinks(fetched.html, payload.url);
        const names = extractNamesFromDirectoryHtml(fetched.html, payload.url);

        for (const link of links) {
          const matchingName = names.find((name) => link.toLowerCase().includes(
            name.toLowerCase().replace(/\s+/g, "-"),
          )) ?? null;
          await enqueueIngestionJob("entity-page", {
            directorySourceId: payload.directorySourceId,
            entityUrl: link,
            entityTypeHint: source.entityType,
            entityName: matchingName,
          }, { idempotencyKey: `${payload.directorySourceId}:${link}` });
        }
        await markJobSucceeded(job, { links: links.length, names: names.length });
        break;
      }
      case "entity-page": {
        const payload = job.payload as {
          directorySourceId: string;
          entityUrl: string;
          entityTypeHint?: string | null;
          entityName?: string | null;
        };

        await db.directoryEntity.upsert({
          where: { directorySourceId_entityUrl: { directorySourceId: payload.directorySourceId, entityUrl: payload.entityUrl } },
          update: { lastSeenAt: new Date(), ...(payload.entityName ? { entityName: payload.entityName } : {}) },
          create: {
            directorySourceId: payload.directorySourceId,
            entityUrl: payload.entityUrl,
            entityName: payload.entityName ?? null,
            lastSeenAt: new Date(),
          },
        });

        if (payload.entityTypeHint === "ARTIST" && payload.entityName) {
          const settings = await db.siteSettings.findUnique({
            where: { id: "default" },
            select: {
              googlePseApiKey: true,
              googlePseCx: true,
              artistBioProvider: true,
              anthropicApiKey: true,
              openAiApiKey: true,
              geminiApiKey: true,
            },
          });

          const stubEvent = await getOrCreateDirectoryStubEvent(db, payload.directorySourceId);

          if (stubEvent) {
            await discoverArtist({
              db: db as never,
              artistName: payload.entityName,
              eventId: stubEvent.id,
              settings: {
                googlePseApiKey: settings?.googlePseApiKey,
                googlePseCx: settings?.googlePseCx,
                artistBioProvider: settings?.artistBioProvider,
                anthropicApiKey: settings?.anthropicApiKey,
                openAiApiKey: settings?.openAiApiKey,
                geminiApiKey: settings?.geminiApiKey,
              },
            }).catch((err) => logWarn({ message: "entity_page_discover_artist_failed", entityUrl: payload.entityUrl, err }));
          }
        }

        await markJobSucceeded(job, { entityUrl: payload.entityUrl, entityName: payload.entityName });
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

export async function getOrCreateDirectoryStubEvent(
  appDb: typeof db,
  directorySourceId: string,
): Promise<{ id: string } | null> {
  const existing = await appDb.event.findFirst({
    where: {
      title: `[Directory Source: ${directorySourceId}]`,
      isPublished: false,
    },
    select: { id: true },
  });
  if (existing) return existing;

  const stubVenue = await appDb.venue.findFirst({
    where: { isPublished: false, aiGenerated: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!stubVenue) return null;

  return appDb.event.create({
    data: {
      venueId: stubVenue.id,
      title: `[Directory Source: ${directorySourceId}]`,
      slug: `directory-source-${directorySourceId}`,
      isPublished: false,
      status: "DRAFT",
      startAt: new Date("2099-01-01"),
      timezone: "UTC",
    },
    select: { id: true },
  }).catch(() => null);
}
