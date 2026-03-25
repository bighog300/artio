import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { ok, parseModerationIntentBody, requireModerationAdmin } from "@/lib/admin-moderation-intent";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireModerationAdmin();
  if ("error" in adminCheck) return adminCheck.error;

  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  const parsedBody = await parseModerationIntentBody(req);
  if ("error" in parsedBody) return parsedBody.error;

  const venue = await db.venue.findUnique({ where: { id: parsedId.data.id }, select: { id: true, slug: true, deletedAt: true } });
  if (!venue) return apiError(404, "not_found", "Venue not found");

  if (parsedBody.action === "archive") {
    await db.venue.update({ where: { id: venue.id }, data: { status: "ARCHIVED", isPublished: false, deletedAt: venue.deletedAt ?? new Date() } });
    return ok({ ok: true, status: "ARCHIVED", message: "Venue archived." });
  }

  if (parsedBody.action === "restore") {
    await db.venue.update({ where: { id: venue.id }, data: { status: "APPROVED", deletedAt: null, deletedReason: null } });
    return ok({ ok: true, status: "APPROVED", message: "Venue restored." });
  }

  if (parsedBody.action === "approve_publish") {
    await db.venue.update({ where: { id: venue.id }, data: { status: "PUBLISHED", isPublished: true, reviewedAt: new Date(), reviewNotes: null } });
    return ok({ ok: true, status: "PUBLISHED", message: "Venue approved and published.", publicUrl: venue.slug ? `/venues/${venue.slug}` : undefined });
  }

  if (parsedBody.action === "unpublish") {
    await db.venue.update({ where: { id: venue.id }, data: { status: "APPROVED", isPublished: false } });
    return ok({ ok: true, status: "APPROVED", message: "Venue unpublished." });
  }

  if (parsedBody.action === "request_changes") {
    await db.venue.update({ where: { id: venue.id }, data: { status: "CHANGES_REQUESTED", isPublished: false, reviewedAt: new Date(), reviewNotes: parsedBody.reason } });
    return ok({ ok: true, status: "CHANGES_REQUESTED", message: "Changes requested." });
  }

  await db.venue.update({ where: { id: venue.id }, data: { status: "REJECTED", isPublished: false, reviewedAt: new Date(), reviewNotes: parsedBody.reason } });
  return ok({ ok: true, status: "REJECTED", message: "Venue rejected." });
}
