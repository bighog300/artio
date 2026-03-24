import { NextResponse } from "next/server";
import { getImageTransformRuntimeStatus } from "@/lib/assets/transform-runtime";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const status = await getImageTransformRuntimeStatus();
    return NextResponse.json({ runtime: status, fallbackMode: !status.available });
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
