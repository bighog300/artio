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
  { name: "health", displayName: "Health Check", endpoint: "/api/cron/health", schedule: "*/15 * * * *", enabled: true },
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
