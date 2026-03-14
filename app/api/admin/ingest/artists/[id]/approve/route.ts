import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureUniqueArtistSlugWithDeps, slugifyArtistName } from "@/lib/artist-slug";
import { requireAdmin } from "@/lib/admin";
import { parseBody, zodDetails } from "@/lib/validators";
import { z } from "zod";
import { importApprovedArtistImage } from "@/lib/ingest/import-approved-artist-image";

export const runtime = "nodejs";

const artistApprovePatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  bio: z.string().trim().max(5000).nullable().optional(),
  mediums: z.array(z.string().trim().min(1)).max(20).optional(),
  websiteUrl: z.string().trim().url().nullable().optional(),
  instagramUrl: z.string().trim().nullable().optional(),
  twitterUrl: z.string().trim().nullable().optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const parsedPatch = artistApprovePatchSchema.safeParse(await parseBody(req));
    if (!parsedPatch.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedPatch.error));
    const patch = parsedPatch.data;

    const candidate = await db.ingestExtractedArtist.findUnique({
      where: { id },
      include: { eventLinks: true },
    });

    if (!candidate) return apiError(404, "not_found", "Candidate not found");
    if (candidate.status !== "PENDING") return apiError(409, "invalid_state", "Already processed");

    const name = patch.name ?? candidate.name;
    const bio = "bio" in patch ? patch.bio : candidate.bio;
    const mediums = patch.mediums ?? candidate.mediums;
    const websiteUrl = "websiteUrl" in patch ? patch.websiteUrl : candidate.websiteUrl;
    const instagramUrl = "instagramUrl" in patch ? patch.instagramUrl : candidate.instagramUrl;
    const twitterUrl = "twitterUrl" in patch ? patch.twitterUrl : candidate.twitterUrl;

    const result = await db.$transaction(async (tx) => {
      const baseSlug = slugifyArtistName(name);
      const slug = await ensureUniqueArtistSlugWithDeps(
        { findBySlug: (value) => tx.artist.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );

      const newArtist = await tx.artist.create({
        data: {
          name,
          slug: slug ?? candidate.id,
          bio,
          mediums,
          websiteUrl,
          instagramUrl,
          twitterUrl,
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

      return {
        artistId: newArtist.id,
        linkedEventCount: candidate.eventLinks.length,
        name,
        websiteUrl,
        instagramUrl,
        sourceUrl: candidate.sourceUrl,
        candidateId: candidate.id,
      };
    });

    await importApprovedArtistImage({
      appDb: db,
      artistId: result.artistId,
      candidateId: result.candidateId,
      name: result.name,
      websiteUrl: result.websiteUrl,
      instagramUrl: result.instagramUrl,
      sourceUrl: result.sourceUrl,
      requestId: `manual-approve-artist-${result.candidateId}`,
    }).catch((err) => console.warn("manual_approve_artist_image_import_failed", { candidateId: result.candidateId, err }));

    return NextResponse.json({ artistId: result.artistId, linkedEventCount: result.linkedEventCount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
