import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { handleAdminEntityPatch } from "@/lib/admin-artists-route";
import { requireAdmin } from "@/lib/admin";
import { withAdminRoute } from "@/lib/admin-route";
import { logAdminAction as writeAdminAuditLog } from "@/lib/admin-audit";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityPatch(req, await params, { requireAdminUser: requireAdmin, appDb: db });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdminRoute(async ({ actorEmail }) => {
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

    await writeAdminAuditLog({
      actorEmail,
      action: "ARTIST_HARD_DELETED",
      targetType: "artist",
      targetId: parsedId.data.id,
      metadata: { artistId: parsedId.data.id, actorEmail },
      req,
    });

    return Response.json({ ok: true });
  });
}
