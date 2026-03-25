import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { withAdminRoute } from "@/lib/admin-route";
import { db } from "@/lib/db";
import { importApprovedArtworkImage } from "@/lib/ingest/import-approved-artwork-image";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { resolveApiImageField } from "@/lib/assets/image-contract";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminRoute(async () => {
    const parsed = idParamSchema.safeParse(await params);
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error));
    }

    const candidate = await db.ingestExtractedArtwork.findUnique({
      where: { id: parsed.data.id },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        imageUrl: true,
        createdArtworkId: true,
      },
    });

    if (!candidate) return apiError(404, "not_found", "Artwork candidate not found");
    if (!candidate.createdArtworkId) {
      return apiError(409, "not_approved", "Artwork candidate has not been approved yet");
    }

    const result = await importApprovedArtworkImage({
      appDb: db,
      candidateId: candidate.id,
      runId: candidate.id,
      artworkId: candidate.createdArtworkId,
      title: candidate.title,
      sourceUrl: candidate.sourceUrl,
      candidateImageUrl: candidate.imageUrl,
      requestId: `manual-import-artwork-${candidate.id}`,
    });

    return NextResponse.json({
      attached: result.attached,
      imageUrl: result.imageUrl,
      image: resolveApiImageField({ legacyUrl: result.imageUrl, requestedVariant: "card" }),
      warning: result.warning,
    });
  });
}
