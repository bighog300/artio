import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAuth, isAuthError } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { ensureUniqueArtworkSlugWithDeps, slugifyArtworkTitle } from "@/lib/artwork-slug";
import { myArtworkCreateSchema, parseBody, zodDetails } from "@/lib/validators";
import { computeArtworkCompleteness } from "@/lib/artwork-completeness";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist && user.role !== "ADMIN") return apiError(403, "forbidden", "Artist profile required");

    const items = await db.artwork.findMany({
      where: user.role === "ADMIN" ? {} : { artistId: artist!.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        isPublished: true,
        deletedAt: true,
        priceAmount: true,
        currency: true,
        updatedAt: true,
        description: true,
        year: true,
        medium: true,
        featuredAssetId: true,
        featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
        images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1, select: { asset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } } } },
        _count: { select: { images: true } },
      },
    });
    return NextResponse.json({
      artworks: items.map((item) => {
        const completeness = computeArtworkCompleteness(item, item._count.images);
        const image = toApiImageField(resolveAssetDisplay({
          asset: item.featuredAsset ?? item.images[0]?.asset,
          requestedVariant: "card",
        }));
        return {
          id: item.id,
          title: item.title,
          slug: item.slug,
          status: item.status,
          isPublished: item.isPublished,
          deletedAt: item.deletedAt?.toISOString() ?? null,
          priceAmount: item.priceAmount,
          currency: item.currency,
          image,
          featuredAsset: item.featuredAsset,
          images: item.images,
          updatedAt: item.updatedAt,
          completeness: { scorePct: completeness.scorePct, requiredOk: completeness.required.ok },
        };
      }),
    });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return apiError(403, "forbidden", "Artist profile required");

    const parsedBody = myArtworkCreateSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const baseSlug = parsedBody.data.slug ?? slugifyArtworkTitle(parsedBody.data.title);
    const slug = await ensureUniqueArtworkSlugWithDeps(
      { findBySlug: (candidate) => db.artwork.findUnique({ where: { slug: candidate }, select: { id: true } }) },
      baseSlug,
    );

    const artwork = await db.artwork.create({ data: { ...parsedBody.data, slug, artistId: artist.id, isPublished: false } });
    await logAdminAction({ actorEmail: user.email, action: "ARTWORK_CREATED", targetType: "artwork", targetId: artwork.id, metadata: { artworkId: artwork.id, artistId: artist.id }, req });
    return NextResponse.json({ artwork }, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(409, "conflict", "Artwork slug already exists");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
