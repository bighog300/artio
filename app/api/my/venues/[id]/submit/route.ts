import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireVenueRole } from "@/lib/auth";
import { handleVenueSubmit } from "@/lib/my-venue-submit-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleVenueSubmit(req, params, {
    requireAuth,
    requireVenueMembership: async (_userId, venueId) => {
      await requireVenueRole(venueId, "EDITOR");
    },
    findVenueForSubmit: async (venueId) => db.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        name: true,
        description: true,
        featuredAssetId: true,
        featuredImageUrl: true,
        addressLine1: true,
        city: true,
        country: true,
        websiteUrl: true,
        isPublished: true,
        images: { select: { id: true }, take: 1 },
      },
    }),
    setVenuePublishedDraft: async (venueId) => {
      await db.venue.update({ where: { id: venueId }, data: { isPublished: false } });
    },
    getLatestSubmissionStatus: async (venueId) => db.submission.findFirst({
      where: { targetVenueId: venueId, type: "VENUE", kind: "PUBLISH" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { status: true },
    }).then((row) => row?.status ?? null),
    createSubmission: async ({ venueId, userId, message }) => db.submission.create({
      data: {
        type: "VENUE",
        kind: "PUBLISH",
        status: "IN_REVIEW",
        submitterUserId: userId,
        venueId,
        targetVenueId: venueId,
        note: message ?? null,
        decisionReason: null,
        submittedAt: new Date(),
        decidedAt: null,
        decidedByUserId: null,
      },
      select: { id: true, status: true, createdAt: true, submittedAt: true },
    }),
  });
}
