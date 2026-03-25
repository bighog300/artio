import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { ok, parseModerationIntentBody, requireModerationAdmin } from "@/lib/admin-moderation-intent";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireModerationAdmin();
  if ("error" in adminCheck) return adminCheck.error;

  const actor = await requireAdmin();

  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  const parsedBody = await parseModerationIntentBody(req);
  if ("error" in parsedBody) return parsedBody.error;

  const artist = await db.artist.findUnique({ where: { id: parsedId.data.id }, select: { id: true, slug: true, deletedAt: true } });
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
    await db.artist.update({ where: { id: artist.id }, data: { status: "PUBLISHED", isPublished: true } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "PUBLISHED", message: "Artist approved and published.", publicUrl: artist.slug ? `/artists/${artist.slug}` : undefined });
  }

  if (parsedBody.action === "unpublish") {
    await db.artist.update({ where: { id: artist.id }, data: { status: "DRAFT", isPublished: false } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action } } });
    return ok({ ok: true, status: "DRAFT", message: "Artist unpublished." });
  }

  if (parsedBody.action === "request_changes") {
    await db.artist.update({ where: { id: artist.id }, data: { status: "CHANGES_REQUESTED", isPublished: false, deletedReason: `Changes requested: ${parsedBody.reason}` } });
    await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } } });
    return ok({ ok: true, status: "CHANGES_REQUESTED", message: "Changes requested." });
  }

  await db.artist.update({ where: { id: artist.id }, data: { status: "REJECTED", isPublished: false, deletedReason: `Rejected: ${parsedBody.reason}` } });
  await db.adminAuditLog.create({ data: { actorEmail: actor.email, action: "admin.artist.moderation_intent", targetType: "artist", targetId: artist.id, metadata: { action: parsedBody.action, reason: parsedBody.reason } } });
  return ok({ ok: true, status: "REJECTED", message: "Artist rejected." });
}
