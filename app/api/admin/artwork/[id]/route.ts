import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { handleAdminEntityGet, handleAdminEntityPatch } from "@/lib/admin-artworks-route";
import { withAdminRoute } from "@/lib/admin-route";
import { logAdminAction as writeAdminAuditLog } from "@/lib/admin-audit";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityGet(req, await params, { requireAdminUser: requireAdmin, appDb: db });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityPatch(req, await params, { requireAdminUser: requireAdmin, appDb: db });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdminRoute(async ({ actorEmail }) => {
    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

    try {
      await db.artwork.delete({ where: { id: parsedId.data.id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return apiError(409, "conflict", "Cannot delete artwork due to related records. Archive it instead or remove dependencies.");
      }
      throw error;
    }

    await writeAdminAuditLog({
      actorEmail,
      action: "ARTWORK_HARD_DELETED",
      targetType: "artwork",
      targetId: parsedId.data.id,
      metadata: { artworkId: parsedId.data.id, actorEmail },
      req,
    });

    return Response.json({ ok: true });
  });
}
