import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { runDirectoryPipeline } from "@/lib/ingest/directory/run-pipeline";
import type { ProviderName } from "@/lib/ingest/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const source = await db.directorySource.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, pipelineMode: true },
    });
    if (!source) return apiError(404, "not_found", "Directory source not found");

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { anthropicApiKey: true, openAiApiKey: true, eventExtractionProvider: true },
    });

    const aiApiKey = settings?.anthropicApiKey
      ?? process.env.ANTHROPIC_API_KEY
      ?? settings?.openAiApiKey
      ?? process.env.OPENAI_API_KEY
      ?? null;

    if (!aiApiKey) return apiError(500, "no_ai_key", "No AI API key configured in site settings");

    const result = await runDirectoryPipeline({
      db,
      sourceId: source.id,
      pipelineMode: source.pipelineMode === "manual" ? "auto_discover" : source.pipelineMode as "auto_discover" | "auto_full",
      aiApiKey,
      aiProviderName: (settings?.eventExtractionProvider as ProviderName | undefined) ?? "claude",
      maxPagesPerRun: 3,
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_directory_pipeline_error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
