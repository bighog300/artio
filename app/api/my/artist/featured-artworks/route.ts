import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { isAuthError, requireAuth } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { handleGetMyArtistFeaturedArtworks, handlePutMyArtistFeaturedArtworks } from "@/lib/my-artist-featured-artworks-route";
import { parseBody } from "@/lib/validators";

export const runtime = "nodejs";

const selectFeatured = {
  sortOrder: true,
  artwork: {
    select: {
      id: true,
      slug: true,
      title: true,
      featuredAsset: { select: { url: true } },
      images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], take: 1, select: { asset: { select: { url: true } } } },
    },
  },
};

const deps = {
  requireAuth,
  findOwnedArtistByUserId: (userId: string) => db.artist.findUnique({ where: { userId }, select: { id: true } }),
  listFeatured: (artistId: string) => db.artistFeaturedArtwork.findMany({ where: { artistId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: selectFeatured }),
  findPublishedOwnedArtworkIds: async (artistId: string, artworkIds: string[]) => {
    if (!artworkIds.length) return [];
    const rows = await db.artwork.findMany({ where: { artistId, isPublished: true, id: { in: artworkIds } }, select: { id: true } });
    return rows.map((row) => row.id);
  },
  replaceFeatured: async (artistId: string, artworkIds: string[]) => {
    await db.$transaction(async (tx) => {
      await tx.artistFeaturedArtwork.deleteMany({ where: { artistId } });
      if (!artworkIds.length) return;
      await tx.artistFeaturedArtwork.createMany({ data: artworkIds.map((artworkId, index) => ({ artistId, artworkId, sortOrder: index })) });
    });
  },
  logAdminAction,
};

export async function GET(req: NextRequest) {
  return handleGetMyArtistFeaturedArtworks(req, deps);
}

export async function PUT(req: NextRequest) {
  return handlePutMyArtistFeaturedArtworks(req, deps);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!artist) return apiError(403, "forbidden", "Artist profile required");

    const body = await parseBody(req);
    const artworkId = typeof body?.artworkId === "string" ? body.artworkId : null;
    if (!artworkId) return apiError(400, "invalid_request", "artworkId is required");

    // Verify artwork is owned by this artist and not deleted
    const artwork = await db.artwork.findFirst({
      where: { id: artworkId, artistId: artist.id, deletedAt: null },
      select: { id: true },
    });
    if (!artwork) return apiError(404, "not_found", "Artwork not found or not owned by your artist profile");

    // Upsert — ignore if already featured
    await db.artistFeaturedArtwork.upsert({
      where: { artistId_artworkId: { artistId: artist.id, artworkId } },
      update: {},
      create: {
        artistId: artist.id,
        artworkId,
        sortOrder: await db.artistFeaturedArtwork.count({ where: { artistId: artist.id } }),
      },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!artist) return apiError(403, "forbidden", "Artist profile required");

    const body = await parseBody(req);
    const artworkId = typeof body?.artworkId === "string" ? body.artworkId : null;
    if (!artworkId) return apiError(400, "invalid_request", "artworkId is required");

    await db.artistFeaturedArtwork.deleteMany({
      where: { artistId: artist.id, artworkId },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
