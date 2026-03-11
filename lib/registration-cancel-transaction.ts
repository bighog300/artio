import { RegistrationStatus } from "@prisma/client";

type RegistrationRecord = {
  id: string;
  eventId: string;
  tierId: string | null;
  guestName?: string;
  guestEmail: string;
  confirmationCode: string;
  status: RegistrationStatus;
};

type CancelTransactionArgs = {
  registrationId: string;
  eventTitle?: string;
  eventSlug?: string;
  enqueueWaitlistPromotionNotification?: (args: {
    registrationId: string;
    guestEmail: string;
    guestName?: string;
    eventTitle: string;
    eventSlug: string;
  }) => Promise<void>;
};

type CancelTransactionTx = {
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
    }) => Promise<RegistrationRecord | null>;
    update: (args: {
      where: { id: string };
      data: { status: "CANCELLED"; cancelledAt: Date } | { status: "CONFIRMED" };
      select: { id: true; eventId: true; tierId: true; guestEmail: true; confirmationCode: true; status: true };
    }) => Promise<RegistrationRecord>;
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
    }) => Promise<RegistrationRecord | null>;
  };
};

export async function cancelRegistrationTransaction(tx: CancelTransactionTx, args: CancelTransactionArgs) {
  const existing = await tx.registration.findUnique({
    where: { id: args.registrationId },
    select: { id: true, eventId: true, tierId: true, guestEmail: true, confirmationCode: true, status: true },
  });

  if (!existing) throw new Error("registration_not_found");
  if (existing.status === "CANCELLED") return { cancelled: existing, promoted: null };

  const cancelled = await tx.registration.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
    select: { id: true, eventId: true, tierId: true, guestEmail: true, confirmationCode: true, status: true },
  });

  const event = await tx.event.findUnique({
    where: { id: cancelled.eventId },
    select: { capacity: true },
  });

  if (!event || event.capacity == null) {
    return { cancelled, promoted: null };
  }

  const activeCount = await tx.registration.count({
    where: {
      eventId: cancelled.eventId,
      status: { in: ["CONFIRMED", "PENDING"] },
    },
  });

  if (activeCount >= event.capacity) {
    return { cancelled, promoted: null };
  }

  const waitlisted = await tx.registration.findFirst({
    where: {
      eventId: cancelled.eventId,
      status: "WAITLISTED",
      ...(cancelled.tierId ? { tierId: cancelled.tierId } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, eventId: true, tierId: true, guestEmail: true, confirmationCode: true, status: true },
  });

  if (!waitlisted) {
    return { cancelled, promoted: null };
  }

  const promoted = await tx.registration.update({
    where: { id: waitlisted.id },
    data: { status: "CONFIRMED" },
    select: { id: true, eventId: true, tierId: true, guestEmail: true, confirmationCode: true, status: true },
  });
  if (args.enqueueWaitlistPromotionNotification && args.eventTitle && args.eventSlug) {
    await args.enqueueWaitlistPromotionNotification({
    registrationId: promoted.id,
    guestEmail: promoted.guestEmail,
    guestName: (promoted as { guestName?: string }).guestName ?? "there",
    eventTitle: args.eventTitle,
    eventSlug: args.eventSlug,
    });
  }

  return { cancelled, promoted };
}
