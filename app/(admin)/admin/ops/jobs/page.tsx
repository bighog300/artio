import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { JOBS, JOB_NAMES } from "@/lib/jobs/registry";
import { JobsPanelClient } from "./jobs-panel-client";

export const dynamic = "force-dynamic";

export default async function AdminJobsPage() {
  await requireAdmin({ redirectOnFail: true });

  const runs = await db.jobRun.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });

  const jobs = JOB_NAMES.map((name) => ({ name, description: JOBS[name].description }));

  return (
    <main className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Jobs</h1>
        <p className="text-sm text-muted-foreground">Trigger safe run-now jobs and inspect recent execution history.</p>
      </div>
      <JobsPanelClient
        jobs={jobs}
        initialRuns={runs.map((run) => ({
          ...run,
          metadata: (run.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata)) ? run.metadata as Record<string, unknown> : null,
          createdAt: run.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
