import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  noStore();

  try {
    await requireAdmin();

    const page = Number.parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
    const status = req.nextUrl.searchParams.get("status") ?? "PENDING";
    const band = req.nextUrl.searchParams.get("band");
    const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
    const pageSize = 50;

    const where = {
      status: status as "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE",
      ...(band ? { confidenceBand: band } : {}),
    };

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
          createdAt: true,
          sourceEvent: { select: { id: true, title: true, slug: true } },
        },
        orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
      }),
      db.ingestExtractedArtwork.count({ where }),
    ]);

    return NextResponse.json({ candidates, total, page: pageNumber, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
