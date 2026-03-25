import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { requireMyArtworkAccess } from "@/lib/my-artwork-access";
import { artworkImageReorderSchema, idParamSchema, parseBody, zodDetails } from "@/lib/validators";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
  const parsedBody = artworkImageReorderSchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

  try {
    const { user } = await requireMyArtworkAccess(parsedId.data.id);
    const ids = await db.artworkImage.findMany({ where: { artworkId: parsedId.data.id, id: { in: parsedBody.data.imageIds } }, select: { id: true } });
    if (ids.length !== parsedBody.data.imageIds.length) return apiError(400, "invalid_request", "Invalid image set");
    await db.$transaction(parsedBody.data.imageIds.map((id, index) => db.artworkImage.update({ where: { id }, data: { sortOrder: index } })));
    await logAdminAction({ actorEmail: user.email, action: "ARTWORK_IMAGES_REORDERED", targetType: "artwork", targetId: parsedId.data.id, metadata: { count: parsedBody.data.imageIds.length }, req });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && (error.message === "forbidden" || error.message === "not_found")) return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
