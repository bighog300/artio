import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { requireAuth } from "@/lib/auth";
import { eventIdParamSchema, zodDetails } from "@/lib/validators";
import { apiError } from "@/lib/api";
import { handleEventSelfPublish } from "@/lib/my-event-self-publish-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const parsedId = eventIdParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  return handleEventSelfPublish(req, { eventId: parsedId.data.eventId, isPublished: false }, {
    requireAuth,
    canEditEvent: async (eventId, user) => {
      if (user.role === "ADMIN") return true;
      const event = await db.event.findUnique({ where: { id: eventId }, select: { venueId: true } });
      if (!event?.venueId) return false;
      const membership = await db.venueMembership.findUnique({ where: { userId_venueId: { userId: user.id, venueId: event.venueId } }, select: { id: true } });
      return Boolean(membership);
    },
    findEventForPublish: (eventId) => db.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, startAt: true, endAt: true, timezone: true, venueId: true, ticketUrl: true, isPublished: true, deletedAt: true, status: true, venue: { select: { status: true, isPublished: true } } } }),
    updateEventPublishState: (eventId, isPublished) => db.event.update({ where: { id: eventId }, data: { isPublished, status: "DRAFT", publishedAt: isPublished ? new Date() : null }, select: { id: true, title: true, startAt: true, endAt: true, timezone: true, venueId: true, ticketUrl: true, isPublished: true, deletedAt: true, status: true } }),
    logAdminAction,
  });
}
