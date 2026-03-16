import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { handleAdminEntityGet, handleAdminEntityPatch } from "@/lib/admin-entities-route";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityGet(req, "artwork", await params, { requireAdminUser: requireAdmin, appDb: db });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminEntityPatch(req, "artwork", await params, { requireAdminUser: requireAdmin, appDb: db });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
    await db.artwork.delete({ where: { id: parsedId.data.id } });
    return Response.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return apiError(409, "conflict", "Cannot delete artwork due to related records. Archive it instead or remove dependencies.");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
