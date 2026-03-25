import { NextRequest } from "next/server";
import { isAuthError, requireEditor } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { adminArtistCreateSchema, parseBody, zodDetails } from "@/lib/validators";
import { handleAdminEntityList } from "@/lib/admin-artists-route";
import { requireAdmin } from "@/lib/admin";
import { isForbiddenError } from "@/lib/http-errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleAdminEntityList(req, { requireAdminUser: requireAdmin, appDb: db });
}

export async function POST(req: NextRequest) {
  try {
    await requireEditor();
    const parsed = adminArtistCreateSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));
    const item = await db.artist.create({ data: parsed.data });
    return Response.json(item, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (isForbiddenError(error)) return apiError(403, "forbidden", "Editor role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
