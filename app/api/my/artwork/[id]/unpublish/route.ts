import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { logAdminAction } from "@/lib/admin-audit";
import { handlePatchArtworkPublish } from "@/lib/my-artwork-publish-route";
import { requireMyArtworkAccess } from "@/lib/my-artwork-access";
import { idParamSchema, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  return handlePatchArtworkPublish(req, { artworkId: parsedId.data.id, isPublished: false }, {
    requireMyArtworkAccess,
    findArtworkById: (artworkId) => db.artwork.findUnique({ where: { id: artworkId }, select: { id: true, title: true, description: true, year: true, medium: true, featuredAssetId: true, isPublished: true } }),
    listArtworkImages: (artworkId) => db.artworkImage.findMany({ where: { artworkId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, assetId: true } }),
    updateArtworkPublishState: (artworkId, input) => db.artwork.update({ where: { id: artworkId }, data: { isPublished: input.isPublished, ...(input.status ? { status: input.status } : {}), ...(input.featuredAssetId ? { featuredAssetId: input.featuredAssetId } : {}) } }),
    createArtworkSubmission: async (artworkId, userId) =>
      db.submission.create({
        data: {
          type: "ARTWORK",
          status: "IN_REVIEW",
          submitterUserId: userId,
          note: `artworkId:${artworkId}`,
          submittedAt: new Date(),
        },
        select: { id: true },
      }),
    logAdminAction,
  });
}
