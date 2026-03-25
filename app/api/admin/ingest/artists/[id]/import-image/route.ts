import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { importApprovedArtistImage } from "@/lib/ingest/import-approved-artist-image";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { resolveApiImageField } from "@/lib/assets/image-contract";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const parsed = idParamSchema.safeParse(await params);
    if (!parsed.success) {
      return apiError(
        400,
        "invalid_request",
        "Invalid route parameter",
        zodDetails(parsed.error),
      );
    }

    const candidate = await db.ingestExtractedArtist.findUnique({
      where: { id: parsed.data.id },
      select: {
        id: true,
        name: true,
        websiteUrl: true,
        sourceUrl: true,
        instagramUrl: true,
        createdArtistId: true,
      },
    });

    if (!candidate) {
      return apiError(404, "not_found", "Artist candidate not found");
    }
    if (!candidate.createdArtistId) {
      return apiError(
        409,
        "not_approved",
        "Artist candidate has not been approved yet",
      );
    }

    const result = await importApprovedArtistImage({
      appDb: db,
      artistId: candidate.createdArtistId,
      name: candidate.name,
      websiteUrl: candidate.websiteUrl,
      sourceUrl: candidate.sourceUrl,
      instagramUrl: candidate.instagramUrl,
      requestId: `manual-import-artist-${candidate.id}`,
    });

    return NextResponse.json({
      attached: result.attached,
      image: resolveApiImageField({ legacyUrl: result.imageUrl, requestedVariant: "card" }),
      warning: result.warning,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Forbidden");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
