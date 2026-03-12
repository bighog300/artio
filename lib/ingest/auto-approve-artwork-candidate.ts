import type { PrismaClient } from "@prisma/client";
import { ensureUniqueArtworkSlugWithDeps, slugifyArtworkTitle } from "@/lib/artwork-slug";

export async function autoApproveArtworkCandidate(args: {
  candidateId: string;
  db: PrismaClient;
  autoPublish: boolean;
}): Promise<{ artworkId: string; published: boolean } | null> {
  try {
    const candidate = await args.db.ingestExtractedArtwork.findUnique({
      where: { id: args.candidateId },
      include: { sourceEvent: { select: { id: true, venueId: true } } },
    });

    if (!candidate || candidate.status !== "PENDING") return null;

    let artistId: string | null = null;
    if (candidate.artistName) {
      const artist = await args.db.artist.findFirst({
        where: {
          name: { equals: candidate.artistName, mode: "insensitive" },
          status: { in: ["PUBLISHED", "IN_REVIEW"] },
        },
        select: { id: true },
      });
      artistId = artist?.id ?? null;
    }

    if (!artistId) return null;
    if (!candidate.sourceEvent) return null;

    const newArtwork = await args.db.$transaction(async (tx) => {
      const baseSlug = slugifyArtworkTitle(candidate.title);
      const slug = await ensureUniqueArtworkSlugWithDeps(
        { findBySlug: (value) => tx.artwork.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );

      const createdArtwork = await tx.artwork.create({
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
        data: { artworkId: createdArtwork.id, eventId: candidate.sourceEventId },
      });

      const eventVenueId = candidate.sourceEvent.venueId;
      if (eventVenueId) {
        await tx.artworkVenue.create({
          data: { artworkId: createdArtwork.id, venueId: eventVenueId },
        });
      }

      await tx.ingestExtractedArtwork.update({
        where: { id: candidate.id },
        data: { status: "APPROVED", createdArtworkId: createdArtwork.id },
      });

      return createdArtwork;
    });

    const canPublish = Boolean(args.autoPublish && candidate.title.trim().length > 0 && artistId !== null);
    if (canPublish) {
      await args.db.artwork.update({
        where: { id: newArtwork.id },
        data: { isPublished: true, status: "PUBLISHED" },
      });
      return { artworkId: newArtwork.id, published: true };
    }

    return { artworkId: newArtwork.id, published: false };
  } catch (error) {
    console.warn("auto_approve_artwork_failed", {
      candidateId: args.candidateId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorCode: (error as Record<string, unknown>)?.code ?? null,
      stack: error instanceof Error ? error.stack?.slice(0, 500) : null,
    });
    return null;
  }
}
