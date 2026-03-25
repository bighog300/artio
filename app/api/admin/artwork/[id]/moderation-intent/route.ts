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

  const artwork = await db.artwork.findUnique({ where: { id: parsedId.data.id }, select: { id: true, slug: true, deletedAt: true } });
  if (!artwork) return apiError(404, "not_found", "Artwork not found");

  if (parsedBody.action === "archive") {
    await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: false, deletedAt: artwork.deletedAt ?? new Date(), deletedReason: "Archived by admin moderation" } });
    return ok({ ok: true, status: "ARCHIVED", message: "Artwork archived." });
  }

  if (parsedBody.action === "restore") {
    await db.artwork.update({ where: { id: artwork.id }, data: { deletedAt: null, deletedReason: null } });
    return ok({ ok: true, status: "DRAFT", message: "Artwork restored." });
  }

  if (parsedBody.action === "approve_publish") {
    await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: true, status: "PUBLISHED" } });
    return ok({ ok: true, status: "PUBLISHED", message: "Artwork approved and published.", publicUrl: artwork.slug ? `/artwork/${artwork.slug}` : undefined });
  }

  if (parsedBody.action === "unpublish") {
    await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: false, status: "DRAFT" } });
    return ok({ ok: true, status: "DRAFT", message: "Artwork unpublished." });
  }

  if (parsedBody.action === "request_changes") {
    await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: false, status: "CHANGES_REQUESTED", deletedReason: `Changes requested: ${parsedBody.reason}` } });
    return ok({ ok: true, status: "CHANGES_REQUESTED", message: "Changes requested." });
  }

  await db.artwork.update({ where: { id: artwork.id }, data: { isPublished: false, status: "REJECTED", deletedReason: `Rejected: ${parsedBody.reason}` } });
  return ok({ ok: true, status: "REJECTED", message: "Artwork rejected." });
}
