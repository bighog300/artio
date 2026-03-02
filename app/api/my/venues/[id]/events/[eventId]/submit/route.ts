import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleVenueEventSubmit } from "@/lib/my-venue-event-submit-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  return handleVenueEventSubmit(req, (async () => { const p = await params; return { venueId: p.id, eventId: p.eventId }; })(), {
    requireAuth,
    requireVenueMembership: async (userId, venueId) => {
      const membership = await db.venueMembership.findUnique({ where: { userId_venueId: { userId, venueId } }, select: { id: true } });
      if (!membership) throw new Error("forbidden");
    },
    findEventForSubmit: async (eventId, venueId) => db.event.findFirst({
      where: { id: eventId, venueId },
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        description: true,
        venueId: true,
        ticketUrl: true,
        isPublished: true,
        images: { select: { id: true }, take: 1 },
      },
    }),
    getLatestSubmissionStatus: async (eventId) => db.submission.findFirst({ where: { targetEventId: eventId, OR: [{ kind: "PUBLISH" }, { kind: null }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { status: true } }).then((row) => row?.status ?? null),
    createSubmission: async ({ venueId, eventId, userId, message }) => db.submission.create({
        data: {
          type: "EVENT",
          kind: "PUBLISH",
          status: "IN_REVIEW",
          submitterUserId: userId,
          venueId,
          targetEventId: eventId,
          note: message ?? null,
          submittedAt: new Date(),
        },
        select: { id: true, status: true, createdAt: true, submittedAt: true },
      }),
  });
}
