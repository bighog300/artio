import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleEventModerationIntent } from "@/lib/admin-events-moderation-intent-route";
import { notifySavedSearchMatches } from "@/lib/saved-searches/notify-saved-search-matches";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await params;
  return handleEventModerationIntent(req, parsedParams, {
    requireAdminUser: async () => {
      await requireAdmin();
    },
    findEvent: async (id) => db.event.findUnique({ where: { id }, select: { id: true, slug: true, deletedAt: true } }),
    updateEvent: async (id, data) => {
      await db.event.update({ where: { id }, data });
    },
    onPublished: async (eventId) => { await notifySavedSearchMatches(eventId); },
  });
}
