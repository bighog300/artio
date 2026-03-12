import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureUniqueArtworkSlugWithDeps, slugifyArtworkTitle } from "@/lib/artwork-slug";

export const runtime = "nodejs";

type ApproveArtworkDeps = {
  requireAdmin: typeof requireAdmin;
  db: typeof db;
};

const defaultDeps: ApproveArtworkDeps = { requireAdmin, db };

export async function handleAdminIngestArtworkApprove(
  { params }: { params: Promise<{ id: string }> },
  deps: ApproveArtworkDeps = defaultDeps,
) {
  try {
    await deps.requireAdmin();
    const { id } = await params;

    const candidate = await deps.db.ingestExtractedArtwork.findUnique({
      where: { id },
      include: { sourceEvent: { select: { id: true, venueId: true } } },
    });

    if (!candidate) return apiError(404, "not_found", "Candidate not found");
    if (candidate.status !== "PENDING") return apiError(409, "invalid_state", "Already processed");

    let artistId: string | null = null;
    if (candidate.artistName) {
      const artist = await deps.db.artist.findFirst({
        where: { name: { equals: candidate.artistName, mode: "insensitive" } },
        select: { id: true },
      });
      artistId = artist?.id ?? null;
    }

    if (!artistId) {
      return apiError(409, "invalid_state", "Unable to resolve artist for artwork candidate");
    }

    const result = await deps.db.$transaction(async (tx) => {
      const baseSlug = slugifyArtworkTitle(candidate.title);
      const slug = await ensureUniqueArtworkSlugWithDeps(
        { findBySlug: (value) => tx.artwork.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );

      const newArtwork = await tx.artwork.create({
        data: {
          artistId,
          title: candidate.title,
          slug,
          medium: candidate.medium ?? undefined,
          year: candidate.year ?? undefined,
          dimensions: candidate.dimensions ?? undefined,
          description: candidate.description ?? undefined,
          isPublished: false,
          status: "IN_REVIEW",
        },
        select: { id: true },
      });

      await tx.artworkEvent.create({
        data: { artworkId: newArtwork.id, eventId: candidate.sourceEventId },
      });

      const eventVenueId = candidate.sourceEvent.venueId;
      if (eventVenueId) {
        await tx.artworkVenue.create({
          data: { artworkId: newArtwork.id, venueId: eventVenueId },
        });
      }

      await tx.ingestExtractedArtwork.update({
        where: { id: candidate.id },
        data: { status: "APPROVED", createdArtworkId: newArtwork.id },
      });

      return { artworkId: newArtwork.id };
    });

    return NextResponse.json({ artworkId: result.artworkId, artistId, eventId: candidate.sourceEventId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleAdminIngestArtworkApprove(context);
}
