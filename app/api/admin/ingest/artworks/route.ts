import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { buildArtworkQueueWhere, getQueueOrderBy, parseQueueQueryParams } from "@/lib/admin-ingest-queue-query";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { resolveApiImageField } from "@/lib/assets/image-contract";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  noStore();

  try {
    await requireAdmin();

    const query = parseQueueQueryParams(req.nextUrl.searchParams);
    const pageNumber = query.page;
    const pageSize = 50;
    const where = buildArtworkQueueWhere(query);

    const [candidates, total] = await Promise.all([
      db.ingestExtractedArtwork.findMany({
        where,
        select: {
          id: true,
          title: true,
          medium: true,
          year: true,
          dimensions: true,
          description: true,
          imageUrl: true,
          artistName: true,
          sourceUrl: true,
          status: true,
          confidenceScore: true,
          confidenceBand: true,
          confidenceReasons: true,
          extractionProvider: true,
          lastApprovalAttemptAt: true,
          lastApprovalError: true,
          imageImportStatus: true,
          imageImportWarning: true,
          createdAt: true,
          sourceEvent: { select: { id: true, title: true, slug: true } },
        },
        orderBy: getQueueOrderBy(query.sort),
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
      }),
      db.ingestExtractedArtwork.count({ where }),
    ]);

    return NextResponse.json({
      candidates: candidates.map((candidate) => ({
        ...candidate,
        image: resolveApiImageField({
          legacyUrl: candidate.imageUrl,
          requestedVariant: "card",
        }),
      })),
      total,
      page: pageNumber,
      pageSize,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_artworks_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
