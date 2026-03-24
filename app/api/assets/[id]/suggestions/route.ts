import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { getImageSuggestions } from "@/lib/assets/image-suggestions";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await params;
    const asset = await db.asset.findUnique({
      where: { id },
      select: {
        mimeType: true,
        byteSize: true,
        width: true,
        height: true,
      },
    });

    if (!asset?.mimeType || !asset?.byteSize || !asset?.width || !asset?.height) {
      return apiError(404, "not_found", "Asset metadata not available");
    }

    const format = asset.mimeType.includes("jpeg")
      ? "jpeg"
      : asset.mimeType.includes("png")
        ? "png"
        : asset.mimeType.includes("webp")
          ? "webp"
          : "unknown";

    const suggestions = getImageSuggestions({
      metadata: {
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        width: asset.width,
        height: asset.height,
        format,
        hasAlpha: format === "png",
      },
    });

    return NextResponse.json({ ok: true, suggestions });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", error instanceof Error ? error.message : "Unexpected server error");
  }
}
