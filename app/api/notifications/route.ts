import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { ensureDbUserForSession } from "@/lib/ensure-db-user-for-session";
import { getSessionUser } from "@/lib/auth";
import { countUnreadNotifications, listNotifications } from "@/lib/notifications";
import { db } from "@/lib/db";
import { notificationsListQuerySchema, zodDetails } from "@/lib/validators";
import { syncFollowEventNotifications } from "@/domains/notification/follow-event-notifications";
import { syncEventReminderNotifications } from "@/domains/notification/event-reminder-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    const user = await ensureDbUserForSession(sessionUser);
    if (!user) return apiError(401, "unauthorized", "Authentication required");

    await syncFollowEventNotifications(db, user.id);
    await syncEventReminderNotifications(db, user.id);

    const parsed = notificationsListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query", zodDetails(parsed.error));

    const page = await listNotifications(db, user.id, parsed.data);
    const unreadCount = await countUnreadNotifications(db, user.id);

    return NextResponse.json({ ...page, unreadCount }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
