import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { apiError } from "@/lib/api";
import { curatedCollectionPatchSchema, idParamSchema, parseBody, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

function toPatchData(data: Record<string, unknown>) {
  const next = { ...data } as Record<string, unknown>;
  if ("publishStartsAt" in next) next.publishStartsAt = next.publishStartsAt ? new Date(String(next.publishStartsAt)) : null;
  if ("publishEndsAt" in next) next.publishEndsAt = next.publishEndsAt ? new Date(String(next.publishEndsAt)) : null;
  return next;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const parsedParams = idParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid collection id", zodDetails(parsedParams.error));
    const parsed = curatedCollectionPatchSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const patchData = toPatchData(parsed.data);
    const updated = await db.curatedCollection.update({
      where: { id: parsedParams.data.id },
      data: patchData,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        isPublished: true,
        publishStartsAt: true,
        publishEndsAt: true,
        homeRank: true,
        showOnHome: true,
        showOnArtwork: true,
        updatedAt: true,
      },
    });
    await logAdminAction({ actorEmail: admin.email, action: "ADMIN_COLLECTION_UPDATED", targetType: "curated_collection", targetId: updated.id, metadata: parsed.data, req });
    return NextResponse.json({ collection: updated });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_curation_collections_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const parsedParams = idParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid collection id", zodDetails(parsedParams.error));

    await db.curatedCollection.delete({ where: { id: parsedParams.data.id } });
    await logAdminAction({ actorEmail: admin.email, action: "ADMIN_COLLECTION_DELETED", targetType: "curated_collection", targetId: parsedParams.data.id, req });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_curation_collections_id_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
