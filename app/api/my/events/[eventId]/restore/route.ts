import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eventIdParamSchema, zodDetails } from "@/lib/validators";
import { apiError } from "@/lib/api";
import { handleMyEntityRestore } from "@/lib/my-entity-archive-route";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const parsedId = eventIdParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  return handleMyEntityRestore({ id: parsedId.data.eventId }, {
    requireAuth,
    getEntityForUser: (id, userId) => db.event.findFirst({
      where: {
        id,
        OR: [
          { venue: { memberships: { some: { userId, role: { in: ["OWNER", "EDITOR"] } } } } },
          { submissions: { some: { submitterUserId: userId, type: "EVENT", OR: [{ kind: "PUBLISH" }, { kind: null }] } } },
        ],
      },
      select: { id: true, deletedAt: true, deletedReason: true, deletedByAdminId: true },
    }),
    updateEntity: (id, data) => db.event.update({ where: { id }, data, select: { id: true, deletedAt: true, deletedReason: true, deletedByAdminId: true } }),
  });
}
