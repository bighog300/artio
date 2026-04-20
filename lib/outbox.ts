import { db } from "@/lib/db";
import { sendPendingNotificationsWithDb } from "@/lib/outbox-worker";
import { syncDueEventReminderNotificationsGlobal } from "@/domains/notification/event-reminder-notifications";

export async function sendPendingNotifications({ limit }: { limit: number }) {
  await syncDueEventReminderNotificationsGlobal(db);
  return sendPendingNotificationsWithDb({ limit }, db);
}
