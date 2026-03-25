import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { deleteBlobByUrl } from "@/lib/blob-delete";
import { logAdminAction } from "@/lib/admin-audit";
import { requireAuth, isAuthError } from "@/lib/auth";
import { artworkImageUpdateSchema, imageIdParamSchema, parseBody, zodDetails } from "@/lib/validators";
export const runtime = "nodejs";

async function canAccess(userId: string, role: "USER" | "EDITOR" | "ADMIN", imageId: string) {
  const image = await db.artworkImage.findUnique({ where: { id: imageId }, include: { artwork: { include: { artist: true } }, asset: true } });
  if (!image) return null;
  if (role === "ADMIN" || image.artwork.artist.userId === userId) return image;
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  const parsed = imageIdParamSchema.safeParse(await params);
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error));
  const parsedBody = artworkImageUpdateSchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

  try {
    const user = await requireAuth();
    const image = await canAccess(user.id, user.role, parsed.data.imageId);
    if (!image) return apiError(403, "forbidden", "Forbidden");
    const updated = await db.artworkImage.update({ where: { id: image.id }, data: { alt: parsedBody.data.alt ?? null } });
    await logAdminAction({ actorEmail: user.email, action: "ARTWORK_IMAGE_UPDATED", targetType: "artwork", targetId: image.artworkId, metadata: { imageId: image.id }, req });
    return NextResponse.json({ image: updated });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  const parsed = imageIdParamSchema.safeParse(await params);
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error));

  try {
    const user = await requireAuth();
    const image = await canAccess(user.id, user.role, parsed.data.imageId);
    if (!image) return apiError(403, "forbidden", "Forbidden");

    await db.artworkImage.delete({ where: { id: image.id } });

    const [venueFeatured, venueImage, eventImage, artistImage, artistFeatured, artworkFeatured, artworkImage] = await Promise.all([
      db.venue.count({ where: { featuredAssetId: image.assetId }, take: 1 }),
      db.venueImage.count({ where: { assetId: image.assetId }, take: 1 }),
      db.eventImage.count({ where: { assetId: image.assetId }, take: 1 }),
      db.artistImage.count({ where: { assetId: image.assetId }, take: 1 }),
      db.artist.count({ where: { featuredAssetId: image.assetId }, take: 1 }),
      db.artwork.count({ where: { featuredAssetId: image.assetId }, take: 1 }),
      db.artworkImage.count({ where: { assetId: image.assetId }, take: 1 }),
    ]);

    if (!venueFeatured && !venueImage && !eventImage && !artistImage && !artistFeatured && !artworkFeatured && !artworkImage) {
      await db.asset.delete({ where: { id: image.assetId } }).catch(() => undefined);
      await deleteBlobByUrl(image.asset.url).catch(() => undefined);
    }

    await logAdminAction({ actorEmail: user.email, action: "ARTWORK_IMAGE_DELETED", targetType: "artwork", targetId: image.artworkId, metadata: { imageId: image.id, assetId: image.assetId }, req });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
