import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { handleAdminEntityPatch } from "@/lib/admin-events-route";
import { notifyGoogleIndexing } from "@/lib/google-event-indexing";
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

    const event = await db.event.findUnique({
      where: { id: parsedId.data.id },
      select: { deletedAt: true, slug: true },
    });
    if (!event) return apiError(404, "not_found", "Event not found");
    if (!event.deletedAt) {
      return apiError(409, "invalid_state", "Event must be archived before it can be permanently deleted");
    }
    if (event.slug) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      await notifyGoogleIndexing(`${appUrl}/events/${event.slug}`, "URL_DELETED");
    }

    await db.event.delete({ where: { id: parsedId.data.id } });

    await writeAdminAuditLog({
      actorEmail,
      action: "EVENT_HARD_DELETED",
      targetType: "event",
      targetId: parsedId.data.id,
      metadata: { eventId: parsedId.data.id, actorEmail },
      req,
    });

    return Response.json({ ok: true });
  });
}
