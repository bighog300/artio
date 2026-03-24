import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { validateImageUpload } from "@/lib/assets/validate-upload";
import { saveImageAssetPipeline } from "@/lib/assets/save-asset";
import { getImageSuggestions } from "@/lib/assets/image-suggestions";
import { logAssetValidationFailure } from "@/lib/assets/diagnostics";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const form = await req.formData();
    const file = form.get("file");
    const alt = form.get("alt");

    if (!(file instanceof File)) {
      return apiError(400, "invalid_request", "file is required");
    }

    const validation = await validateImageUpload(file);
    if (!validation.isValid || !validation.metadata) {
      logAssetValidationFailure({ ownerUserId: user.id, errors: validation.errors, warnings: validation.warnings });
      return NextResponse.json({
        ok: false,
        errors: validation.errors,
        warnings: validation.warnings,
        metadata: validation.metadata,
      }, { status: 400 });
    }

    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    const saved = await saveImageAssetPipeline({
      dbClient: db,
      ownerUserId: user.id,
      fileName: file.name,
      sourceMimeType: file.type,
      sourceBytes,
      altText: typeof alt === "string" ? alt : null,
    });

    const suggestions = getImageSuggestions({
      metadata: validation.metadata,
      estimatedOptimizedByteSize: saved.processed.metadata.byteSize,
    });

    return NextResponse.json({
      ok: true,
      asset: {
        id: saved.asset.id,
        url: saved.asset.url,
        processingStatus: saved.asset.processingStatus,
        originalUrl: saved.asset.originalUrl,
        width: saved.asset.width,
        height: saved.asset.height,
      },
      variants: saved.variants.map((item) => ({
        variantName: item.variantName,
        url: item.url,
        width: item.width,
        height: item.height,
      })),
      validation,
      suggestions,
    }, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", error instanceof Error ? error.message : "Unexpected server error");
  }
}
