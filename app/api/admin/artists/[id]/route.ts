import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { handleAdminEntityPatch } from "@/lib/admin-entities-route";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityPatch(req, "artists", await params, { requireAdminUser: requireAdmin, appDb: db });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
    const artist = await db.artist.findUnique({
      where: { id: parsedId.data.id },
      select: { deletedAt: true },
    });
    if (!artist) return apiError(404, "not_found", "Artist not found");
    if (!artist.deletedAt) {
      return apiError(409, "invalid_state", "Artist must be archived before it can be permanently deleted");
    }
    await db.artist.delete({ where: { id: parsedId.data.id } });
    return Response.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
