import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { buildArtistQueueWhere, getQueueOrderBy, parseQueueQueryParams } from "@/lib/admin-ingest-queue-query";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  noStore();

  try {
    await requireAdmin();

    const query = parseQueueQueryParams(req.nextUrl.searchParams);
    const pageNumber = query.page;
    const pageSize = 50;
    const where = buildArtistQueueWhere(query);

    const [candidates, total] = await Promise.all([
      db.ingestExtractedArtist.findMany({
        where,
        select: {
          id: true,
          name: true,
          bio: true,
          mediums: true,
          websiteUrl: true,
          instagramUrl: true,
          nationality: true,
          birthYear: true,
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
          eventLinks: {
            select: {
              eventId: true,
              event: { select: { title: true, slug: true } },
            },
          },
        },
        orderBy: getQueueOrderBy(query.sort),
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
      }),
      db.ingestExtractedArtist.count({ where }),
    ]);

    return NextResponse.json({ candidates, total, page: pageNumber, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
