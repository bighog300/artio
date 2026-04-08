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

  const artist = await db.artist.findUnique({
    where: { id: parsedId.data.id },
    select: { id: true, slug: true, deletedAt: true, status: true, isPublished: true },
  });
  if (!artist) return apiError(404, "not_found", "Artist not found");

  if (parsedBody.action === "archive") {
    await db.artist.update({ where: { id: artist.id }, data: { deletedAt: artist.deletedAt ?? new Date() } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "ARCHIVED", message: "Artist archived." });
  }

  if (parsedBody.action === "restore") {
    await db.artist.update({ where: { id: artist.id }, data: { status: "DRAFT", deletedAt: null, deletedReason: null } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "DRAFT", message: "Artist restored." });
  }

  if (parsedBody.action === "approve_publish") {
    if (artist.isPublished || artist.status === "PUBLISHED") {
      return ok({ ok: true, status: "PUBLISHED", message: "Already published." });
    }
    await db.artist.update({ where: { id: artist.id }, data: { status: "PUBLISHED", isPublished: true } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action } } });
    try {
      const submission = await db.submission.findFirst({
        where: { targetArtistId: artist.id, type: "ARTIST" },
        orderBy: { createdAt: "desc" },
        select: { submitter: { select: { id: true, email: true } } },
      });
      if (submission?.submitter) {
        await enqueueNotification({
          type: "SUBMISSION_APPROVED",
          toEmail: submission.submitter.email,
          dedupeKey: `moderation-intent:artist:${artist.id}:${parsedBody.action}:${Date.now()}`,
          payload: { artistId: artist.id, action: parsedBody.action },
        });
      }
    } catch {}
    return ok({ ok: true, status: "PUBLISHED", message: "Artist approved and published.", publicUrl: artist.slug ? `/artists/${artist.slug}` : undefined });
  }

  if (parsedBody.action === "unpublish") {
    await db.artist.update({ where: { id: artist.id }, data: { status: "DRAFT", isPublished: false } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "DRAFT", message: "Artist unpublished." });
  }

  if (parsedBody.action === "request_changes") {
    await db.artist.update({ where: { id: artist.id }, data: { status: "CHANGES_REQUESTED", isPublished: false, reviewNotes: parsedBody.reason } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } } });
    try {
      const submission = await db.submission.findFirst({
        where: { targetArtistId: artist.id, type: "ARTIST" },
        orderBy: { createdAt: "desc" },
        select: { submitter: { select: { id: true, email: true } } },
      });
      if (submission?.submitter) {
        await enqueueNotification({
          type: "SUBMISSION_REJECTED",
          toEmail: submission.submitter.email,
          dedupeKey: `moderation-intent:artist:${artist.id}:${parsedBody.action}:${Date.now()}`,
          payload: { artistId: artist.id, action: parsedBody.action, reason: parsedBody.reason },
        });
      }
    } catch {}
    return ok({ ok: true, status: "CHANGES_REQUESTED", message: "Changes requested." });
  }

  await db.artist.update({ where: { id: artist.id }, data: { status: "REJECTED", isPublished: false, reviewNotes: parsedBody.reason } });
  await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } } });
  try {
    const submission = await db.submission.findFirst({
      where: { targetArtistId: artist.id, type: "ARTIST" },
      orderBy: { createdAt: "desc" },
      select: { submitter: { select: { id: true, email: true } } },
    });
    if (submission?.submitter) {
      await enqueueNotification({
        type: "SUBMISSION_REJECTED",
        toEmail: submission.submitter.email,
        dedupeKey: `moderation-intent:artist:${artist.id}:${parsedBody.action}:${Date.now()}`,
        payload: { artistId: artist.id, action: parsedBody.action, reason: parsedBody.reason },
      });
    }
  } catch {}
  return ok({ ok: true, status: "REJECTED", message: "Artist rejected." });
}
