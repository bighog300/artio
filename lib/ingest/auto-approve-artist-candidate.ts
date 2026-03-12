import type { PrismaClient } from "@prisma/client";
import { slugifyArtistName, ensureUniqueArtistSlugWithDeps } from "@/lib/artist-slug";
import { resolveArtistCandidate } from "@/lib/ingest/artist-resolution";

export async function autoApproveArtistCandidate(args: {
  candidateId: string;
  db: PrismaClient;
  autoPublish: boolean;
}): Promise<{ artistId: string; published: boolean } | null> {
  try {
    const candidate = await args.db.ingestExtractedArtist.findUnique({
      where: { id: args.candidateId },
      include: { eventLinks: true },
    });

    if (!candidate || candidate.status !== "PENDING") return null;

    const newArtist = await args.db.$transaction(async (tx) => {
      const resolvedArtist = await resolveArtistCandidate({
        db: tx as PrismaClient,
        name: candidate.name,
        websiteUrl: candidate.websiteUrl,
        instagramUrl: candidate.instagramUrl,
        twitterUrl: candidate.twitterUrl,
      });

      let artistId = resolvedArtist?.artistId;
      let createdNewArtist = false;

      if (!artistId) {
        const baseSlug = slugifyArtistName(candidate.name);
        const slug = await ensureUniqueArtistSlugWithDeps(
          { findBySlug: (value) => tx.artist.findUnique({ where: { slug: value }, select: { id: true } }) },
          baseSlug,
        );

        const createdArtist = await tx.artist.create({
          data: {
            name: candidate.name,
            slug: slug ?? candidate.id,
            bio: candidate.bio,
            mediums: candidate.mediums,
            websiteUrl: candidate.websiteUrl,
            instagramUrl: candidate.instagramUrl,
            twitterUrl: candidate.twitterUrl,
            isAiDiscovered: true,
            extractionProvider: candidate.extractionProvider,
            status: "IN_REVIEW",
          },
          select: { id: true },
        });

        artistId = createdArtist.id;
        createdNewArtist = true;
      }

      for (const link of candidate.eventLinks) {
        await tx.eventArtist.upsert({
          where: {
            eventId_artistId: {
              eventId: link.eventId,
              artistId,
            },
          },
          create: {
            eventId: link.eventId,
            artistId,
          },
          update: {},
        });
      }

      await tx.ingestExtractedArtist.update({
        where: { id: candidate.id },
        data: { status: "APPROVED", createdArtistId: artistId },
      });

      return { id: artistId, createdNewArtist };
    });

    const canPublish = Boolean(
      args.autoPublish
      && candidate.name.trim().length > 0
      && (candidate.bio?.trim().length ?? 0) > 0
      && candidate.mediums.length > 0,
    );

    if (canPublish && newArtist.createdNewArtist) {
      await args.db.artist.update({
        where: { id: newArtist.id },
        data: { status: "PUBLISHED", isPublished: true },
      });
      return { artistId: newArtist.id, published: true };
    }

    return { artistId: newArtist.id, published: false };
  } catch (error) {
    console.warn("auto_approve_artist_failed", { candidateId: args.candidateId, error });
    return null;
  }
}
