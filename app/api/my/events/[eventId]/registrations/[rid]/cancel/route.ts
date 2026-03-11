import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { enqueueNotification } from "@/lib/notifications";
import { apiError } from "@/lib/api";
import { parseBody } from "@/lib/validators";
import { cancelRegistrationTransaction } from "@/lib/registration-cancel-transaction";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

const cancelBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string; rid: string }> }) {
  try {
    const user = await requireAuth();
    const { eventId, rid } = await params;

    const isMember = await db.venueMembership.count({
      where: {
        userId: user.id,
        venue: { events: { some: { id: eventId } } },
      },
    });
    if (!isMember) return apiError(403, "forbidden", "Venue membership required");

    const parsedBody = cancelBodySchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload");

    const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, slug: true } });
    if (!event) return apiError(404, "not_found", "Event not found");

    const { cancelled } = await db.$transaction((tx) => cancelRegistrationTransaction(tx, {
      registrationId: rid,
      eventTitle: event.title,
      eventSlug: event.slug,
      enqueueWaitlistPromotionNotification: async ({ registrationId, guestEmail, guestName, eventTitle, eventSlug }) => {
        await enqueueNotification({
          type: "WAITLIST_PROMOTED" as Parameters<typeof enqueueNotification>[0]["type"],
          toEmail: guestEmail,
          dedupeKey: `waitlist-promoted-${registrationId}`,
          payload: {
            type: "WAITLIST_PROMOTED",
            eventTitle,
            eventSlug,
            guestName,
            registrationId,
          },
        });
      },
    }));

    if (cancelled.eventId !== eventId) return apiError(404, "not_found", "Registration not found");

    await enqueueNotification({
      type: "RSVP_CANCELLED",
      toEmail: cancelled.guestEmail,
      dedupeKey: `rsvp-cancelled-${cancelled.id}`,
      payload: {
        type: "RSVP_CANCELLED",
        eventTitle: event.title,
        confirmationCode: cancelled.confirmationCode,
        reason: parsedBody.data.reason,
        eventSlug: event.slug,
      },
    });

    return NextResponse.json({ ok: true, registrationId: cancelled.id, status: cancelled.status }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "registration_not_found") return apiError(404, "not_found", "Registration not found");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
