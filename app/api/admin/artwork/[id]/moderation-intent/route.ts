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

  const artwork = await db.artwork.findUnique({
    where: { id: parsedId.data.id },
    select: { id: true, slug: true, deletedAt: true, status: true, isPublished: true },
  });
  if (!artwork) return apiError(404, "not_found", "Artwork not found");

  if (parsedBody.action === "archive") {
    await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: false, deletedAt: artwork.deletedAt ?? new Date(), deletedReason: "Archived by admin moderation" } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artwork.moderation_intent", targetType: "artwork", targetId: artwork.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "ARCHIVED", message: "Artwork archived." });
  }

  if (parsedBody.action === "restore") {
    await db.artwork.update({ where: { id: artwork.id }, data: { deletedAt: null, deletedReason: null } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artwork.moderation_intent", targetType: "artwork", targetId: artwork.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "DRAFT", message: "Artwork restored." });
  }

  if (parsedBody.action === "approve_publish") {
    if (artwork.isPublished || artwork.status === "PUBLISHED") {
      return ok({ ok: true, status: "PUBLISHED", message: "Already published." });
    }
    await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: true, status: "PUBLISHED" } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artwork.moderation_intent", targetType: "artwork", targetId: artwork.id, metadata: { action: parsedBody.action } } });
    try {
      const submission = await db.submission.findFirst({
        where: { type: "ARTWORK", note: { startsWith: `artworkId:${artwork.id}` } },
        orderBy: { createdAt: "desc" },
        select: { submitter: { select: { id: true, email: true } } },
      });
      if (submission?.submitter) {
        await enqueueNotification({
          type: "SUBMISSION_APPROVED",
          toEmail: submission.submitter.email,
          dedupeKey: `moderation-intent:artwork:${artwork.id}:${parsedBody.action}:${Date.now()}`,
          payload: { artworkId: artwork.id, action: parsedBody.action },
        });
      }
    } catch {}
    return ok({ ok: true, status: "PUBLISHED", message: "Artwork approved and published.", publicUrl: artwork.slug ? `/artwork/${artwork.slug}` : undefined });
  }

  if (parsedBody.action === "unpublish") {
    await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: false, status: "DRAFT" } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artwork.moderation_intent", targetType: "artwork", targetId: artwork.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "DRAFT", message: "Artwork unpublished." });
  }

  if (parsedBody.action === "request_changes") {
    await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: false, status: "CHANGES_REQUESTED", deletedReason: `Changes requested: ${parsedBody.reason}` } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artwork.moderation_intent", targetType: "artwork", targetId: artwork.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } } });
    try {
      const submission = await db.submission.findFirst({
        where: { type: "ARTWORK", note: { startsWith: `artworkId:${artwork.id}` } },
        orderBy: { createdAt: "desc" },
        select: { submitter: { select: { id: true, email: true } } },
      });
      if (submission?.submitter) {
        await enqueueNotification({
          type: "SUBMISSION_REJECTED",
          toEmail: submission.submitter.email,
          dedupeKey: `moderation-intent:artwork:${artwork.id}:${parsedBody.action}:${Date.now()}`,
          payload: { artworkId: artwork.id, action: parsedBody.action, reason: parsedBody.reason },
        });
      }
    } catch {}
    return ok({ ok: true, status: "CHANGES_REQUESTED", message: "Changes requested." });
  }

  await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: false, status: "REJECTED", deletedReason: `Rejected: ${parsedBody.reason}` } });
  await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artwork.moderation_intent", targetType: "artwork", targetId: artwork.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } } });
  try {
    const submission = await db.submission.findFirst({
      where: { type: "ARTWORK", note: { startsWith: `artworkId:${artwork.id}` } },
      orderBy: { createdAt: "desc" },
      select: { submitter: { select: { id: true, email: true } } },
    });
    if (submission?.submitter) {
      await enqueueNotification({
        type: "SUBMISSION_REJECTED",
        toEmail: submission.submitter.email,
        dedupeKey: `moderation-intent:artwork:${artwork.id}:${parsedBody.action}:${Date.now()}`,
        payload: { artworkId: artwork.id, action: parsedBody.action, reason: parsedBody.reason },
      });
    }
  } catch {}
  return ok({ ok: true, status: "REJECTED", message: "Artwork rejected." });
}
