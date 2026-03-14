import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const days = Math.min(parseInt(searchParams.get("days") ?? "7", 10), 90);
    const errorCode = searchParams.get("errorCode") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = 50;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where = {
      status: "FAILED" as const,
      createdAt: { gte: since },
      ...(errorCode ? { errorCode: { contains: errorCode, mode: "insensitive" as const } } : {}),
    };

    const [runs, total] = await Promise.all([
      db.ingestRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          status: true,
          sourceUrl: true,
          errorCode: true,
          errorMessage: true,
          errorDetail: true,
          durationMs: true,
          venue: { select: { id: true, name: true } },
        },
      }),
      db.ingestRun.count({ where }),
    ]);

    return NextResponse.json(
      { runs, total, page, pageSize },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
