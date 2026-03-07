import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { parseBody } from "@/lib/validators";
import { cancelRegistrationTransaction } from "@/lib/registration-cancel-transaction";

type SessionUser = { id: string };
type RegistrationStatus = "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED";

type RegistrationRecord = {
  id: string;
  userId: string | null;
  eventId: string;
  tierId: string | null;
  guestEmail: string;
  confirmationCode: string;
  status: RegistrationStatus;
  event: {
    title: string;
    slug: string;
    venueId: string | null;
  };
};

type CancelledOrPromotedRegistration = {
  id: string;
  guestEmail: string;
  confirmationCode: string;
};

type EnqueueNotificationArgs = {
  type: "REGISTRATION_CANCELLED" | "REGISTRATION_CONFIRMED";
  toEmail: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
};

type Deps = {
  getSessionUser: () => Promise<SessionUser | null>;
  findRegistrationByConfirmationCode: (confirmationCode: string) => Promise<RegistrationRecord | null>;
  hasVenueMembership: (venueId: string, userId: string) => Promise<boolean>;
  prisma: {
    $transaction: <T>(fn: (tx: {
      event: {
        findUnique: (args: {
          where: { id: string };
          select: { capacity: true };
        }) => Promise<{ capacity: number | null } | null>;
      };
      registration: {
        findUnique: (args: {
          where: { id: string };
          select: { id: true; eventId: true; tierId: true; guestEmail: true; confirmationCode: true; status: true };
        }) => Promise<{
          id: string;
          eventId: string;
          tierId: string | null;
          guestEmail: string;
          confirmationCode: string;
          status: RegistrationStatus;
        } | null>;
        update: (args: {
          where: { id: string };
          data: { status: "CANCELLED"; cancelledAt: Date } | { status: "CONFIRMED" };
          select: { id: true; eventId: true; tierId: true; guestEmail: true; confirmationCode: true; status: true };
        }) => Promise<{
          id: string;
          eventId: string;
          tierId: string | null;
          guestEmail: string;
          confirmationCode: string;
          status: RegistrationStatus;
        }>;
        count: (args: {
          where: {
            eventId: string;
            status: { in: RegistrationStatus[] };
          };
        }) => Promise<number>;
        findFirst: (args: {
          where: {
            eventId: string;
            status: "WAITLISTED";
            tierId?: string;
          };
          orderBy: { createdAt: "asc" };
          select: { id: true; eventId: true; tierId: true; guestEmail: true; confirmationCode: true; status: true };
        }) => Promise<{
          id: string;
          eventId: string;
          tierId: string | null;
          guestEmail: string;
          confirmationCode: string;
          status: RegistrationStatus;
        } | null>;
      };
    }) => Promise<T>) => Promise<T>;
  };
  enqueueNotificationOutbox: (args: EnqueueNotificationArgs) => Promise<unknown>;
};

const bodySchema = z.object({
  email: z.string().trim().email().optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function emailEquals(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function handleDeleteRegistrationByConfirmationCode(
  req: NextRequest,
  confirmationCode: string,
  deps: Deps,
) {
  const parsedBody = bodySchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload");

  const registration = await deps.findRegistrationByConfirmationCode(confirmationCode);
  if (!registration) return apiError(404, "not_found", "Registration not found");

  const user = await deps.getSessionUser();
  const providedEmail = parsedBody.data.email;

  if (!user && !providedEmail) {
    return apiError(400, "invalid_request", "email is required for guest cancellation");
  }

  const isSelfCancellation = Boolean(user && registration.userId && registration.userId === user.id);
  const isGuestEmailMatch = Boolean(providedEmail && emailEquals(providedEmail, registration.guestEmail));
  const isVenueMember = user && registration.event.venueId
    ? await deps.hasVenueMembership(registration.event.venueId, user.id)
    : false;

  if (!isSelfCancellation && !isGuestEmailMatch && !isVenueMember) {
    return apiError(403, "forbidden", "Not allowed to cancel this registration");
  }

  if (registration.status === "CANCELLED") {
    return apiError(400, "invalid_request", "Registration already cancelled");
  }

  const { cancelled, promoted } = await deps.prisma.$transaction((tx) => cancelRegistrationTransaction(tx, { registrationId: registration.id }));

  await deps.enqueueNotificationOutbox({
    type: "REGISTRATION_CANCELLED",
    toEmail: cancelled.guestEmail,
    dedupeKey: `registration-cancelled-${cancelled.id}`,
    payload: {
      type: "REGISTRATION_CANCELLED",
      eventTitle: registration.event.title,
      eventSlug: registration.event.slug,
      confirmationCode: cancelled.confirmationCode,
      reason: parsedBody.data.reason,
    },
  });

  if (promoted) {
    await deps.enqueueNotificationOutbox({
      type: "REGISTRATION_CONFIRMED",
      toEmail: promoted.guestEmail,
      dedupeKey: `registration-confirmed-${promoted.id}`,
      payload: {
        type: "REGISTRATION_CONFIRMED",
        eventTitle: registration.event.title,
        eventSlug: registration.event.slug,
        confirmationCode: promoted.confirmationCode,
      },
    });
  }

  return NextResponse.json({ ok: true, status: "CANCELLED" }, { headers: NO_STORE_HEADERS });
}

export type { CancelledOrPromotedRegistration };
