import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { createDiscoveryGoal, getGoalProgress } from "@/lib/discovery/goal-service";

export const runtime = "nodejs";

const PAGE_SIZE = 20;

const querySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
  entityType: z.enum(["VENUE", "ARTIST", "EVENT"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const postSchema = z.object({
  entityType: z.enum(["VENUE", "ARTIST", "EVENT"]),
  region: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  targetCount: z.number().int().min(1).max(1000),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query params", parsed.error.flatten());

    const page = parsed.data.page;
    const where: Prisma.DiscoveryGoalWhereInput = {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.entityType ? { entityType: parsed.data.entityType } : {}),
    };

    const [total, goals] = await Promise.all([
      db.discoveryGoal.count({ where }),
      db.discoveryGoal.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { _count: { select: { jobs: true } } },
      }),
    ]);

    const goalsWithProgress = await Promise.all(
      goals.map(async (goal) => ({
        ...goal,
        progress: await getGoalProgress(db, goal.id),
      })),
    );

    return NextResponse.json(
      { goals: goalsWithProgress, page, total },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest) {
  noStore();
  try {
    const admin = await requireAdmin();
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", parsed.error.flatten());

    const created = await createDiscoveryGoal(db, {
      ...parsed.data,
      createdById: admin.id,
    });

    return NextResponse.json(
      { goal: created },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_target_count") {
      return apiError(400, "invalid_request", "targetCount must be between 1 and 1000");
    }
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
