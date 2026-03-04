import { db } from "@/lib/db";
import { requireEditor } from "@/lib/auth";
import { handleApproveSubmission } from "@/lib/admin-submission-review-route";
import { notifySavedSearchMatches } from "@/lib/saved-searches/notify-saved-search-matches";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApproveSubmission(params, {
    requireEditor,
    findSubmission: async (id) => db.submission.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        kind: true,
        details: true,
        targetEventId: true,
        targetVenueId: true,
        targetArtistId: true,
        status: true,
        submitter: { select: { id: true, email: true } },
        targetVenue: { select: { slug: true } },
        targetArtist: { select: { slug: true } },
      },
    }),
    publishVenue: async (venueId) => {
      await db.venue.update({ where: { id: venueId }, data: { isPublished: true, status: "PUBLISHED" } });
    },
    setVenueDraft: async () => undefined,
    publishArtist: async (artistId) => {
      await db.artist.update({ where: { id: artistId }, data: { isPublished: true } });
    },
    setArtistDraft: async () => undefined,
    publishEvent: async (eventId) => {
      await db.event.update({ where: { id: eventId }, data: { isPublished: true, status: "PUBLISHED", publishedAt: new Date() } });
      await notifySavedSearchMatches(eventId);
    },
    setEventDraft: async () => undefined,
    markApproved: async (submissionId, decidedByUserId) => {
      await db.submission.update({
        where: { id: submissionId },
        data: { status: "APPROVED", decidedByUserId, decidedAt: new Date(), decisionReason: null },
      });
    },
    markNeedsChanges: async () => undefined,
    findEventUpdatedAt: async (eventId) => { const item = await db.event.findUnique({ where: { id: eventId }, select: { updatedAt: true } }); return item?.updatedAt ?? null; },
    applyEventRevisionUpdate: async (eventId, data) => {
      await db.event.update({ where: { id: eventId }, data: { ...data, isPublished: true, status: "PUBLISHED" } });
      await notifySavedSearchMatches(eventId);
    },
  });
}
