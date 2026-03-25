import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth, isAuthError } from "@/lib/auth";
import { uploadImageAsset } from "@/lib/assets/server";
import { db } from "@/lib/db";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Transitional compatibility upload route.
// New upload flows should use `/api/assets/upload/process` (or feature-specific wrappers) backed by the asset pipeline.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    await enforceRateLimit({
      key: principalRateLimitKey(req, "uploads:image", user.id),
      limit: RATE_LIMITS.uploads.limit,
      windowMs: RATE_LIMITS.uploads.windowMs,
    });

    const form = await req.formData();
    const fileEntry = form.get("file");
    const altEntry = form.get("alt");

    if (!(fileEntry instanceof File)) return apiError(400, "invalid_request", "file is required");

    const uploaded = await uploadImageAsset({
      file: fileEntry,
      ownerUserId: user.id,
      alt: typeof altEntry === "string" ? altEntry : null,
      dbClient: db,
    });

    return NextResponse.json(uploaded, { status: 201 });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "invalid_mime") {
      return apiError(400, "invalid_request", "Only jpeg/png/webp images are allowed");
    }
    if (error instanceof Error && error.message === "file_too_large") {
      return apiError(400, "invalid_request", "Image size must be 10MB or less");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
