import type { PrismaClient } from "@prisma/client";
import { slugifyArtistName, ensureUniqueArtistSlugWithDeps } from "@/lib/artist-slug";
import { resolveArtistCandidate } from "@/lib/ingest/artist-resolution";
import { importApprovedArtistImage } from "@/lib/ingest/import-approved-artist-image";
import { logWarn } from "@/lib/logging";
import { markArtistApprovalAttempt, markArtistApprovalFailure, normalizeApprovalError } from "@/lib/ingest/candidate-observability";

export const autoApproveArtistCandidateDeps = {
  importApprovedArtistImage,
};

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

    await markArtistApprovalAttempt(args.db, candidate.id);

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
        data: { status: "APPROVED", createdArtistId: artistId, lastApprovalError: null },
      });

      return { id: artistId, createdNewArtist };
    });


    await autoApproveArtistCandidateDeps.importApprovedArtistImage({
      appDb: args.db,
      artistId: newArtist.id,
      name: candidate.name,
      websiteUrl: candidate.websiteUrl,
      sourceUrl: candidate.sourceUrl,
      instagramUrl: candidate.instagramUrl,
      requestId: `auto-approve-artist-${candidate.id}`,
      candidateId: candidate.id,
    }).catch((err) => logWarn({ message: "auto_approve_artist_image_failed", candidateId: candidate.id, err, approvalErrorCode: "image_import_failed" }));

    // Retroactive artwork re-link
    try {
      const eventIds = candidate.eventLinks.map((link) => link.eventId);
      if (eventIds.length > 0) {
        const affectedArtworks = await args.db.artwork.findMany({
          where: {
            events: { some: { eventId: { in: eventIds } } },
            artist: {
              name: { equals: candidate.name, mode: "insensitive" },
              status: "IN_REVIEW",
              isAiDiscovered: true,
            },
            artistId: { not: newArtist.id },
          },
          select: { id: true, artistId: true },
        });

        for (const artwork of affectedArtworks) {
          await args.db.artwork.update({
            where: { id: artwork.id },
            data: { artistId: newArtist.id },
          });
        }

        if (affectedArtworks.length > 0) {
          console.info("artist_retroactive_artwork_relink", {
            candidateId: args.candidateId,
            newArtistId: newArtist.id,
            relinkedCount: affectedArtworks.length,
          });
        }
      }
    } catch (err) {
      await markArtistApprovalFailure(args.db, args.candidateId, "relink_failed");
      logWarn({ message: "artist_retroactive_artwork_relink_failed",
        candidateId: args.candidateId,
        err,
        approvalErrorCode: "relink_failed",
      });
    }

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
    const approvalErrorCode = normalizeApprovalError(error, "db_transaction_failed");
    await markArtistApprovalFailure(args.db, args.candidateId, approvalErrorCode);
    logWarn({ message: "auto_approve_artist_failed", candidateId: args.candidateId, error, approvalErrorCode });
    return null;
  }
}
