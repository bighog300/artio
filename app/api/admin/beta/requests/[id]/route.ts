import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireEditor, isAuthError } from "@/lib/auth";
import { handleAdminPatchRequestStatus } from "@/lib/beta/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireEditor();
    return await handleAdminPatchRequestStatus(req, context.params, actor);
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Editor role required");
    console.error("admin_beta_requests_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
