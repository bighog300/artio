import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
});

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string; candidateId: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter");

    const candidate = await db.ingestExtractedArtist.findUnique({
      where: { id: parsedParams.data.candidateId },
      select: {
        id: true,
        name: true,
        normalizedName: true,
        bio: true,
        mediums: true,
        websiteUrl: true,
        instagramUrl: true,
        twitterUrl: true,
        nationality: true,
        birthYear: true,
        sourceUrl: true,
        status: true,
        confidenceScore: true,
        confidenceBand: true,
        confidenceReasons: true,
        extractionProvider: true,
        createdAt: true,
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            model: true,
            usageTotalTokens: true,
            errorCode: true,
            errorMessage: true,
            attemptedAt: true,
            durationMs: true,
            searchResults: true,
          },
        },
      },
    });

    if (!candidate) return apiError(404, "not_found", "Candidate not found");

    return NextResponse.json({ candidate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
