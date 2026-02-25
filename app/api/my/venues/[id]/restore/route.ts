import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { apiError } from "@/lib/api";
import { handleMyEntityRestore } from "@/lib/my-entity-archive-route";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  return handleMyEntityRestore(parsedId.data, {
    requireAuth,
    getEntityForUser: (id, userId) => db.venue.findFirst({
      where: { id, memberships: { some: { userId, role: { in: ["OWNER", "EDITOR"] } } } },
      select: { id: true, deletedAt: true, deletedReason: true, deletedByAdminId: true },
    }),
    updateEntity: (id, data) => db.venue.update({ where: { id }, data, select: { id: true, deletedAt: true, deletedReason: true, deletedByAdminId: true } }),
  });
}
