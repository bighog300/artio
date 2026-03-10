import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureUniqueArtistSlugWithDeps, slugifyArtistName } from "@/lib/artist-slug";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const candidate = await db.ingestExtractedArtist.findUnique({
      where: { id },
      include: { eventLinks: true },
    });

    if (!candidate) return apiError(404, "not_found", "Candidate not found");
    if (candidate.status !== "PENDING") return apiError(409, "invalid_state", "Already processed");

    const result = await db.$transaction(async (tx) => {
      const baseSlug = slugifyArtistName(candidate.name);
      const slug = await ensureUniqueArtistSlugWithDeps(
        { findBySlug: (value) => tx.artist.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );

      const newArtist = await tx.artist.create({
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

      await tx.submission.create({
        data: {
          type: "ARTIST",
          kind: "PUBLISH",
          status: "IN_REVIEW",
          submitterUserId: admin.id,
          targetArtistId: newArtist.id,
          note: "AI artist ingest candidate submitted for admin moderation",
          details: {
            source: "artist_ingest",
            candidateId: candidate.id,
            sourceUrl: candidate.sourceUrl,
          },
          submittedAt: new Date(),
        },
      });

      for (const link of candidate.eventLinks) {
        await tx.eventArtist.upsert({
          where: {
            eventId_artistId: {
              eventId: link.eventId,
              artistId: newArtist.id,
            },
          },
          create: {
            eventId: link.eventId,
            artistId: newArtist.id,
          },
          update: {},
        });
      }

      await tx.ingestExtractedArtist.update({
        where: { id: candidate.id },
        data: { status: "APPROVED", createdArtistId: newArtist.id },
      });

      return { artistId: newArtist.id, linkedEventCount: candidate.eventLinks.length };
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
