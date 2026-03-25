import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { toApiImageField } from "@/lib/assets/image-contract";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const asset = await db.asset.findFirst({
      where: { id, ownerUserId: user.id },
      select: {
        id: true,
        url: true,
        originalUrl: true,
        processingStatus: true,
        processingError: true,
        variants: { select: { variantName: true, url: true } },
      },
    });

    if (!asset) {
      return apiError(404, "not_found", "Asset not found");
    }

    const image = resolveAssetDisplay({ asset, requestedVariant: "thumb" });
    return NextResponse.json({
      asset,
      image: toApiImageField(image),
      // Transitional compatibility field; prefer `image` and remove after full asset pipeline rollout.
      thumbUrl: image.url,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
