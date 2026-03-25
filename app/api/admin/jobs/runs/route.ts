import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { logAdminAction } from "@/lib/admin-audit";
import { withAdminRoute } from "@/lib/admin-route";
import { db } from "@/lib/db";
export const runtime = "nodejs";

const querySchema = z.object({
  name: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  actorEmail: z.string().trim().min(1).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().trim().min(1).optional(),
});

export async function GET(req: NextRequest) {
  return withAdminRoute(async ({ actorEmail }) => {
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "invalid_request", message: "Invalid query params" } }, { status: 400 });
    }

    const { name, status, actorEmail: actorFilter, take, cursor } = parsed.data;
    const where: Prisma.JobRunWhereInput = {
      ...(name ? { name } : {}),
      ...(status ? { status } : {}),
      ...(actorFilter ? { actorEmail: { contains: actorFilter, mode: "insensitive" } } : {}),
    };

    const rows = await db.jobRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const runs = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? runs[runs.length - 1]?.id : undefined;

    await logAdminAction({
      actorEmail,
      action: "admin.jobs.read",
      targetType: "job",
      metadata: {
        filters: {
          name: name ?? null,
          status: status ?? null,
          actorEmail: actorFilter ?? null,
        },
        take,
      } satisfies Prisma.InputJsonValue,
      req,
    });

    return NextResponse.json({ ok: true, runs, nextCursor });
  });
}
