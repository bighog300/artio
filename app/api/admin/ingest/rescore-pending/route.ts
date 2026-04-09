import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeConfidence } from "@/lib/ingest/confidence";

export const runtime = "nodejs";

export async function POST() {
  noStore();

  try {
    await requireAdmin();

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { ingestConfidenceHighMin: true, ingestConfidenceMediumMin: true },
    });

    const thresholds = {
      highMin: settings?.ingestConfidenceHighMin ?? null,
      mediumMin: settings?.ingestConfidenceMediumMin ?? null,
    };

    let rescored = 0;
    let cursor: string | undefined;

    while (true) {
      const batch = await db.ingestExtractedEvent.findMany({
        where: { status: "PENDING", duplicateOfId: null },
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          timezone: true,
          locationText: true,
          description: true,
          sourceUrl: true,
          artistNames: true,
          imageUrl: true,
          blobImageUrl: true,
          venue: { select: { name: true } },
        },
        orderBy: { id: "asc" },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (batch.length === 0) break;

      for (const candidate of batch) {
        const { score, band, reasons } = computeConfidence(
          {
            title: candidate.title,
            startAt: candidate.startAt,
            endAt: candidate.endAt,
            timezone: candidate.timezone,
            locationText: candidate.locationText,
            description: candidate.description,
            sourceUrl: candidate.sourceUrl,
            artistNames: candidate.artistNames,
            imageUrl: candidate.imageUrl ?? candidate.blobImageUrl,
          },
          {
            venueName: candidate.venue?.name ?? null,
            ...thresholds,
          },
        );

        await db.ingestExtractedEvent.update({
          where: { id: candidate.id },
          data: {
            confidenceScore: score,
            confidenceBand: band,
            confidenceReasons: reasons,
          },
        });

        rescored += 1;
      }

      cursor = batch.at(-1)?.id;
      if (batch.length < 100) break;
    }

    return NextResponse.json({ ok: true, rescored });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_rescore_pending_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
