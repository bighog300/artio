import { NextResponse } from "next/server";
import type { CronJob } from "@prisma/client";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function serializeCronJob(job: CronJob) {
  return {
    ...job,
    nextFireAt: job.nextFireAt ? job.nextFireAt.toISOString() : null,
    lastFiredAt: job.lastFiredAt ? job.lastFiredAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    await requireAdmin({ redirectOnFail: false });
    const jobs = await db.cronJob.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ jobs: jobs.map(serializeCronJob) });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
