import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

const querySchema = z.object({
  type: z.enum(["crawl", "discovery", "all"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    const { type, page, pageSize } = parsed.success ? parsed.data : { type: "all" as const, page: 1, pageSize: 50 };
    const skip = (page - 1) * pageSize;
    const sourceId = parsedParams.data.id;

    const [crawlRuns, discoveryLogs] = await Promise.all([
      type !== "discovery"
        ? db.directoryCrawlRun.findMany({
          where: { directorySourceId: sourceId },
          orderBy: { crawledAt: "desc" },
          take: type === "all" ? pageSize * 2 : pageSize,
          skip: type === "all" ? 0 : skip,
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
        })
        : Promise.resolve([]),
      type !== "crawl"
        ? db.directoryDiscoveryLog.findMany({
          where: { directorySourceId: sourceId },
          orderBy: { createdAt: "desc" },
          take: type === "all" ? pageSize * 2 : pageSize,
          skip: type === "all" ? 0 : skip,
          select: {
            id: true,
            entityId: true,
            entityUrl: true,
            entityName: true,
            status: true,
            candidateId: true,
            errorMessage: true,
            model: true,
            tokensUsed: true,
            confidenceScore: true,
            confidenceBand: true,
            durationMs: true,
            createdAt: true,
          },
        })
        : Promise.resolve([]),
    ]);

    const taggedCrawl = crawlRuns.map((r) => ({
      ...r,
      _type: "crawl" as const,
      _time: r.crawledAt.toISOString(),
    }));

    const taggedDiscovery = discoveryLogs.map((r) => ({
      ...r,
      _type: "discovery" as const,
      _time: r.createdAt.toISOString(),
    }));

    const combined = [...taggedCrawl, ...taggedDiscovery]
      .sort((a, b) => b._time.localeCompare(a._time))
      .slice(0, pageSize);

    return NextResponse.json({
      logs: combined,
      page,
      pageSize,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_directory_logs_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
