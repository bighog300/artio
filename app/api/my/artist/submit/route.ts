import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleMyArtistSubmit } from "@/lib/my-artist-submit-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleMyArtistSubmit(req, {
    requireAuth,
    findOwnedArtistByUserId: async (userId) => db.artist.findUnique({
      where: { userId },
      select: {
        id: true,
        slug: true,
        name: true,
        bio: true,
        websiteUrl: true,
        featuredAssetId: true,
        featuredImageUrl: true,
        featuredAsset: { select: { url: true } },
        images: { select: { id: true }, take: 1 },
      },
    }).then((artist) => {
      if (!artist) return null;
      return {
        id: artist.id,
        slug: artist.slug,
        name: artist.name,
        bio: artist.bio,
        websiteUrl: artist.websiteUrl,
        featuredAssetId: artist.featuredAssetId,
        featuredImageUrl: artist.featuredAsset?.url ?? artist.featuredImageUrl,
        images: artist.images,
      };
    }),
    getLatestSubmissionStatus: async (artistId) => db.submission.findFirst({
      where: { targetArtistId: artistId, type: "ARTIST", kind: "PUBLISH" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { status: true },
    }).then((row) => row?.status ?? null),
    createSubmission: async ({ artistId, userId, message, snapshot }) => db.submission.create({
      data: {
        type: "ARTIST",
        kind: "PUBLISH",
        status: "IN_REVIEW",
        submitterUserId: userId,
        targetArtistId: artistId,
        note: message ?? null,
        details: { snapshot, message: message ?? null },
        submittedAt: new Date(),
        decisionReason: null,
        decidedAt: null,
        decidedByUserId: null,
      },
      select: { id: true, status: true, createdAt: true, submittedAt: true },
    }),
  });
}
