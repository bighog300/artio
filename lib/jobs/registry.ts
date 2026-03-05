import { db } from "@/lib/db";
import { runBlobCleanupOrphansJob } from "@/lib/jobs/blob-cleanup-orphans";
import { runVenueGenerationProcessRunJob } from "@/lib/jobs/venue-generation-process-run";

export type JobRunContext = {
  params?: unknown;
  actorEmail?: string | null;
};

export type JobResult = {
  message?: string;
  metadata?: Record<string, unknown>;
};

export type JobDefinition = {
  description: string;
  run: (ctx: JobRunContext) => Promise<JobResult | void>;
};

export const JOBS: Record<string, JobDefinition> = {
  "health.ping": {
    description: "Basic no-op health job used to verify job plumbing.",
    run: async () => ({
      message: "health ping ok",
      metadata: { ok: true },
    }),
  },
  "blob.cleanup-orphans": {
    description: "Delete unreferenced Vercel Blob images (dry-run supported).",
    run: async ({ params, actorEmail }) => runBlobCleanupOrphansJob({ params, actorEmail }),
  },
  "venue.generation.process-run": {
    description: "Process a pending VenueGenerationRun: geocode, homepage extraction, and image selection for each queued venue.",
    run: async ({ params }) => {
      const runId = (params as { runId?: unknown } | undefined)?.runId;
      if (typeof runId !== "string" || runId.trim().length === 0) {
        const { RunJobError } = await import("@/lib/jobs/run-job");
        throw new RunJobError(400, "missing_run_id");
      }
      return runVenueGenerationProcessRunJob({ runId: runId.trim() });
    },
  },
  "db.vacuum-lite": {
    description: "Lightweight DB check that validates connectivity and captures key table counts.",
    run: async () => {
      await db.$queryRaw`SELECT 1`;
      const [usersCount, eventsCount, venuesCount] = await Promise.all([
        db.user.count(),
        db.event.count(),
        db.venue.count(),
      ]);

      return {
        message: "database check completed",
        metadata: {
          usersCount,
          eventsCount,
          venuesCount,
        },
      };
    },
  },
};

export const JOB_NAMES = Object.keys(JOBS);
