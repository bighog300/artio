import { NextRequest, NextResponse } from "next/server";
import { extractCronSecret, validateCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { runDirectoryPipeline } from "@/lib/ingest/directory/run-pipeline";
import type { ProviderName } from "@/lib/ingest/providers";
import { getRequestId } from "@/lib/request-id";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req.headers);
  const authFailure = validateCronRequest(extractCronSecret(req.headers), {
    route: "/api/cron/directory-pipeline",
    requestId,
    method: req.method,
  });
  if (authFailure) return authFailure;

  const sources = await db.directorySource.findMany({
    where: {
      isActive: true,
      pipelineMode: { in: ["auto_discover", "auto_full"] },
    },
    select: {
      id: true,
      pipelineMode: true,
      crawlIntervalMinutes: true,
      lastPipelineRunAt: true,
    },
  });

  const settings = await db.siteSettings.findUnique({
    where: { id: "default" },
    select: { anthropicApiKey: true, openAiApiKey: true, eventExtractionProvider: true },
  });

  const aiApiKey = settings?.anthropicApiKey
    ?? process.env.ANTHROPIC_API_KEY
    ?? settings?.openAiApiKey
    ?? process.env.OPENAI_API_KEY
    ?? null;

  if (!aiApiKey) {
    return NextResponse.json({ ok: false, error: "No AI API key configured" }, { status: 500 });
  }

  const results = [];

  for (const source of sources) {
    const intervalMs = source.crawlIntervalMinutes * 60 * 1000;
    const lastRun = source.lastPipelineRunAt?.getTime() ?? 0;
    if (Date.now() - lastRun < intervalMs) continue;

    try {
      const result = await runDirectoryPipeline({
        db,
        sourceId: source.id,
        pipelineMode: source.pipelineMode as "auto_discover" | "auto_full",
        aiApiKey,
        aiProviderName: (settings?.eventExtractionProvider as ProviderName | undefined) ?? "claude",
      });
      results.push(result);
    } catch (err) {
      console.error("directory_pipeline_cron_error", {
        sourceId: source.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, requestId, processed: results.length, results });
}
