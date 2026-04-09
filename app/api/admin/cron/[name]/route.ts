import { NextRequest, NextResponse } from "next/server";
import type { CronJob } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeNextFireAt } from "@/lib/cron-scheduler/engine";

export const runtime = "nodejs";

const bodySchema = z.object({
  schedule: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  displayName: z.string().min(1).optional(),
});

function serializeCronJob(job: CronJob) {
  return {
    ...job,
    nextFireAt: job.nextFireAt ? job.nextFireAt.toISOString() : null,
    lastFiredAt: job.lastFiredAt ? job.lastFiredAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload");

    const { name } = await params;
    const existing = await db.cronJob.findUnique({ where: { name } });
    if (!existing) return apiError(404, "not_found", "Cron job not found");

    let nextFireAt: Date | null | undefined;
    if (parsed.data.schedule !== undefined) {
      nextFireAt = computeNextFireAt(parsed.data.schedule, new Date());
      if (!nextFireAt) return NextResponse.json({ error: { code: "invalid_schedule" } }, { status: 400 });
    }

    const updated = await db.cronJob.update({
      where: { name },
      data: {
        ...(parsed.data.schedule !== undefined ? { schedule: parsed.data.schedule, nextFireAt } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
      },
    });

    return NextResponse.json({ job: serializeCronJob(updated) });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    console.error("admin_cron_name_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
