
import { db } from "@/lib/db";
import { handleEventModerationIntent } from "@/lib/admin-events-moderation-intent-route";
import { notifySavedSearchMatches } from "@/lib/saved-searches/notify-saved-search-matches";
import { notifyGoogleIndexing } from "@/lib/google-event-indexing";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await params;
  return handleEventModerationIntent(req, parsedParams, {
    requireAdminUser: async () => {
      await requireAdmin();
    },
    findEvent: async (id) => db.event.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        deletedAt: true,
        startAt: true,
        timezone: true,
        venue: { select: { status: true, isPublished: true } },
        _count: { select: { images: true } },
      },
    }),
    updateEvent: async (id, data) => {
      await db.event.update({ where: { id }, data });
    },
    onPublished: async (eventId) => {
      await notifySavedSearchMatches(eventId);
      const event = await db.event.findUnique({ where: { id: eventId }, select: { slug: true } });
      if (event?.slug) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await notifyGoogleIndexing(`${appUrl}/events/${event.slug}`, "URL_UPDATED");
      }
    },
    onArchived: async (eventId) => {
      const event = await db.event.findUnique({ where: { id: eventId }, select: { slug: true } });
      if (event?.slug) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await notifyGoogleIndexing(`${appUrl}/events/${event.slug}`, "URL_DELETED");
      }
    },
  });
}
