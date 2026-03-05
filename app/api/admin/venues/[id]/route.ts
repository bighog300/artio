import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { handleAdminEntityGet, handleAdminEntityPatch } from "@/lib/admin-entities-route";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityGet(req, "venues", await params, { requireAdminUser: requireAdmin, appDb: db });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityPatch(req, "venues", await params, { requireAdminUser: requireAdmin, appDb: db });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
    const venue = await db.venue.findUnique({
      where: { id: parsedId.data.id },
      select: { deletedAt: true },
    });
    if (!venue) return apiError(404, "not_found", "Venue not found");
    if (!venue.deletedAt) {
      return apiError(409, "invalid_state", "Venue must be archived before it can be permanently deleted");
    }
    await db.venue.delete({ where: { id: parsedId.data.id } });
    return Response.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
