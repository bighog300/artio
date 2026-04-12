import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyseSite } from "@/lib/ingest/directory/site-profiler";
import type { ProviderName } from "@/lib/ingest/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ url: z.string().min(3).max(500) });

export async function POST(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid URL");

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { anthropicApiKey: true, openAiApiKey: true, eventExtractionProvider: true },
    });

    const aiApiKey = settings?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY
      ?? settings?.openAiApiKey ?? process.env.OPENAI_API_KEY ?? null;

    if (!aiApiKey) return apiError(500, "no_ai_key", "No AI API key configured");

    const result = await analyseSite({
      url: parsed.data.url,
      aiApiKey,
      aiProviderName: (settings?.eventExtractionProvider as ProviderName | undefined) ?? "claude",
    });

    const profile = await db.siteProfile.upsert({
      where: { hostname: result.hostname },
      create: {
        hostname: result.hostname,
        platform: result.platform,
        directoryUrl: result.directoryUrl,
        indexPattern: result.indexPattern,
        linkPattern: result.linkPattern,
        paginationType: result.paginationType,
        exhibitionPattern: result.exhibitionPattern,
        sampleProfileUrls: result.sampleProfileUrls,
        estimatedArtistCount: result.estimatedArtistCount,
        confidence: result.confidence,
        reasoning: result.reasoning,
        analysisError: result.analysisError,
        detectedSections: result.detectedSections.length > 0
          ? result.detectedSections
          : undefined,
        lastProfiledAt: new Date(),
      },
      update: {
        platform: result.platform,
        directoryUrl: result.directoryUrl,
        indexPattern: result.indexPattern,
        linkPattern: result.linkPattern,
        paginationType: result.paginationType,
        exhibitionPattern: result.exhibitionPattern,
        sampleProfileUrls: result.sampleProfileUrls,
        estimatedArtistCount: result.estimatedArtistCount,
        confidence: result.confidence,
        reasoning: result.reasoning,
        analysisError: result.analysisError,
        detectedSections: result.detectedSections.length > 0
          ? result.detectedSections
          : undefined,
        lastProfiledAt: new Date(),
      },
      select: { id: true },
    });


    if (result.detectedSections.length > 0) {
      for (const section of result.detectedSections) {
        if (!section.url || section.confidence < 40) continue;

        await db.ingestionPath.upsert({
          where: { siteProfileId_baseUrl: { siteProfileId: profile.id, baseUrl: section.url } },
          create: {
            siteProfileId: profile.id,
            name: section.name,
            baseUrl: section.url,
            contentType: section.contentType,
            indexPattern: section.indexPattern,
            linkPattern: section.linkPattern,
            paginationType: section.paginationType,
            enabled: section.contentType !== "unknown",
            crawlIntervalMinutes: section.contentType === "event" ? 1440 : 10080,
          },
          update: {
            name: section.name,
            contentType: section.contentType,
            indexPattern: section.indexPattern,
            linkPattern: section.linkPattern,
            paginationType: section.paginationType,
          },
        }).catch(() => {});
      }
    }

    return NextResponse.json({ ...result, siteProfileId: profile.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_directory_analyse_error", { message: error instanceof Error ? error.message : String(error) });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
