import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleCreateEventRevision } from "@/lib/my-venue-event-revision-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  return handleCreateEventRevision(req, (async () => { const p = await params; return { venueId: p.id, eventId: p.eventId }; })(), {
    requireAuth,
    requireVenueMembership: async (userId, venueId) => {
      const membership = await db.venueMembership.findUnique({ where: { userId_venueId: { userId, venueId } }, select: { id: true } });
      if (!membership) throw new Error("forbidden");
    },
    findEvent: async (eventId, venueId) => db.event.findFirst({
      where: { id: eventId, venueId },
      select: { id: true, title: true, description: true, startAt: true, endAt: true, ticketUrl: true, isPublished: true, updatedAt: true },
    }),
    createRevisionSubmission: async ({ eventId, venueId, userId, proposed, baseEventUpdatedAt, message }) => db.submission.create({
      data: {
        type: "EVENT",
        kind: "REVISION",
        status: "IN_REVIEW",
        submitterUserId: userId,
        venueId,
        targetEventId: eventId,
        note: message ?? null,
        submittedAt: new Date(),
        details: { kind: "REVISION", proposed: proposed as Prisma.JsonObject, baseEventUpdatedAt, message: message ?? null } as Prisma.JsonObject,
      },
      select: { id: true, status: true, createdAt: true, decisionReason: true, decidedAt: true },
    }),
    getLatestRevision: async () => null,
  });
}
