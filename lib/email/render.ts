import { NotificationType } from "@prisma/client";
import { NotificationTemplatePayload } from "@/lib/notification-templates";

export async function renderEmailTemplate(_type: NotificationType, _payload: NotificationTemplatePayload) {
  throw new Error("render dispatcher not implemented");
}
