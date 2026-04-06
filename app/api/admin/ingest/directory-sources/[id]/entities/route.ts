import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const page = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.max(1, Math.min(200, Number.parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50", 10)));
    const unmatchedRaw = req.nextUrl.searchParams.get("unmatched");
    const unmatched = unmatchedRaw === "1" || unmatchedRaw === "true";

    const where = {
      directorySourceId: parsedParams.data.id,
      ...(unmatched ? { matchedArtistId: null } : {}),
    };

    const [entities, total] = await Promise.all([
      db.directoryEntity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          entityUrl: true,
          entityName: true,
          matchedArtistId: true,
          lastSeenAt: true,
          createdAt: true,
        },
      }),
      db.directoryEntity.count({ where }),
    ]);

    return NextResponse.json({
      entities: entities.map((entity) => ({
        ...entity,
        lastSeenAt: entity.lastSeenAt.toISOString(),
        createdAt: entity.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
