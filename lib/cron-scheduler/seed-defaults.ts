import type { PrismaClient } from "@prisma/client";
import { computeNextFireAt } from "@/lib/cron-scheduler/cron-expression";

type CronJobCreateInput = {
  name: string;
  displayName: string;
  endpoint: string;
  schedule: string;
  enabled: boolean;
};

export const DEFAULT_CRON_JOBS: CronJobCreateInput[] = [
  { name: "outbox_send", displayName: "Outbox Send", endpoint: "/api/cron/outbox/send", schedule: "*/5 * * * *", enabled: true },
  { name: "digests_weekly", displayName: "Weekly Digests", endpoint: "/api/cron/digests/weekly", schedule: "20 2 * * 0", enabled: true },
  { name: "retention_engagement", displayName: "Retention & Engagement", endpoint: "/api/cron/retention/engagement", schedule: "35 2 * * *", enabled: true },
  { name: "editorial_notifications", displayName: "Editorial Notifications", endpoint: "/api/cron/editorial-notifications", schedule: "0 9 * * *", enabled: true },
  { name: "ingest_venues", displayName: "Venue Ingest", endpoint: "/api/cron/ingest/venues", schedule: "50 2 * * *", enabled: true },
  { name: "ingest_regions", displayName: "Region Ingest", endpoint: "/api/cron/ingest/regions", schedule: "0 2 * * *", enabled: true },
  { name: "ingest_discovery", displayName: "Ingest Discovery", endpoint: "/api/cron/ingest/discovery", schedule: "0 * * * *", enabled: false },
  { name: "sync_google_events", displayName: "Google Event Sync", endpoint: "/api/cron/sync-google-events", schedule: "0 3 * * *", enabled: false },
  { name: "geocode_venues", displayName: "Geocode Venues", endpoint: "/api/cron/geocode-venues", schedule: "0 4 * * *", enabled: false },
  { name: "ingest_backfill_artists", displayName: "Backfill Event Artists", endpoint: "/api/cron/ingest/backfill-artists", schedule: "20 4 * * *", enabled: true },
  { name: "ingest_backfill_artworks", displayName: "Backfill Event Artworks", endpoint: "/api/cron/ingest/backfill-artworks", schedule: "40 4 * * *", enabled: true },
  { name: "artwork_score_completeness", displayName: "Artwork: Score Completeness", endpoint: "/api/cron/artworks/score-completeness", schedule: "0 3 * * *", enabled: true },
  { name: "artwork_normalize_fields", displayName: "Artwork: Normalize Fields", endpoint: "/api/cron/artworks/normalize-fields", schedule: "10 3 * * *", enabled: true },
  { name: "artwork_recover_images", displayName: "Artwork: Recover Images", endpoint: "/api/cron/artworks/recover-images", schedule: "20 3 * * *", enabled: true },
  { name: "artwork_enrich_descriptions", displayName: "Artwork: Enrich Descriptions", endpoint: "/api/cron/artworks/enrich-descriptions", schedule: "30 3 * * *", enabled: true },
  { name: "artwork_autotag", displayName: "Artwork: Auto-tag", endpoint: "/api/cron/artworks/autotag", schedule: "40 3 * * *", enabled: true },
  { name: "artist_score_completeness", displayName: "Artist: Score Completeness", endpoint: "/api/cron/artists/score-completeness", schedule: "0 4 * * *", enabled: true },
  { name: "venue_score_completeness", displayName: "Venue: Score Completeness", endpoint: "/api/cron/venues/score-completeness", schedule: "10 4 * * *", enabled: true },
  { name: "health", displayName: "Health Check", endpoint: "/api/cron/health", schedule: "*/15 * * * *", enabled: true },
  { name: "feed_cache_refresh", displayName: "Feed Cache Refresh", endpoint: "/api/cron/feed-cache", schedule: "*/20 * * * *", enabled: true },
];

export async function seedDefaultCronJobs(db: Pick<PrismaClient, "cronJob">) {
  const now = new Date();
  await db.cronJob.createMany({
    data: DEFAULT_CRON_JOBS.map((job) => ({
      ...job,
      nextFireAt: computeNextFireAt(job.schedule, now),
    })),
    skipDuplicates: true,
  });
}
