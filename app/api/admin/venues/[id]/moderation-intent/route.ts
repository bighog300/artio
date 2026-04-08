import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { enqueueNotification } from "@/lib/notifications";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { ok, parseModerationIntentBody } from "@/lib/admin-moderation-intent";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let actor: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    actor = await requireAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(403, "forbidden", "Admin role required");
  }

  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  const parsedBody = await parseModerationIntentBody(req);
  if ("error" in parsedBody) return parsedBody.error;

  const venue = await db.venue.findUnique({
    where: { id: parsedId.data.id },
    select: { id: true, slug: true, deletedAt: true, status: true, isPublished: true },
  });
  if (!venue) return apiError(404, "not_found", "Venue not found");

  if (parsedBody.action === "archive") {
    await db.venue.update({ where: { id: venue.id }, data: { status: "ARCHIVED", isPublished: false, deletedAt: venue.deletedAt ?? new Date() } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.venue.moderation_intent", targetType: "venue", targetId: venue.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "ARCHIVED", message: "Venue archived." });
  }

  if (parsedBody.action === "restore") {
    await db.venue.update({ where: { id: venue.id }, data: { status: "APPROVED", deletedAt: null, deletedReason: null } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.venue.moderation_intent", targetType: "venue", targetId: venue.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "APPROVED", message: "Venue restored." });
  }

  if (parsedBody.action === "approve_publish") {
    if (venue.isPublished || venue.status === "PUBLISHED") {
      return ok({ ok: true, status: "PUBLISHED", message: "Already published." });
    }
    await db.venue.update({ where: { id: venue.id }, data: { status: "PUBLISHED", isPublished: true, reviewedAt: new Date(), reviewNotes: null } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.venue.moderation_intent", targetType: "venue", targetId: venue.id, metadata: { action: parsedBody.action } } });
    try {
      const submission = await db.submission.findFirst({
        where: { targetVenueId: venue.id, type: "VENUE" },
        orderBy: { createdAt: "desc" },
        select: { submitter: { select: { id: true, email: true } } },
      });
      if (submission?.submitter) {
        await enqueueNotification({
          type: "SUBMISSION_APPROVED",
          toEmail: submission.submitter.email,
          dedupeKey: `moderation-intent:venue:${venue.id}:${parsedBody.action}:${Date.now()}`,
          payload: { venueId: venue.id, action: parsedBody.action },
        });
      }
    } catch {}
    return ok({ ok: true, status: "PUBLISHED", message: "Venue approved and published.", publicUrl: venue.slug ? `/venues/${venue.slug}` : undefined });
  }

  if (parsedBody.action === "unpublish") {
    await db.venue.update({ where: { id: venue.id }, data: { status: "APPROVED", isPublished: false } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.venue.moderation_intent", targetType: "venue", targetId: venue.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "APPROVED", message: "Venue unpublished." });
  }

  if (parsedBody.action === "request_changes") {
    await db.venue.update({ where: { id: venue.id }, data: { status: "CHANGES_REQUESTED", isPublished: false, reviewedAt: new Date(), reviewNotes: parsedBody.reason } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.venue.moderation_intent", targetType: "venue", targetId: venue.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } } });
    try {
      const submission = await db.submission.findFirst({
        where: { targetVenueId: venue.id, type: "VENUE" },
        orderBy: { createdAt: "desc" },
        select: { submitter: { select: { id: true, email: true } } },
      });
      if (submission?.submitter) {
        await enqueueNotification({
          type: "SUBMISSION_REJECTED",
          toEmail: submission.submitter.email,
          dedupeKey: `moderation-intent:venue:${venue.id}:${parsedBody.action}:${Date.now()}`,
          payload: { venueId: venue.id, action: parsedBody.action, reason: parsedBody.reason },
        });
      }
    } catch {}
    return ok({ ok: true, status: "CHANGES_REQUESTED", message: "Changes requested." });
  }

  await db.venue.update({ where: { id: venue.id }, data: { status: "REJECTED", isPublished: false, reviewedAt: new Date(), reviewNotes: parsedBody.reason } });
  await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.venue.moderation_intent", targetType: "venue", targetId: venue.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } } });
  try {
    const submission = await db.submission.findFirst({
      where: { targetVenueId: venue.id, type: "VENUE" },
      orderBy: { createdAt: "desc" },
      select: { submitter: { select: { id: true, email: true } } },
    });
    if (submission?.submitter) {
      await enqueueNotification({
        type: "SUBMISSION_REJECTED",
        toEmail: submission.submitter.email,
        dedupeKey: `moderation-intent:venue:${venue.id}:${parsedBody.action}:${Date.now()}`,
        payload: { venueId: venue.id, action: parsedBody.action, reason: parsedBody.reason },
      });
    }
  } catch {}
  return ok({ ok: true, status: "REJECTED", message: "Venue rejected." });
}
