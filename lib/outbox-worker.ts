import { getResendClient } from "@/lib/email/client";
import { renderEmailTemplate } from "@/lib/email/render";
import { captureException, withSpan } from "@/lib/monitoring";
import { NotificationTemplatePayload } from "@/lib/notification-templates";
import { NotificationType, Prisma } from "@prisma/client";

type OutboxRow = {
  id: string;
  type: NotificationType;
  toEmail: string;
  replyTo: string | null;
  payload: Prisma.JsonValue;
  dedupeKey: string;
  attemptCount: number;
};

export type OutboxWorkerDb = {
  siteSettings: {
    findUnique: (args: {
      where: { id: "default" };
      select: {
        emailEnabled: true;
        emailFromAddress: true;
        resendApiKey: true;
        resendFromAddress: true;
      };
    }) => Promise<{
      emailEnabled: boolean;
      emailFromAddress: string | null;
      resendApiKey: string | null;
      resendFromAddress: string | null;
    } | null>;
  };
  emailUnsubscribe: {
    findUnique: (args: {
      where: { email: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  event: {
    findMany: (args: {
      where: {
        isPublished: true;
        startAt: { gte: Date; lte: Date };
      };
      select: {
        id: true;
        title: true;
        slug: true;
        startAt: true;
        venue: { select: { name: true; address: true } };
      };
    }) => Promise<Array<{ id: string; title: string; slug: string | null; startAt: Date; venue: { name: string; address: string | null } | null }>>;
  };
  registration: {
    findMany: (args: {
      where: { eventId: string; status: "CONFIRMED" };
      select: { id: true; guestEmail: true };
    }) => Promise<Array<{ id: string; guestEmail: string }>>;
  };
  notificationOutbox: {
    upsert: (args: {
      where: { dedupeKey: string };
      create: {
        type: NotificationType;
        toEmail: string;
        payload: Prisma.InputJsonValue;
        dedupeKey: string;
      };
      update: Record<string, never>;
    }) => Promise<unknown>;
    findMany: (args: {
      where: {
        status: "PENDING";
        OR: Array<{ nextRetryAt: null } | { nextRetryAt: { lte: Date } }>;
      };
      orderBy: { createdAt: "asc" };
      take: number;
      select: {
        id: true;
        type: true;
        toEmail: true;
        replyTo: true;
        payload: true;
        dedupeKey: true;
        attemptCount: true;
      };
    }) => Promise<OutboxRow[]>;
    updateMany: (args: {
      where:
        | { id: string; status: "PENDING" | "PROCESSING"; errorMessage?: string | null }
        | { status: "PROCESSING"; createdAt: { lte: Date } };
      data: {
        status?: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED_UNSUBSCRIBED";
        sentAt?: Date | null;
        errorMessage?: string | null;
        attemptCount?: number;
        nextRetryAt?: Date | null;
      };
    }) => Promise<{ count: number }>;
  };
};


export async function enqueueReminderSweepWithDb(db: OutboxWorkerDb, now: Date = new Date()) {
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const events = await db.event.findMany({
    where: { isPublished: true, startAt: { gte: windowStart, lte: windowEnd } },
    select: {
      id: true,
      title: true,
      slug: true,
      startAt: true,
      venue: { select: { name: true, address: true } },
    },
  });

  for (const event of events) {
    if (!event.slug) continue;
    const registrations = await db.registration.findMany({
      where: { eventId: event.id, status: "CONFIRMED" },
      select: { id: true, guestEmail: true },
    });

    for (const registration of registrations) {
      const dedupeKey = `reminder-24h-${event.id}-${registration.id}`;
      await db.notificationOutbox.upsert({
        where: { dedupeKey },
        create: {
          type: "EVENT_REMINDER_24H",
          toEmail: registration.guestEmail.toLowerCase(),
          dedupeKey,
          payload: {
            type: "EVENT_REMINDER_24H",
            eventTitle: event.title,
            eventSlug: event.slug,
            startAt: event.startAt.toISOString(),
            venueName: event.venue?.name ?? "Venue",
            venueAddress: event.venue?.address ?? undefined,
          },
        },
        update: {},
      });
    }
  }
}

export async function sendPendingNotificationsWithDb({ limit }: { limit: number }, db: OutboxWorkerDb) {
  await enqueueReminderSweepWithDb(db);

  await db.notificationOutbox.updateMany({
    where: {
      status: "PROCESSING",
      createdAt: { lte: new Date(Date.now() - 10 * 60 * 1000) },
    },
    data: { status: "PENDING" },
  });

  const settings = await db.siteSettings.findUnique({
    where: { id: "default" },
    select: {
      emailEnabled: true,
      emailFromAddress: true,
      resendApiKey: true,
      resendFromAddress: true,
    },
  });

  if (!settings?.emailEnabled) {
    return { sent: 0, failed: 0, skipped: limit };
  }

  const resendApiKey = settings.resendApiKey?.trim();
  if (!resendApiKey) {
    return { sent: 0, failed: 0, skipped: limit };
  }

  const pending = await withSpan("outbox:load_pending", async () => db.notificationOutbox.findMany({
    where: {
      status: "PENDING",
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      type: true,
      toEmail: true,
      replyTo: true,
      payload: true,
      dedupeKey: true,
      attemptCount: true,
    },
  }));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const notification of pending) {
    const claimed = await db.notificationOutbox.updateMany({
      where: { id: notification.id, status: "PENDING", errorMessage: null },
      data: {
        status: "PROCESSING",
        errorMessage: null,
      },
    });

    if (claimed.count === 0) {
      skipped += 1;
      continue;
    }

    try {
      await withSpan("outbox:deliver", async () => {
        // Only broadcast and digest emails respect unsubscribes.
        // Transactional types (INVITE_CREATED, SUBMISSION_*, etc.) always deliver
        // because they are responses to a user's own action.
        if (notification.type === "BROADCAST" || notification.type === "DIGEST_READY") {
          const isUnsubscribed = await db.emailUnsubscribe.findUnique({
            where: { email: notification.toEmail.toLowerCase() },
            select: { id: true },
          });

          if (isUnsubscribed) {
            await db.notificationOutbox.updateMany({
              where: { id: notification.id, status: "PROCESSING" },
              data: { status: "SKIPPED_UNSUBSCRIBED", sentAt: new Date() },
            });
            skipped += 1;
            return;
          }
        }

        const { subject, html, text } = await renderEmailTemplate(
          notification.type,
          notification.payload as NotificationTemplatePayload,
        );

        const fromAddress =
          settings.resendFromAddress ??
          settings.emailFromAddress ??
          "Artpulse <noreply@mail.artpulse.co>";

        const resend = getResendClient(resendApiKey);
        const payload = notification.payload as { tags?: Array<{ name: string; value: string }> };
        await resend.emails.send({
          from: fromAddress,
          to: notification.toEmail,
          subject,
          html,
          text,
          ...(notification.replyTo ? { replyTo: notification.replyTo } : {}),
          tags: [{ name: "type", value: notification.type }, ...(payload.tags ?? [])],
        });

        const markedSent = await db.notificationOutbox.updateMany({
          where: { id: notification.id, status: "PROCESSING", errorMessage: null },
          data: {
            status: "SENT",
            sentAt: new Date(),
            errorMessage: null,
          },
        });

        if (markedSent.count === 1) {
          sent += 1;
        } else {
          skipped += 1;
        }
      });
    } catch (error) {
      captureException(error, { worker: "outbox", outboxId: notification.id, dedupeKey: notification.dedupeKey });
      const message = error instanceof Error ? error.message : "Unknown send error";
      const BACKOFF_MS = [60_000, 300_000, 1_800_000];
      const attempt = notification.attemptCount + 1;
      const backoff = BACKOFF_MS[attempt - 1] ?? null;

      const markedFailed = await db.notificationOutbox.updateMany({
        where: { id: notification.id, status: "PROCESSING", errorMessage: null },
        data: {
          status: backoff ? "PENDING" : "FAILED",
          sentAt: null,
          errorMessage: message,
          attemptCount: attempt,
          nextRetryAt: backoff ? new Date(Date.now() + backoff) : null,
        },
      });

      if (markedFailed.count === 1) {
        failed += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return { sent, failed, skipped };
}
