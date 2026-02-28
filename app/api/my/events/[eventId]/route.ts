import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handlePatchMyEvent } from "@/lib/my-event-update-route";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return handlePatchMyEvent(req, params, {
    requireAuth,
    findSubmission: (eventId, userId) => db.submission.findFirst({
      where: { targetEventId: eventId, OR: [{ kind: "PUBLISH" }, { kind: null }] },
      include: { venue: { select: { memberships: { where: { userId }, select: { id: true } } } }, targetEvent: { select: { isPublished: true } } },
    }),
    countOwnedAssets: (assetIds, userId) => db.asset.count({ where: { id: { in: assetIds }, ownerUserId: userId } }),
    hasVenueMembership: async (userId, venueId) => Boolean(await db.venueMembership.findUnique({ where: { userId_venueId: { userId, venueId } }, select: { id: true } })),
    updateEvent: (eventId, data) => db.event.update({
      where: { id: eventId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
        ...(data.startAt !== undefined ? { startAt: data.startAt } : {}),
        ...(data.endAt !== undefined ? { endAt: data.endAt } : {}),
        ...(data.venueId !== undefined
          ? {
              venue: data.venueId
                ? { connect: { id: data.venueId } }
                : { disconnect: true },
            }
          : {}),
        ...(data.featuredAssetId !== undefined
          ? {
              featuredAsset: data.featuredAssetId
                ? { connect: { id: data.featuredAssetId } }
                : { disconnect: true },
            }
          : {}),
        ...(data.eventType !== undefined ? { eventType: data.eventType } : {}),
        ...(data.images
          ? {
              images: {
                deleteMany: {},
                create: data.images.map((image) => ({
                  assetId: image.assetId ?? null,
                  url: image.url ?? "",
                  alt: image.alt ?? null,
                  sortOrder: image.sortOrder,
                })),
              },
            }
          : {}),
        isPublished: false,
        publishedAt: null,
      },
    }),
    updateSubmissionVenue: (submissionId, venueId) => db.submission.update({ where: { id: submissionId }, data: { venueId } }).then(() => undefined),
    updateSubmissionNote: (submissionId, note) => db.submission.update({ where: { id: submissionId }, data: { note } }).then(() => undefined),
  });
}
