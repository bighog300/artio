import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleDeleteRegistrationByConfirmationCode } from "@/lib/registration-cancel-route";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ confirmationCode: string }> }) {
  const { confirmationCode } = await params;

  return handleDeleteRegistrationByConfirmationCode(req, confirmationCode, {
    getSessionUser,
    findRegistrationByConfirmationCode: (code) => db.registration.findUnique({
      where: { confirmationCode: code },
      select: {
        id: true,
        userId: true,
        eventId: true,
        tierId: true,
        guestEmail: true,
        confirmationCode: true,
        status: true,
        event: {
          select: {
            title: true,
            slug: true,
            venueId: true,
          },
        },
      },
    }),
    hasVenueMembership: async (venueId, userId) => {
      const member = await db.venueMembership.findUnique({
        where: {
          userId_venueId: {
            userId,
            venueId,
          },
        },
        select: { id: true },
      });
      return Boolean(member);
    },
    prisma: db,
    enqueueNotificationOutbox: ({ type, toEmail, dedupeKey, payload }) => db.notificationOutbox.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        type: type as never,
        toEmail,
        dedupeKey,
        payload: payload as Prisma.InputJsonValue,
      },
    }),
  });
}
