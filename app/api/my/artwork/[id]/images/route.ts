import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { requireMyArtworkAccess } from "@/lib/my-artwork-access";
import { artworkImageCreateSchema, idParamSchema, parseBody, zodDetails } from "@/lib/validators";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
  const parsedBody = artworkImageCreateSchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

  try {
    const { user } = await requireMyArtworkAccess(parsedId.data.id);
    const exists = await db.asset.findUnique({ where: { id: parsedBody.data.assetId }, select: { id: true } });
    if (!exists) return apiError(404, "not_found", "Asset not found");
    const maxSort = await db.artworkImage.aggregate({ where: { artworkId: parsedId.data.id }, _max: { sortOrder: true } });
    const image = await db.artworkImage.create({ data: { artworkId: parsedId.data.id, assetId: parsedBody.data.assetId, alt: parsedBody.data.alt ?? null, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 }, include: { asset: true } });
    await logAdminAction({ actorEmail: user.email, action: "ARTWORK_IMAGE_ADDED", targetType: "artwork", targetId: parsedId.data.id, metadata: { imageId: image.id, assetId: image.assetId }, req });
    return NextResponse.json({ image }, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && (error.message === "forbidden" || error.message === "not_found")) return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
