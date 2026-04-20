import type { PrismaClient } from "@prisma/client";
import { getEffectiveNotificationPreferences, isWithinQuietHours } from "@/lib/notification-preferences";

export async function syncEventReminderNotifications(db: PrismaClient, userId: string, now: Date = new Date()) {
  const prefs = await getEffectiveNotificationPreferences(userId);
  if (!prefs.eventRemindersEnabled) return;
  if (isWithinQuietHours(now, prefs)) return;

  const dueBefore = new Date(now.getTime() + 5 * 60 * 1000);
  const dueReminders = await db.eventReminder.findMany({
    where: {
      userId,
      deliveredAt: null,
      remindAt: { lte: dueBefore },
      event: { isPublished: true, deletedAt: null },
    },
    select: {
      id: true,
      preset: true,
      remindAt: true,
      event: { select: { id: true, slug: true, title: true } },
    },
    orderBy: { remindAt: "asc" },
    take: 50,
  });

  if (!dueReminders.length) return;

  await db.$transaction(dueReminders.flatMap((reminder) => {
    const dedupeKey = `user-reminder:${userId}:${reminder.event.id}:${reminder.preset}:${reminder.remindAt.toISOString()}`;
    const prefix = reminder.preset === "2H" ? "starts in about 2 hours" : "is tomorrow";
    return [
      db.notification.upsert({
        where: { dedupeKey },
        update: {},
        create: {
          userId,
          type: "EVENT_CHANGE_NOTIFY",
          title: `Reminder: ${reminder.event.title} ${prefix}`,
          body: `Your ${reminder.preset} reminder is due now.`,
          href: `/events/${reminder.event.slug}`,
          dedupeKey,
          entityType: "EVENT",
          entityId: reminder.event.id,
        },
      }),
      db.eventReminder.update({ where: { id: reminder.id }, data: { deliveredAt: now } }),
    ];
  }));
}

export async function syncDueEventReminderNotificationsGlobal(db: PrismaClient, now: Date = new Date()) {
  const dueBefore = new Date(now.getTime() + 5 * 60 * 1000);
  const dueReminders = await db.eventReminder.findMany({
    where: {
      deliveredAt: null,
      remindAt: { lte: dueBefore },
      event: { isPublished: true, deletedAt: null },
    },
    select: {
      id: true,
      userId: true,
      preset: true,
      remindAt: true,
      event: { select: { id: true, slug: true, title: true } },
    },
    orderBy: { remindAt: "asc" },
    take: 500,
  });

  for (const reminder of dueReminders) {
    const prefs = await getEffectiveNotificationPreferences(reminder.userId);
    if (!prefs.eventRemindersEnabled || isWithinQuietHours(now, prefs)) continue;

    const dedupeKey = `user-reminder:${reminder.userId}:${reminder.event.id}:${reminder.preset}:${reminder.remindAt.toISOString()}`;
    const prefix = reminder.preset === "2H" ? "starts in about 2 hours" : "is tomorrow";
    await db.$transaction([
      db.notification.upsert({
        where: { dedupeKey },
        update: {},
        create: {
          userId: reminder.userId,
          type: "EVENT_CHANGE_NOTIFY",
          title: `Reminder: ${reminder.event.title} ${prefix}`,
          body: `Your ${reminder.preset} reminder is due now.`,
          href: `/events/${reminder.event.slug}`,
          dedupeKey,
          entityType: "EVENT",
          entityId: reminder.event.id,
        },
      }),
      db.eventReminder.update({ where: { id: reminder.id }, data: { deliveredAt: now } }),
    ]);
  }
}
