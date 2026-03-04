import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { handlePatchMyArtist } from "@/lib/my-artist-route";
import { handlePostMyArtist } from "@/lib/my-artist-create-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handlePostMyArtist(req, {
    requireAuth,
    findOwnedArtistByUserId: async (userId) => db.artist.findUnique({ where: { userId }, select: { id: true, slug: true } }),
    findArtistBySlug: async (slug) => db.artist.findUnique({ where: { slug }, select: { id: true } }),
    createArtist: async (data) => db.artist.create({
      data: {
        userId: data.userId,
        name: data.name,
        slug: data.slug,
        websiteUrl: data.websiteUrl ?? null,
        isPublished: false,
      },
      select: { id: true, slug: true },
    }),
    upsertArtistSubmission: async (artistId, userId) => {
      const latest = await db.submission.findFirst({
        where: { targetArtistId: artistId, type: "ARTIST", kind: "PUBLISH" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, status: true },
      });

      if (latest?.status === "DRAFT") {
        await db.submission.update({ where: { id: latest.id }, data: { submitterUserId: userId } });
        return;
      }
      if (latest?.status === "IN_REVIEW") return;

      await db.submission.create({
        data: {
          type: "ARTIST",
          kind: "PUBLISH",
          status: "DRAFT",
          submitterUserId: userId,
          targetArtistId: artistId,
        },
      });
    },
    setOnboardingFlag: async () => {
      // No artist-specific onboarding flag exists in lib/onboarding.ts.
    },
  });
}

export async function PATCH(req: NextRequest) {
  return handlePatchMyArtist(req, {
    requireAuth,
    findOwnedArtistByUserId: async (userId) => db.artist.findUnique({
      where: { userId },
      select: { id: true, name: true, bio: true, websiteUrl: true, instagramUrl: true, avatarImageUrl: true, featuredAssetId: true },
    }),
    updateArtistById: async (artistId, patch) => db.artist.update({
      where: { id: artistId },
      data: patch,
      select: { id: true, name: true, bio: true, websiteUrl: true, instagramUrl: true, avatarImageUrl: true, featuredAssetId: true },
    }),
  });
}
