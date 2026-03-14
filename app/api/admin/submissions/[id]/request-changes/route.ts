import { NextRequest } from "next/server";
import { db } from "@/lib/db";

import { handleRequestChangesSubmission } from "@/lib/admin-submission-review-route";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

// ADMIN-only moderation decisions are required because approving/rejecting submissions can publish content.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRequestChangesSubmission(req, params, {
    requireAdmin,
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
    publishVenue: async () => undefined,
    setVenueDraft: async (venueId) => {
      await db.venue.update({ where: { id: venueId }, data: { isPublished: false, status: "CHANGES_REQUESTED" } });
    },
    publishArtist: async () => undefined,
    setArtistDraft: async (artistId) => {
      await db.artist.update({ where: { id: artistId }, data: { isPublished: false } });
    },
    publishEvent: async () => undefined,
    setEventDraft: async (eventId) => {
      await db.event.update({ where: { id: eventId }, data: { isPublished: false, status: "CHANGES_REQUESTED", publishedAt: null } });
    },
    markApproved: async () => undefined,
    findEventUpdatedAt: async () => null,
    applyEventRevisionUpdate: async () => undefined,
    markNeedsChanges: async (submissionId, decidedByUserId, message) => {
      await db.submission.update({
        where: { id: submissionId },
        data: { status: "REJECTED", decidedByUserId, decidedAt: new Date(), decisionReason: message },
      });
    },
  });
}
