import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { finalizeAssetCrop } from "@/lib/assets/save-asset";
import { getImageTransformRuntimeStatus } from "@/lib/assets/transform-runtime";
import { logImageTransformRuntimeStatusOnce } from "@/lib/assets/runtime-observability";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const cropSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  aspectRatio: z.number().positive().optional(),
  zoom: z.number().min(1).max(4).optional(),
  focalPointX: z.number().min(0).max(1).optional(),
  focalPointY: z.number().min(0).max(1).optional(),
  preset: z.enum(["square", "landscape", "portrait", "hero"]).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await logImageTransformRuntimeStatusOnce("api/assets/[id]/crop");
    await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const parsed = cropSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Invalid crop payload");
    }

    const updated = await finalizeAssetCrop({
      dbClient: db,
      assetId: id,
      crop: parsed.data,
    });
    const runtime = await getImageTransformRuntimeStatus();

    return NextResponse.json({
      ok: true,
      asset: {
        id: updated.id,
        url: updated.url,
        processingStatus: updated.processingStatus,
        processingError: updated.processingError,
        cropJson: updated.cropJson,
      },
      variants: updated.variants.map((variant) => ({
        variantName: variant.variantName,
        url: variant.url,
        width: variant.width,
        height: variant.height,
      })),
      processing: {
        runtime,
        fallbackUsed: !runtime.available,
        diagnostics: runtime.available ? [] : ["transform_runtime_unavailable_passthrough_used"],
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", error instanceof Error ? error.message : "Unexpected server error");
  }
}
