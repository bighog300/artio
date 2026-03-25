import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { requireMyArtworkAccess } from "@/lib/my-artwork-access";
import { artworkCoverPatchSchema, idParamSchema, parseBody, zodDetails } from "@/lib/validators";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
  const parsedBody = artworkCoverPatchSchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

  try {
    const { user } = await requireMyArtworkAccess(parsedId.data.id);
    let featuredAssetId: string | null = null;
    if (parsedBody.data.imageId) {
      const image = await db.artworkImage.findFirst({ where: { id: parsedBody.data.imageId, artworkId: parsedId.data.id }, select: { assetId: true } });
      if (!image) return apiError(404, "not_found", "Image not found");
      featuredAssetId = image.assetId;
    }
    const artwork = await db.artwork.update({ where: { id: parsedId.data.id }, data: { featuredAssetId } });
    await logAdminAction({ actorEmail: user.email, action: "ARTWORK_COVER_UPDATED", targetType: "artwork", targetId: parsedId.data.id, metadata: { featuredAssetId }, req });
    return NextResponse.json({ artwork });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && (error.message === "forbidden" || error.message === "not_found")) return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
