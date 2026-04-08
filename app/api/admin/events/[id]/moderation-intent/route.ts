
import { db } from "@/lib/db";
import { handleEventModerationIntent } from "@/lib/admin-events-moderation-intent-route";
import { notifySavedSearchMatches } from "@/lib/saved-searches/notify-saved-search-matches";
import { notifyGoogleIndexing } from "@/lib/google-event-indexing";
import { requireAdmin } from "@/lib/admin";
import { enqueueNotification } from "@/lib/notifications";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await params;
  return handleEventModerationIntent(req, parsedParams, {
    requireAdminUser: async () => {
      const admin = await requireAdmin();
      return { email: admin.email };
    },
    findEvent: async (id) => db.event.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        deletedAt: true,
        isPublished: true,
        status: true,
        startAt: true,
        timezone: true,
        venue: { select: { status: true, isPublished: true } },
        _count: { select: { images: true } },
      },
    }),
    createAuditLog: async ({ actorEmail, targetId, metadata }) => {
      await db.adminAuditLog.create({
        data: {
          actorEmail: actorEmail ?? "unknown",
          action: "admin.event.moderation_intent",
          targetType: "event",
          targetId,
          metadata,
        },
      });
    },
    findLatestSubmissionSubmitter: async (eventId) => {
      const submission = await db.submission.findFirst({
        where: { targetEventId: eventId, type: "EVENT" },
        orderBy: { createdAt: "desc" },
        select: { submitter: { select: { id: true, email: true } } },
      });
      return submission?.submitter ?? null;
    },
    enqueueModerationNotification: async (params) => {
      await enqueueNotification(params);
    },
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
