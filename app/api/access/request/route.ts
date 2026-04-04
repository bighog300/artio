import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError, requireUser } from "@/lib/auth";
import { handleCreateAccessRequest, handleGetMyAccessRequest } from "@/lib/access-requests-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    return await handleCreateAccessRequest(req, user);
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    // "NONE" is a synthetic status — it is not stored in the database.
    // It is returned here so the client always receives the same response
    // shape regardless of whether a request exists. Do not add "NONE" to
    // the AccessRequestStatus enum in the Prisma schema.
    return await handleGetMyAccessRequest(user);
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
