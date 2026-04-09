import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { handleListAccessRequests } from "@/lib/access-requests-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    return await handleListAccessRequests(req);
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    console.error("admin_access_requests_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
