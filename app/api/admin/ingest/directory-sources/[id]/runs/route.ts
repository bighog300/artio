import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const runs = await db.directoryCrawlRun.findMany({
      where: { directorySourceId: parsedParams.data.id },
      orderBy: { crawledAt: "desc" },
      take: 100,
      select: {
        id: true,
        letter: true,
        page: true,
        strategy: true,
        found: true,
        newEntities: true,
        errorMessage: true,
        htmlPreview: true,
        durationMs: true,
        crawledAt: true,
      },
    });

    return NextResponse.json({
      runs: runs.map((run) => ({
        ...run,
        crawledAt: run.crawledAt.toISOString(),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
