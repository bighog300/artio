import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { classifyPage } from "@/lib/ingest/directory/classify-page";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import type { ProviderName } from "@/lib/ingest/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({ url: z.string().url() });

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

    const aiApiKey = settings?.anthropicApiKey
      ?? process.env.ANTHROPIC_API_KEY
      ?? settings?.openAiApiKey
      ?? null;

    const fetched = await fetchHtmlWithGuards(parsed.data.url);
    const result = await classifyPage({
      url: fetched.finalUrl,
      html: fetched.html,
      aiApiKey,
      aiProviderName: (settings?.eventExtractionProvider as ProviderName | undefined) ?? "claude",
    });

    return NextResponse.json(
      { url: fetched.finalUrl, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
