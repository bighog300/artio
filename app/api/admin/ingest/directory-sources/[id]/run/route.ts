import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { runDirectoryCrawl } from "@/lib/ingest/run-directory-crawl";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const source = await db.directorySource.findUnique({ where: { id: parsedParams.data.id }, select: { id: true } });
    if (!source) return apiError(404, "not_found", "Directory source not found");

    const result = await runDirectoryCrawl({ db, sourceId: parsedParams.data.id, maxPagesPerRun: 3 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_directory_sources_id_run_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
