import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { runPathCrawl } from "@/lib/ingest/directory/run-path-crawl";
import type { ProviderName } from "@/lib/ingest/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const paramsSchema = z.object({
  hostname: z.string().min(3),
  pathId: z.string().uuid(),
});

export async function POST(_req: NextRequest, context: { params: Promise<{ hostname: string; pathId: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid params");

    const path = await (db as any).ingestionPath.findUnique({
      where: { id: parsedParams.data.pathId },
      select: { id: true, enabled: true },
    });
    if (!path) return apiError(404, "not_found", "Ingestion path not found");
    if (!path.enabled) return apiError(400, "path_disabled", "This ingestion path is disabled");

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { anthropicApiKey: true, openAiApiKey: true, eventExtractionProvider: true },
    });

    const aiApiKey = settings?.anthropicApiKey
      ?? process.env.ANTHROPIC_API_KEY
      ?? settings?.openAiApiKey
      ?? process.env.OPENAI_API_KEY
      ?? null;

    const result = await runPathCrawl({
      db,
      pathId: parsedParams.data.pathId,
      maxPagesPerRun: 3,
      aiApiKey,
      aiProviderName: (settings?.eventExtractionProvider as ProviderName | undefined) ?? "claude",
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_path_run_error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
