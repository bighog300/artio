import { inviteCreatedDedupeKey, submissionDecisionDedupeKey, submissionSubmittedDedupeKey } from "@/lib/notification-keys";
import { NotificationType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildNotification, NotificationTemplatePayload } from "@/lib/notification-templates";
import { randomUUID } from "node:crypto";

type EnqueueNotificationParams = {
  type: NotificationType;
  toEmail: string;
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
  replyTo?: string;
  inApp?: {
    userId: string;
    title: string;
    body: string;
    href?: string;
    dedupeKey?: string;
  };
};

type NotificationDb = Pick<typeof db, "notificationOutbox" | "notification" | "$transaction">;

type ListNotificationsParams = {
  limit: number;
  cursor?: string;
  unreadOnly?: boolean;
};

type MarkNotificationsReadParams = {
  ids?: string[];
  all?: boolean;
};

type NotificationListCursor = {
  createdAt: string;
  id: string;
};

function encodeCursor(cursor: NotificationListCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): NotificationListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as NotificationListCursor;
    if (!parsed.id || !parsed.createdAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildInAppFromTemplate(userId: string, type: NotificationType, payload: NotificationTemplatePayload) {
  const built = buildNotification({ type, payload });
  return {
    userId,
    title: built.title,
    body: built.body,
    href: built.href,
    dedupeKey: built.dedupeKey,
  };
}

export async function enqueueNotificationWithDb(notificationDb: NotificationDb, params: EnqueueNotificationParams) {
  const outboxOp = notificationDb.notificationOutbox.upsert({
    where: { dedupeKey: params.dedupeKey },
    create: {
      type: params.type,
      toEmail: params.toEmail.toLowerCase(),
      payload: params.payload,
      dedupeKey: params.dedupeKey,
      replyTo: params.replyTo ?? null,
    },
    update: {},
  });

  if (!params.inApp) {
    return outboxOp;
  }

  const inboxOp = notificationDb.notification.upsert({
    where: { dedupeKey: params.inApp.dedupeKey ?? params.dedupeKey },
    create: {
      userId: params.inApp.userId,
      type: params.type,
      title: params.inApp.title,
      body: params.inApp.body,
      href: params.inApp.href,
      dedupeKey: params.inApp.dedupeKey ?? params.dedupeKey,
    },
    update: {},
  });

  const [outbox] = await notificationDb.$transaction([outboxOp, inboxOp]);
  return outbox;
}

export async function enqueueNotification(params: EnqueueNotificationParams) {
  return enqueueNotificationWithDb(db, params);
}

export async function createNotification(
  notificationDb: Pick<typeof db, "notification">,
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string | null;
    href?: string | null;
    entityType?: string | null;
    entityId?: string | null;
  },
) {
  return notificationDb.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? "",
      href: params.href ?? null,
      dedupeKey: `notif:${params.userId}:${randomUUID()}`,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
    },
  });
}

export async function listNotifications(
  notificationDb: Pick<typeof db, "notification">,
  userId: string,
  params: ListNotificationsParams,
) {
  const limit = Math.min(Math.max(params.limit, 1), 50);
  const decodedCursor = params.cursor ? decodeCursor(params.cursor) : null;
  const where: Prisma.NotificationWhereInput = {
    userId,
    archivedAt: null,
    ...(params.unreadOnly ? { readAt: null } : {}),
  };

  const page = await notificationDb.notification.findMany({
    where: decodedCursor
      ? {
        ...where,
        OR: [
          { createdAt: { lt: new Date(decodedCursor.createdAt) } },
          { createdAt: new Date(decodedCursor.createdAt), id: { lt: decodedCursor.id } },
        ],
      }
      : where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
  };
}

export async function markNotificationsRead(
  notificationDb: Pick<typeof db, "notification">,
  userId: string,
  params: MarkNotificationsReadParams,
) {
  const now = new Date();
  if (params.all) {
    await notificationDb.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now, status: "READ" },
    });
    return;
  }

  if (!params.ids?.length) return;
  await notificationDb.notification.updateMany({
    where: { userId, id: { in: params.ids }, readAt: null },
    data: { readAt: now, status: "READ" },
  });
}

export async function countUnreadNotifications(notificationDb: Pick<typeof db, "notification">, userId: string) {
  return notificationDb.notification.count({ where: { userId, readAt: null, archivedAt: null } });
}

export { inviteCreatedDedupeKey, submissionDecisionDedupeKey, submissionSubmittedDedupeKey };
