import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { getGoalProgress } from "@/lib/discovery/goal-service";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
  notes: z.string().max(500).nullable().optional(),
  targetCount: z.number().int().min(1).max(1000).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  noStore();
  try {
    await requireAdmin();
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const goal = await db.discoveryGoal.findUnique({ where: { id: parsed.data.id } });
    if (!goal) return apiError(404, "not_found", "Goal not found");

    const [progress, jobs] = await Promise.all([
      getGoalProgress(db, goal.id),
      db.ingestDiscoveryJob.findMany({
        where: { goalId: goal.id },
        orderBy: [{ createdAt: "desc" }],
        take: 20,
        select: {
          id: true,
          createdAt: true,
          candidatesQueued: true,
          candidatesSkipped: true,
          status: true,
          queryYield: true,
          queryTemplate: true,
        },
      }),
    ]);

    return NextResponse.json(
      { goal, progress, jobs },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const parsedBody = patchSchema.safeParse(await req.json());
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", parsedBody.error.flatten());

    const existing = await db.discoveryGoal.findUnique({ where: { id: parsedParams.data.id }, select: { id: true } });
    if (!existing) return apiError(404, "not_found", "Goal not found");

    const goal = await db.discoveryGoal.update({
      where: { id: parsedParams.data.id },
      data: parsedBody.data,
    });

    return NextResponse.json(
      { goal },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
